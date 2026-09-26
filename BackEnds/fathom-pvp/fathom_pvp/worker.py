from __future__ import annotations

import hashlib, json, os, queue, selectors, subprocess, threading, time
from pathlib import Path
from typing import Any
from uuid import uuid4

class WorkerUnavailable(RuntimeError): pass
class WorkerRejected(ValueError):
    def __init__(self, error: dict[str, Any]): self.error=error; super().__init__(str(error.get("message","snapshot rejected")))

def verify_artifact(root: Path, expected: str) -> None:
    metadata=json.loads((root/"artifact.json").read_text(encoding="utf-8")); inventory=metadata.get("inventory")
    if not isinstance(inventory,list) or not inventory: raise WorkerUnavailable("artifact inventory is missing")
    digest_rows=[]; seen=set(); resolved_root=root.resolve()
    for item in inventory:
        relative=item.get("file"); declared=item.get("sha256")
        path=Path(relative) if isinstance(relative,str) else Path("/")
        if not isinstance(relative,str) or path.is_absolute() or ".." in path.parts or relative in seen or not isinstance(declared,str): raise WorkerUnavailable("unsafe artifact inventory")
        seen.add(relative); candidate=root/path
        if candidate.is_symlink() or not candidate.is_file() or resolved_root not in candidate.resolve().parents: raise WorkerUnavailable("artifact inventory escapes root")
        data=candidate.read_bytes()
        if hashlib.sha256(data).hexdigest()!=declared: raise WorkerUnavailable(f"artifact digest mismatch: {relative}")
        digest_rows.append(f"{relative}\0{declared}")
    actual_files=set()
    for candidate in root.rglob("*"):
        if candidate.name=="artifact.json":continue
        if candidate.is_symlink():raise WorkerUnavailable("artifact contains an unlisted symlink")
        if candidate.is_file():actual_files.add(candidate.relative_to(root).as_posix())
    if actual_files!=seen:raise WorkerUnavailable("artifact inventory does not exactly cover executable inputs")
    actual="sha256:"+hashlib.sha256("\0".join(digest_rows).encode()).hexdigest()
    if actual!=expected: raise WorkerUnavailable("artifact closure digest mismatch")

class _Process:
    def __init__(self,node:str,root:Path,timeout:float): self.command=[node,"--max-old-space-size=128",str(root/"scripts"/"pvp-worker.mjs")]; self.timeout=timeout; self.lock=threading.Lock(); self.process=None; self._start()
    def _start(self)->None:
        env={k:os.environ[k] for k in ("PATH","LANG") if k in os.environ}; env["NODE_NO_WARNINGS"]="1"
        self.process=subprocess.Popen(self.command,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,bufsize=0,env=env)
        os.set_blocking(self.process.stdin.fileno(),False); os.set_blocking(self.process.stdout.fileno(),False)
    def _restart(self)->None:
        if self.process and self.process.poll() is None: self.process.kill(); self.process.wait()
        self._start()
    def call(self,op:str,ruleset_id:str,**fields:Any)->dict[str,Any]:
        with self.lock:
            if self.process is None or self.process.poll() is not None:self._start()
            rid=str(uuid4()); output=json.dumps({"requestId":rid,"op":op,"rulesetId":ruleset_id,**fields},separators=(",",":")).encode()+b"\n"
            deadline=time.monotonic()+self.timeout; offset=0; received=bytearray(); sel=selectors.DefaultSelector(); sel.register(self.process.stdin,selectors.EVENT_WRITE)
            try:
                while offset<len(output):
                    if not sel.select(max(0,deadline-time.monotonic())): raise WorkerUnavailable("worker write timed out")
                    offset+=os.write(self.process.stdin.fileno(),output[offset:])
                sel.unregister(self.process.stdin); sel.register(self.process.stdout,selectors.EVENT_READ)
                while b"\n" not in received:
                    if not sel.select(max(0,deadline-time.monotonic())): raise WorkerUnavailable("worker response timed out")
                    chunk=os.read(self.process.stdout.fileno(),65_536)
                    if not chunk: raise WorkerUnavailable("worker exited")
                    received.extend(chunk)
                    if len(received)>2_097_152: raise WorkerUnavailable("worker response exceeded 2 MiB")
            except (OSError,WorkerUnavailable): self._restart(); raise
            finally: sel.close()
            try: response=json.loads(received.split(b"\n",1)[0])
            except json.JSONDecodeError: self._restart(); raise WorkerUnavailable("worker returned invalid JSON") from None
            if response.get("protocolVersion")!=1 or response.get("requestId")!=rid: self._restart(); raise WorkerUnavailable("worker protocol mismatch")
            if response.get("ok") is not True: raise WorkerRejected(response.get("error") or {})
            return response
    def close(self)->None:
        if self.process and self.process.poll() is None:
            self.process.terminate()
            try:self.process.wait(timeout=1)
            except subprocess.TimeoutExpired:self.process.kill()

class WorkerPool:
    def __init__(self,node:str,_worker:Path,artifact:Path,expected:str,timeout:float,size:int):
        verify_artifact(artifact,expected); self.timeout=timeout; self.workers=queue.Queue(size)
        for _ in range(size):self.workers.put(_Process(node,artifact,timeout))
    def call(self,op:str,ruleset_id:str,**fields:Any)->dict[str,Any]:
        try:worker=self.workers.get(timeout=self.timeout)
        except queue.Empty:raise WorkerUnavailable("worker queue is full") from None
        try:return worker.call(op,ruleset_id,**fields)
        finally:self.workers.put(worker)
    def close(self)->None:
        while not self.workers.empty():self.workers.get().close()
