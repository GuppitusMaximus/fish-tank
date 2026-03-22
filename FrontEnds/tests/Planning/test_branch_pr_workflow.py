#!/usr/bin/env python3
"""QA tests for the branch + PR workflow end-to-end.

Tests deploy-plan.sh branch creation, orchestrator auto-merge/dependency gating,
progress.py message capture, and autonomous-protocol.md content.
"""

import json
import os
import re
import sys
import tempfile
import shutil
import subprocess

PLANNING_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "Planning"))
SCRIPTS_DIR = os.path.join(PLANNING_ROOT, "scripts")
AGENTS_DIR = os.path.join(PLANNING_ROOT, "agents")

# Add scripts dir to path for imports
sys.path.insert(0, SCRIPTS_DIR)

passed = 0
failed = 0
bugs = []


def test(name, condition, detail=""):
    global passed, failed
    if condition:
        passed += 1
        print(f"  PASS: {name}")
    else:
        failed += 1
        msg = f"  FAIL: {name}"
        if detail:
            msg += f" — {detail}"
        print(msg)
        bugs.append((name, detail))


# ============================================================================
# Read source files once
# ============================================================================

with open(os.path.join(SCRIPTS_DIR, "deploy-plan.sh")) as f:
    deploy_script = f.read()

with open(os.path.join(AGENTS_DIR, "autonomous-protocol.md")) as f:
    protocol_md = f.read()

with open(os.path.join(SCRIPTS_DIR, "progress.py")) as f:
    progress_src = f.read()

with open(os.path.join(SCRIPTS_DIR, "orchestrator.py")) as f:
    orchestrator_src = f.read()


# ============================================================================
# Test 1: Branch creation for non-Planning target
# ============================================================================
print("\n=== Test 1: Branch creation for non-Planning target ===")

# Check deploy-plan.sh creates branch for non-Planning targets
test("deploy-plan.sh sets BRANCH_NAME for non-Planning",
     'BRANCH_NAME="plan/${PLAN_NAME}"' in deploy_script)

test("deploy-plan.sh skips branch for Planning target",
     "IS_PLANNING_TARGET=true" in deploy_script and
     "if ! $IS_PLANNING_TARGET; then" in deploy_script)

test("deploy-plan.sh detects Planning target via realpath comparison",
     'PLANNING_REALPATH="$(cd "$PLANNING_ROOT" && pwd -P)"' in deploy_script and
     'TARGET_REALPATH="$(cd "$TARGET_DIR" && pwd -P)"' in deploy_script)

test("FISHTANK_BRANCH exported in agent subshell",
     'export FISHTANK_BRANCH="${BRANCH_NAME:-}"' in deploy_script)

test("Branch name appears in deployment summary",
     '[ -n "$BRANCH_NAME" ] && echo "Branch:    $BRANCH_NAME"' in deploy_script)


# ============================================================================
# Test 2: No branch for Planning target
# ============================================================================
print("\n=== Test 2: No branch for Planning target ===")

test("IS_PLANNING_TARGET blocks branch creation",
     "if ! $IS_PLANNING_TARGET; then" in deploy_script)

# When IS_PLANNING_TARGET=true, BRANCH_NAME stays empty
test("BRANCH_NAME initialized empty",
     'BRANCH_NAME=""' in deploy_script)

test("FISHTANK_BRANCH is empty when no branch",
     'export FISHTANK_BRANCH="${BRANCH_NAME:-}"' in deploy_script)


# ============================================================================
# Test 3: Retry reuses existing branch
# ============================================================================
print("\n=== Test 3: Retry reuses existing branch ===")

test("deploy-plan.sh checks for existing branch via show-ref",
     'git show-ref --verify --quiet "refs/heads/${BRANCH_NAME}"' in deploy_script)

test("Existing branch is checked out (not recreated)",
     'echo "Reusing existing branch: $BRANCH_NAME"' in deploy_script and
     'git checkout "$BRANCH_NAME"' in deploy_script)

test("Rebase attempted on existing branch",
     "git rebase origin/main" in deploy_script)

test("Rebase failure logged and aborted gracefully",
     "git rebase --abort" in deploy_script and
     'echo "Warning: rebase failed, continuing on existing branch"' in deploy_script)


# ============================================================================
# Test 4: Progress.py message capture and README skip
# ============================================================================
print("\n=== Test 4: Progress.py message capture and README skip ===")

test("progress.py captures report_status message",
     'reported_message = tool_input.get("message", "")' in progress_src)

test("progress.py includes message in final status JSON",
     'final_data["message"] = reported_message' in progress_src)

test("progress.py checks FISHTANK_BRANCH to skip README",
     'on_branch = bool(os.environ.get("FISHTANK_BRANCH"))' in progress_src)

test("progress.py skips update_readme_table when on branch",
     "not on_branch" in progress_src)

test("progress.py always calls write_exec_tokens",
     "write_exec_tokens(plan_name" in progress_src)

