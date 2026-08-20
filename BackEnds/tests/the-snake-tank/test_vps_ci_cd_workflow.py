"""Tests for VPS CI/CD deploy workflow YAML structure."""
import yaml
import os
import pytest

WORKFLOW_PATH = os.path.join(
    os.path.dirname(__file__),
    "..", "..", "the-snake-tank", "ci", "deploy-vps.yml"
)


@pytest.fixture
def workflow():
    with open(WORKFLOW_PATH) as f:
        # Skip the comment lines before YAML starts
        lines = f.readlines()
    yaml_lines = [l for l in lines if not l.startswith("##")]
    return yaml.safe_load("".join(yaml_lines))


def test_workflow_name(workflow):
    assert workflow["name"] == "Deploy to VPS"


def test_trigger_push_to_main(workflow):
    # PyYAML parses 'on' as boolean True
    push = workflow[True]["push"]
    assert "main" in push["branches"]


def test_trigger_path_filter(workflow):
    push = workflow[True]["push"]
    assert "BackEnds/the-snake-tank/**" in push["paths"]


def test_deploy_job_exists(workflow):
    assert "deploy" in workflow["jobs"]


def test_runs_on_ubuntu(workflow):
    assert workflow["jobs"]["deploy"]["runs-on"] == "ubuntu-latest"


def test_ssh_action_used(workflow):
    steps = workflow["jobs"]["deploy"]["steps"]
    ssh_step = steps[0]
    assert "appleboy/ssh-action" in ssh_step["uses"]


def test_ssh_secrets_referenced(workflow):
    steps = workflow["jobs"]["deploy"]["steps"]
    ssh_step = steps[0]
    with_block = ssh_step["with"]
    assert "secrets.VPS_HOST" in str(with_block["host"])
    assert "secrets.VPS_SSH_KEY" in str(with_block["key"])


def test_ssh_username(workflow):
    steps = workflow["jobs"]["deploy"]["steps"]
    ssh_step = steps[0]
    assert ssh_step["with"]["username"] == "fishtank"


def test_deploy_script_commands(workflow):
    steps = workflow["jobs"]["deploy"]["steps"]
    script = steps[0]["with"]["script"]
    assert "git pull" in script
    assert "pip install --require-hashes -r requirements.txt" in script
    assert "python migrate.py" in script
    assert "systemctl restart" in script
