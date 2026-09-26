import importlib.util
import io
import json
import tarfile
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location("bundle", Path(__file__).parents[1] / "deploy/bundle.py")
bundle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bundle)


def sources(tmp_path):
    backend = tmp_path / "source"
    (backend / "fathom_pvp").mkdir(parents=True)
    (backend / "fathom_pvp/app.py").write_text("app = None\n")
    (backend / "requirements.txt").write_text("pinned\n")
    (backend / ".env").write_text("DO_NOT_SHIP=secret\n")
    (backend / ".venv").mkdir()
    (backend / ".venv/secret").write_text("not source")
    rules = tmp_path / "rules"
    rules.mkdir()
    (rules / "manifest.json").write_text('{"schemaVersion":4}')
    (rules / "worker.mjs").write_text("// pinned source\n")
    return backend, rules


def test_round_trip_contains_only_immutable_sources(tmp_path):
    backend, rules = sources(tmp_path)
    archive = tmp_path / "release.tar.gz"
    checksum = bundle.build(backend, rules, archive, "pvp-test", "a" * 40)
    installed = bundle.install(archive, checksum, tmp_path / "releases")
    metadata = json.loads((installed / "bundle.json").read_text())
    assert metadata["backendCommit"] == "a" * 40
    assert metadata["files"] == bundle.inventory(installed)
    assert not (installed / "backend/.env").exists()
    assert not (installed / "backend/.venv").exists()
    assert (installed / "rules/worker.mjs").read_text() == "// pinned source\n"
    with pytest.raises(ValueError, match="already exists"):
        bundle.install(archive, checksum, tmp_path / "releases")


def test_checksum_and_file_inventory_are_independent_checks(tmp_path):
    backend, rules = sources(tmp_path)
    archive = tmp_path / "release.tar.gz"
    bundle.build(backend, rules, archive, "release", "b" * 40)
    with pytest.raises(ValueError, match="checksum"):
        bundle.install(archive, "0" * 64, tmp_path / "releases")
    corrupt = tmp_path / "corrupt.tar.gz"
    with tarfile.open(archive) as source, tarfile.open(corrupt, "w:gz") as target:
        for member in source.getmembers():
            data = source.extractfile(member).read()
            if member.name == "rules/worker.mjs":
                data = b"// substituted code\n"
                member.size = len(data)
            target.addfile(member, io.BytesIO(data))
    with pytest.raises(ValueError, match="inventory"):
        bundle.install(corrupt, bundle.digest(corrupt), tmp_path / "releases")


@pytest.mark.parametrize("name,link", [("../escape", False), ("/absolute", False), ("worker", True)])
def test_unsafe_archive_members_are_rejected(tmp_path, name, link):
    archive = tmp_path / "unsafe.tar.gz"
    with tarfile.open(archive, "w:gz") as stream:
        member = tarfile.TarInfo(name)
        if link:
            member.type = tarfile.SYMTYPE
            member.linkname = "/etc/passwd"
        stream.addfile(member, io.BytesIO())
    with pytest.raises(ValueError, match="unsafe"):
        bundle.install(archive, bundle.digest(archive), tmp_path / "releases")


def test_source_symlinks_fail_before_packaging(tmp_path):
    backend, rules = sources(tmp_path)
    (rules / "secret").symlink_to(backend / ".env")
    with pytest.raises(ValueError, match="symlink"):
        bundle.build(backend, rules, tmp_path / "bundle.tar.gz", "release", "c" * 40)