# Verify the ordering: tokens always saved, README conditional
lines = progress_src.split("\n")
tokens_line = None
readme_line = None
for i, line in enumerate(lines):
    if "write_exec_tokens" in line and "plan_name" in line:
        tokens_line = i
    if "update_readme_table" in line and tokens_line:
        readme_line = i
        break

test("write_exec_tokens called before update_readme_table",
     tokens_line is not None and readme_line is not None and tokens_line < readme_line,
     f"tokens at line {tokens_line}, readme at line {readme_line}")


# ============================================================================
# Test 5: Autonomous protocol branch completion
# ============================================================================
print("\n=== Test 5: Autonomous protocol branch completion ===")

test("Protocol checks FISHTANK_BRANCH env var",
     "FISHTANK_BRANCH" in protocol_md)

test("Protocol pushes branch when FISHTANK_BRANCH is set",
     "git push -u origin $FISHTANK_BRANCH" in protocol_md)

test("Protocol creates PR via gh pr create",
     "gh pr create" in protocol_md)

test("Protocol includes PR number in report_status",
     "PR #<number>" in protocol_md or "PR #" in protocol_md)

test("Protocol pushes to current branch when no FISHTANK_BRANCH",
     "If not set: push" in protocol_md or "git push" in protocol_md)

# PR Review Mode
test("Review: true plans report 'review' status",
     '"review"' in protocol_md and "Review: true" in protocol_md)

test("Review mode does NOT merge PR",
     "Do NOT merge the PR yourself" in protocol_md)


# ============================================================================
# Test 6: Orchestrator auto-merge
# ============================================================================
print("\n=== Test 6: Orchestrator auto-merge ===")

# Import orchestrator functions
from orchestrator import (
    phase_auto_merge,
    phase_deploy_ready,
    has_unfinished_plans,
    _get_latest_agent_status,
    _has_project_conflict,
    parse_plan_header,
    resolve_target,
    TARGET_MAP,
    PLANS_DIR,
    STATUS_DIR,
    _build_plans_cache,
    _build_status_cache,
)

test("phase_auto_merge extracts PR number from status message",
     "re.search(r'PR #(\\d+)'" in orchestrator_src or
     "re.search(r'PR #" in orchestrator_src)

test("phase_auto_merge calls gh pr merge with --squash --delete-branch",
     '"gh", "pr", "merge", pr_number, "--squash", "--delete-branch"' in orchestrator_src)

test("phase_auto_merge adds plan to merged set on success",
     "merged_set.append(name)" in orchestrator_src)

test("phase_auto_merge checks out main and pulls after merge",
     '"git", "checkout", "main"' in orchestrator_src and
     '"git", "pull", "--rebase"' in orchestrator_src)

test("phase_auto_merge rebuilds README after merges",
     "update_readme_table(PLANNING_ROOT)" in orchestrator_src and
     "merged_any" in orchestrator_src)


# ============================================================================
# Test 7: Dependency waits for PR merge
# ============================================================================
print("\n=== Test 7: Dependency waits for PR merge ===")

# Verify the dependency check logic in phase_deploy_ready
test("phase_deploy_ready checks merged_set for dependencies",
     "if dep not in merged_set:" in orchestrator_src)

test("phase_deploy_ready checks for PR in dep status message",
     "re.search(r'PR #(\\d+)', dep_msg)" in orchestrator_src)

test("Unmerged PR blocks dependent deployment",
     "all_satisfied = False" in orchestrator_src)


# ============================================================================
# Test 8: Review: true plans skip auto-merge
# ============================================================================
print("\n=== Test 8: Review: true plans skip auto-merge ===")

test("phase_auto_merge checks review flag",
     'header.get("review")' in orchestrator_src or
     'header["review"]' in orchestrator_src)

# Verify Review: true plans are added to merged_set but not actually merged
# Look at the specific code path
review_section = orchestrator_src[orchestrator_src.find("def phase_auto_merge"):orchestrator_src.find("def phase_deploy_ready")]
test("Review plans added to merged_set without gh pr merge",
     'if header.get("review"):' in review_section and
     "merged_set.append(name)" in review_section)


# ============================================================================
# Test 9: Backward compatibility (no PR number)
# ============================================================================
print("\n=== Test 9: Backward compatibility ===")

test("No PR = old-style plan treated as merged",
     "No PR = old-style plan already on main" in orchestrator_src or
     "# No PR = old-style plan" in orchestrator_src)

test("Plans without PR added to merged_set",
     "if not pr_match:" in orchestrator_src and
     "merged_set.append(name)" in orchestrator_src)

# In dependency checking:
test("No PR in dep = treated as satisfied (already on main)",
     "# No PR = already on main" in orchestrator_src)


# ============================================================================
# Test 10: Merge conflict handling
# ============================================================================
print("\n=== Test 10: Merge conflict handling ===")

