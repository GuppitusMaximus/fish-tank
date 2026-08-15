"""
QA tests for data-storage hygiene.

Since the VPS cutover (pipeline writes to Postgres + R2), generated
artifacts are not committed:
- .gitignore blocks .joblib model binaries
- No .joblib files are tracked by git
- Pipeline-generated data files and model meta JSONs are untracked
"""

import subprocess
from pathlib import Path


def _tracked_files():
    result = subprocess.run(
        ['git', 'ls-files'],
        capture_output=True,
        text=True
    )
    return result.stdout.splitlines()


def test_gitignore_blocks_joblib():
    """Verify root .gitignore contains pattern to block .joblib files."""
    repo_root = Path(__file__).parent.parent.parent
    gitignore_path = repo_root / '.gitignore'

    assert gitignore_path.exists(), ".gitignore not found at repo root"

    with open(gitignore_path) as f:
        content = f.read()

    assert 'BackEnds/the-snake-tank/models/*.joblib' in content, \
        ".gitignore missing pattern for model binaries"


def test_gitignore_blocks_generated_artifacts():
    """Verify the-snake-tank .gitignore blocks pipeline-generated files."""
    repo_root = Path(__file__).parent.parent.parent
    gitignore_path = repo_root / 'BackEnds' / 'the-snake-tank' / '.gitignore'

    assert gitignore_path.exists(), "the-snake-tank/.gitignore not found"

    with open(gitignore_path) as f:
        content = f.read()

    assert 'data/' in content, ".gitignore missing data/ pattern"
    assert 'models/*_meta.json' in content, \
        ".gitignore missing model meta JSON pattern"


def test_no_joblib_files_tracked():
    """Verify no .joblib files are tracked by git."""
    joblib_files = [f for f in _tracked_files() if f.endswith('.joblib')]

    assert len(joblib_files) == 0, \
        f"Found {len(joblib_files)} tracked .joblib files: {joblib_files}"


def test_no_generated_data_tracked():
    """Verify pipeline-generated data and meta files are not tracked."""
    tracked = _tracked_files()

    data_files = [
        f for f in tracked
        if f.startswith('BackEnds/the-snake-tank/data/')
        and not f.endswith('.gitkeep')
    ]
    assert len(data_files) == 0, \
        f"Pipeline data files still tracked: {data_files[:10]}"

    meta_files = [
        f for f in tracked
        if f.startswith('BackEnds/the-snake-tank/models/')
        and f.endswith('_meta.json')
    ]
    assert len(meta_files) == 0, \
        f"Model meta files still tracked: {meta_files}"
