Switch to a Planning role for this session.

Usage: `/role <role-name>`

Available roles:
- `pm` or `product-manager` — Product Manager: define requirements, scope features, run reviews
- `planner` — Planner: write implementation plans, deploy via orchestrator
- `release` or `release-manager` — Release Manager: verify deployments, triage bugs, sign off features
- `ops` or `ops-engineer` — Ops Engineer: execute setup guides, automate manual steps into skills
- `coordinator` or `coord` — Coordinator: dispatch requests, handle inline tasks, manage role panes

## Steps

1. Parse the argument to determine the role:
   - `pm`, `product-manager`, `product manager` → `product-manager`
   - `planner`, `plan` → `planner`
   - `release`, `release-manager`, `release manager` → `release-manager`
   - `ops`, `ops-engineer`, `ops engineer` → `ops-engineer`
   - `coordinator`, `coord` → `coordinator`
   - If no argument or unrecognized, show the available roles and ask which one

2. Read the agent behavior file:
   - Product Manager: read `agents/product-manager.md`
   - Planner: read `agents/planner.md`
   - Release Manager: read `agents/release-manager.md`
   - Ops Engineer: read `agents/ops-engineer.md`
   - Coordinator: read `agents/coordinator.md`

3. Adopt the role:
   - Tell the user which role is now active
   - Follow all rules defined in the agent file for the rest of this session
   - Summarize the role's scope in 1-2 sentences

4. Update the dashboard status file to reflect the active role:
   ```
   mkdir -p /Users/guppy/FishTank/Planning/logs/.status && echo "{\"plan\":\"<role-name>\",\"status\":\"running\",\"agent_type\":\"<role-name>\",\"started_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"pid\":$PPID,\"input_tokens\":0,\"output_tokens\":0,\"model\":\"opus\"}" > /Users/guppy/FishTank/Planning/logs/.status/<role-name>.json
   ```

5. Run the role's initialization:
   - **Product Manager:** Check for existing PRDs in `docs/prds/` and in-progress features. Ask what feature to work on.
   - **Planner:** Check for approved PRDs (`Status: approved`) that don't have implementation plans yet. Call `get_active_plans()`. Suggest writing plans for any approved PRDs.
   - **Release Manager:** Call `get_active_plans()` and `get_open_bugs()`. Check `logs/.status/` for recent agent results. Present deployment status summary.
   - **Ops Engineer:** List setup guides in `docs/setup/`. Present available guides and ask which to execute, or offer to create a new one.
   - **Coordinator:** Follow the coordinator session startup procedure from `agents/coordinator.md` — run `feature-tracker.py --summary --active`, check bugs, check active plans, present highlights, and ask what to work on.