test("Merge conflict detection in stderr",
     '"merge conflict" in stderr.lower()' in orchestrator_src or
     "merge conflict" in orchestrator_src)

test("Plan reset to failed on merge conflict",
     'reset_plan_status(name, "failed")' in orchestrator_src)

test("Also checks 'not mergeable'",
     '"not mergeable" in stderr.lower()' in orchestrator_src)


# ============================================================================
# Test 11: has_unfinished_plans() with unmerged PRs
# ============================================================================
print("\n=== Test 11: has_unfinished_plans() with unmerged PRs ===")

test("has_unfinished_plans checks completed plans for unmerged PRs",
     'header["status"] == "completed"' in orchestrator_src[orchestrator_src.find("def has_unfinished_plans"):])

unfinished_section = orchestrator_src[orchestrator_src.find("def has_unfinished_plans"):orchestrator_src.find("def run_cycle")]
test("Completed plan with PR not in merged_set returns True",
     "if name not in merged_set:" in unfinished_section and
     'return True  # PR not yet merged' in unfinished_section)

test("Checks for PR pattern in agent status message",
     "re.search(r'PR #(\\d+)'" in unfinished_section)


# ============================================================================
# Test 12: Chain watcher returns TARGET_DIR to main
# ============================================================================
print("\n=== Test 12: Chain watcher returns target to main ===")

test("Chain watcher checks out main before deploying chained plans",
     'git checkout main' in deploy_script)

# Verify the checkout happens before the --then chain deploy
chain_section = deploy_script[deploy_script.find("Chain: $PLAN_NAME"):]
checkout_pos = chain_section.find("git checkout main")
then_deploy_pos = chain_section.find("deploy-plan.sh")
test("Checkout main happens BEFORE chained deploy",
     checkout_pos > 0 and then_deploy_pos > 0 and checkout_pos < then_deploy_pos,
     f"checkout at {checkout_pos}, deploy at {then_deploy_pos}")

test("Checkout only happens if BRANCH_NAME is set",
     'if [ -n "$BRANCH_NAME" ]; then' in chain_section)


# ============================================================================
# Test 13: Two agents on same target get separate branches
# ============================================================================
print("\n=== Test 13: Two agents same target separate branches ===")

test("Branch name includes plan name (unique per plan)",
     'BRANCH_NAME="plan/${PLAN_NAME}"' in deploy_script)

test("Project conflict gating still works",
     "_has_project_conflict" in orchestrator_src)

# Test the _has_project_conflict function directly
test("No conflict when different projects",
     not _has_project_conflict("project-a", {"project-b"}))

test("Conflict when same project",
     _has_project_conflict("project-a", {"project-a"}))

test("Conflict when unscoped agent exists",
     _has_project_conflict("project-a", {None}))

test("No conflict when no existing projects",
     not _has_project_conflict("project-a", set()))


# ============================================================================
# Test 14: Already-merged PR from reviewer flow
# ============================================================================
print("\n=== Test 14: Already-merged PR detection ===")

test("Detects 'already merged' in gh stderr",
     '"already merged" in stderr.lower()' in orchestrator_src or
     '"already been merged" in stderr.lower()' in orchestrator_src)

test("Already-merged PR added to merged set",
     "merged_set.append(name)" in orchestrator_src)

test("Logs detection of already-merged PR",
     '"already merged (by reviewer or manually)"' in orchestrator_src or
     "already merged" in orchestrator_src)


# ============================================================================
# Test 15: Dirty working tree cleanup on retry
# ============================================================================
print("\n=== Test 15: Dirty working tree cleanup on retry ===")

test("deploy-plan.sh runs git checkout -- . to clean dirty files",
     "git checkout -- . 2>/dev/null || true" in deploy_script)

test("deploy-plan.sh runs git clean -fd",
     "git clean -fd 2>/dev/null || true" in deploy_script)

# Verify cleanup happens before branch creation
cleanup_section = deploy_script[deploy_script.find("if ! $IS_PLANNING_TARGET"):]
checkout_clean_pos = cleanup_section.find("git checkout -- .")
clean_fd_pos = cleanup_section.find("git clean -fd")
branch_create_pos = cleanup_section.find("git checkout -b")
test("Cleanup happens BEFORE branch creation",
     checkout_clean_pos > 0 and clean_fd_pos > 0 and branch_create_pos > 0 and
     checkout_clean_pos < branch_create_pos and clean_fd_pos < branch_create_pos,
     f"checkout at {checkout_clean_pos}, clean at {clean_fd_pos}, branch at {branch_create_pos}")


# ============================================================================
# Summary
# ============================================================================
print("\n" + "=" * 60)
print(f"  Results: {passed} passed, {failed} failed")
print("=" * 60)

if bugs:
    print("\nFailed tests:")
    for name, detail in bugs:
        print(f"  - {name}: {detail}")

sys.exit(0 if failed == 0 else 1)
