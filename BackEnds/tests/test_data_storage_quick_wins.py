"""
QA tests for data-storage-quick-wins plan.

Verifies:
- .gitignore blocks .joblib files in models directory
- No .joblib files are tracked by git
- Cleanup step exists in netatmo.yml with correct retention periods
- Model meta JSON files are still tracked and committed
- Workflow YAML syntax is valid
"""

import subprocess
import re
from pathlib import Path


def test_gitignore_blocks_joblib():
    """Verify .gitignore contains pattern to block .joblib files."""
    repo_root = Path(__file__).parent.parent.parent
    gitignore_path = repo_root / '.gitignore'

    assert gitignore_path.exists(), ".gitignore not found at repo root"

    with open(gitignore_path) as f:
        content = f.read()

    assert 'BackEnds/the-snake-tank/models/*.joblib' in content, \
        ".gitignore missing pattern for model binaries"


def test_no_joblib_files_tracked():
    """Verify no .joblib files are tracked by git."""
    result = subprocess.run(
        ['git', 'ls-files'],
        capture_output=True,
        text=True
    )

    tracked_files = result.stdout.splitlines()
    joblib_files = [f for f in tracked_files if f.endswith('.joblib')]

    assert len(joblib_files) == 0, \
        f"Found {len(joblib_files)} tracked .joblib files: {joblib_files}"


def test_model_meta_json_tracked():
    """Verify model meta JSON files are tracked by git."""
    result = subprocess.run(
        ['git', 'ls-files'],
        capture_output=True,
        text=True
    )

    tracked_files = result.stdout.splitlines()

    expected_meta_files = [
        'the-snake-tank/models/6hr_rc_meta.json',
        'the-snake-tank/models/model_meta.json',
        'the-snake-tank/models/simple_meta.json'
    ]

    for meta_file in expected_meta_files:
        assert meta_file in tracked_files, \
            f"Expected meta file not tracked: {meta_file}"


def test_workflow_cleanup_step_exists():
    """Verify netatmo.yml contains cleanup step with correct retention."""
    repo_root = Path(__file__).parent.parent.parent
    workflow_path = repo_root / '.github' / 'workflows' / 'netatmo.yml'

    assert workflow_path.exists(), "netatmo.yml workflow not found"

    with open(workflow_path) as f:
        content = f.read()

    # Check cleanup step exists
    assert 'Clean up old data files' in content, \
        "Cleanup step not found in workflow"

    # Check 48-hour retention for predictions (2880 minutes)
    assert '-mmin +2880' in content, \
        "48-hour retention for predictions not found"

    # Check 7-day retention for raw readings (10080 minutes)
    assert '-mmin +10080' in content, \
        "7-day retention for raw readings not found"

    # Check safety with || true
    cleanup_section = content[content.find('Clean up old data files'):]
    cleanup_section = cleanup_section[:cleanup_section.find('- name:', 100)]

    find_commands = re.findall(r'find .+', cleanup_section)
    for cmd in find_commands:
        assert '|| true' in cmd or '2>/dev/null' in cmd, \
            f"Find command missing safety: {cmd}"


def test_git_add_excludes_model_binaries():
    """Verify git add line uses models/*.json not models/."""
    repo_root = Path(__file__).parent.parent.parent
    workflow_path = repo_root / '.github' / 'workflows' / 'netatmo.yml'

    with open(workflow_path) as f:
        content = f.read()

    # Find git add line
    git_add_match = re.search(r'git add .+', content)
    assert git_add_match, "git add command not found in workflow"

    git_add_line = git_add_match.group(0)

    # Should use models/*.json (specific pattern)
    assert 'models/*.json' in git_add_line, \
        "git add should use models/*.json pattern"

    # Should NOT use models/ alone (which would include binaries)
    assert not re.search(r'models/\s', git_add_line), \
        "git add should not use generic models/ path"


def test_workflow_yaml_valid():
    """Verify workflow YAML is syntactically valid."""
    import yaml

    repo_root = Path(__file__).parent.parent.parent
    workflow_path = repo_root / '.github' / 'workflows' / 'netatmo.yml'

    with open(workflow_path) as f:
        try:
            yaml.safe_load(f)
        except yaml.YAMLError as e:
            raise AssertionError(f"Invalid YAML syntax: {e}")
