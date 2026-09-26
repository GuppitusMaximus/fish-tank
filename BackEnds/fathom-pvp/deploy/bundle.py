#!/usr/bin/env python3
"""Build/inspect/install immutable backend + rules bundles; never switch services.

Only named source directories are copied. Secrets, worktree metadata, virtualenvs,
and client artwork are not deployment inputs. The expected archive SHA comes from
the reviewed build, independently of the archive itself.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import tarfile
import tempfile
from pathlib import Path, PurePosixPath

BACKEND_INPUTS = ("fathom_pvp", "migrations", "requirements.txt", "pyproject.toml", "systemd", "deploy")
IGNORED = {"__pycache__", ".pytest_cache", ".git", ".venv", "node_modules"}


def digest(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def inventory(root: Path) -> dict[str, str]:
    files = {}
    for path in sorted(root.rglob("*")):
        if path.is_symlink():
            raise ValueError(f"release contains symlink: {path.relative_to(root)}")
        if path.is_file() and path != root / "bundle.json":
            files[path.relative_to(root).as_posix()] = digest(path)
    return files


def copy_source(source: Path, target: Path) -> None:
    if source.is_symlink():
        raise ValueError(f"source symlink is not permitted: {source}")
    if source.is_dir():
        target.mkdir(parents=True, exist_ok=True)
        for child in source.iterdir():
            if child.name not in IGNORED:
                copy_source(child, target / child.name)
    else:
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)


def build(backend: Path, rules: Path, output: Path, release: str, commit: str) -> str:
    if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}", release):
        raise ValueError("invalid release ID")
    if not re.fullmatch(r"[a-f0-9]{40}", commit):
        raise ValueError("backend commit must be a full SHA")
    if output.exists():
        raise ValueError("output exists; releases are immutable")
    with tempfile.TemporaryDirectory() as temporary:
        root = Path(temporary)
        for name in BACKEND_INPUTS:
            source = backend / name
            if source.exists():
                copy_source(source, root / "backend" / name)
        for required in ("backend/fathom_pvp/app.py", "backend/requirements.txt"):
            if not (root / required).is_file():
                raise ValueError(f"missing {required}")
        copy_source(rules, root / "rules")
        metadata = {"format": 1, "releaseId": release, "backendCommit": commit,
                    "files": inventory(root)}
        (root / "bundle.json").write_text(json.dumps(metadata, sort_keys=True, indent=2) + "\n")
        output.parent.mkdir(parents=True, exist_ok=True)
        with tarfile.open(output, "x:gz") as archive:
            for path in sorted(root.rglob("*")):
                if path.is_file():
                    archive.add(path, arcname=path.relative_to(root).as_posix(), recursive=False)
    return digest(output)


def install(archive: Path, expected_sha: str, releases: Path) -> Path:
    if not re.fullmatch(r"[a-f0-9]{64}", expected_sha) or digest(archive) != expected_sha:
        raise ValueError("archive checksum mismatch")
    releases.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=releases, prefix=".unpack-") as temporary:
        root = Path(temporary)
        with tarfile.open(archive, "r:gz") as bundle:
            members = bundle.getmembers()
            seen = set()
            total = 0
            for member in members:
                path = PurePosixPath(member.name)
                if (not member.isfile() or path.is_absolute() or ".." in path.parts
                        or member.name in seen or member.size > 32 * 1024 * 1024):
                    raise ValueError("bundle contains unsafe or duplicate entries")
                seen.add(member.name)
                total += member.size
            if total > 256 * 1024 * 1024:
                raise ValueError("bundle exceeds unpacked size budget")
            bundle.extractall(root, members=members, filter="data")
        metadata = json.loads((root / "bundle.json").read_text())
        release = metadata.get("releaseId", "")
        if metadata.get("format") != 1 or not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}", release):
            raise ValueError("invalid bundle metadata")
        if metadata.get("files") != inventory(root):
            raise ValueError("bundle file inventory mismatch")
        destination = releases / release
        if destination.exists():
            raise ValueError("release already exists; refusing to modify it")
        root.rename(destination)
    return destination


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    pack = sub.add_parser("build")
    for name in ("backend", "rules", "output"):
        pack.add_argument("--" + name, type=Path, required=True)
    pack.add_argument("--release", required=True)
    pack.add_argument("--backend-commit", required=True)
    unpack = sub.add_parser("install")
    unpack.add_argument("--archive", type=Path, required=True)
    unpack.add_argument("--sha256", required=True)
    unpack.add_argument("--releases", type=Path, default=Path("/opt/fathom-pvp/releases"))
    args = parser.parse_args()
    if args.command == "build":
        print(build(args.backend, args.rules, args.output, args.release, args.backend_commit))
    else:
        print(install(args.archive, args.sha256, args.releases))


if __name__ == "__main__":
    main()
