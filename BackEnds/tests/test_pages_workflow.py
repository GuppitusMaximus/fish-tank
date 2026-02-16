"""
Test suite for GitHub Pages workflow auto-deploy configuration.

Verifies that the Pages workflow correctly triggers after Netatmo weather
data updates, while preserving existing manual and push triggers.

Plan: qa-fix-pages-auto-deploy
"""

import yaml
import pytest
from pathlib import Path


def load_pages_workflow():
    """Load and parse the Pages workflow YAML file."""
    workflow_path = Path(__file__).parent.parent.parent / ".github" / "workflows" / "pages.yml"
    with open(workflow_path, 'r') as f:
        return yaml.safe_load(f)


def test_workflow_run_trigger_exists():
    """Verify workflow_run trigger is present in the Pages workflow."""
    workflow = load_pages_workflow()

    # YAML parses 'on:' as boolean True
    on_section = workflow.get('on', workflow.get(True))
    assert on_section is not None, "Workflow missing 'on' section"
    assert 'workflow_run' in on_section, "Workflow missing 'workflow_run' trigger"


def test_workflow_run_trigger_configuration():
    """Verify workflow_run trigger has correct configuration."""
    workflow = load_pages_workflow()
    # YAML parses 'on:' as boolean True
    on_section = workflow.get('on', workflow.get(True))
    workflow_run = on_section['workflow_run']

    # Verify workflows list
    assert 'workflows' in workflow_run, "workflow_run missing 'workflows' field"
    workflows = workflow_run['workflows']
    assert isinstance(workflows, list), "workflows should be a list"
    assert "Fetch Netatmo Weather Data" in workflows, \
        f"Expected 'Fetch Netatmo Weather Data', got {workflows}"

    # Verify types
    assert 'types' in workflow_run, "workflow_run missing 'types' field"
    types = workflow_run['types']
    assert isinstance(types, list), "types should be a list"
    assert 'completed' in types, f"Expected 'completed' in types, got {types}"

    # Verify branches
    assert 'branches' in workflow_run, "workflow_run missing 'branches' field"
    branches = workflow_run['branches']
    assert isinstance(branches, list), "branches should be a list"
    assert 'main' in branches, f"Expected 'main' in branches, got {branches}"


def test_deploy_job_success_condition():
    """Verify deploy job only runs on successful workflow_run."""
    workflow = load_pages_workflow()

    assert 'jobs' in workflow, "Workflow missing 'jobs' section"
    assert 'deploy' in workflow['jobs'], "Workflow missing 'deploy' job"

    deploy_job = workflow['jobs']['deploy']
    assert 'if' in deploy_job, "deploy job missing 'if' condition"

    # The condition should allow push/workflow_dispatch unconditionally
    # but only allow workflow_run when conclusion is 'success'
    expected_condition = "${{ github.event_name != 'workflow_run' || github.event.workflow_run.conclusion == 'success' }}"
    actual_condition = deploy_job['if']

    assert actual_condition == expected_condition, \
        f"Deploy condition incorrect.\nExpected: {expected_condition}\nActual: {actual_condition}"


def test_original_push_trigger_preserved():
    """Verify original push trigger still exists and is correctly configured."""
    workflow = load_pages_workflow()

    # YAML parses 'on:' as boolean True
    on_section = workflow.get('on', workflow.get(True))
    assert 'push' in on_section, "Original push trigger missing"

    push_trigger = on_section['push']
    assert 'branches' in push_trigger, "push trigger missing 'branches'"
    assert 'main' in push_trigger['branches'], "push trigger missing 'main' branch"

    assert 'paths' in push_trigger, "push trigger missing 'paths'"
    paths = push_trigger['paths']
    assert isinstance(paths, list), "paths should be a list"
    assert 'FrontEnds/the-fish-tank/**' in paths, \
        f"Expected 'FrontEnds/the-fish-tank/**' in paths, got {paths}"


def test_workflow_dispatch_trigger_preserved():
    """Verify manual workflow_dispatch trigger still exists."""
    workflow = load_pages_workflow()

    # YAML parses 'on:' as boolean True
    on_section = workflow.get('on', workflow.get(True))
    assert 'workflow_dispatch' in on_section, \
        "Original workflow_dispatch trigger missing"


def test_yaml_syntax_valid():
    """Verify the workflow YAML is syntactically valid."""
    # This test passes if load_pages_workflow() doesn't raise an exception
    workflow = load_pages_workflow()
    assert workflow is not None, "Failed to parse workflow YAML"
    assert isinstance(workflow, dict), "Workflow should be a dictionary"


if __name__ == "__main__":
    # Run all tests
    pytest.main([__file__, "-v"])
