Switch to a Planning role for this session.

Usage: `/role <role-name>`

Available roles:
- `pm` or `product-manager` — Product Manager: define requirements, scope features, run reviews
- `sa` or `solutions-architect` — Solutions Architect: write implementation plans, deploy via orchestrator
- `release` or `release-manager` — Release Manager: verify deployments, triage bugs, sign off features
- `ops` or `ops-engineer` — Ops Engineer: execute setup guides, automate manual steps into skills
- `coordinator` or `coord` — Coordinator: dispatch requests, handle inline tasks, manage role panes
- `tech-lead` or `tl` — Technical Lead: scope PRDs, classify feature size, run reviews

## Steps

1. Parse the argument to determine the role:
   - `pm`, `product-manager`, `product manager` → `product-manager`
   - `sa`, `solutions-architect` → `solutions-architect`
   - `release`, `release-manager`, `release manager` → `release-manager`
   - `ops`, `ops-engineer`, `ops engineer` → `ops-engineer`
   - `coordinator`, `coord` → `coordinator`
   - `tech-lead`, `tl`, `technical-lead` → `technical-lead`
   - If no argument or unrecognized, show the available roles and ask which one

2. Read the agent behavior file:
   - Product Manager: read `agents/product-manager.md`
   - Solutions Architect: read `agents/solutions-architect.md`
   - Release Manager: read `agents/release-manager.md`
   - Ops Engineer: read `agents/ops-engineer.md`
   - Coordinator: read `agents/coordinator.md`
   - Technical Lead: read `agents/technical-lead.md`

3. Read the role's memory file (if it exists) for learned patterns from previous sessions:
   - Product Manager: read `memory/product-manager.md`
   - Solutions Architect: read `memory/solutions-architect.md`
   - Release Manager: read `memory/release-manager.md`
   - Ops Engineer: read `memory/ops-engineer.md`
   - Coordinator: read `memory/coordinator.md`
   - Technical Lead: read `memory/technical-lead.md`
   The memory directory is at the auto-memory path shown in MEMORY.md. If the file doesn't exist, skip this step.

4. Adopt the role:
   - Tell the user which role is now active
   - Follow all rules defined in the agent file for the rest of this session
   - Summarize the role's scope in 1-2 sentences

5. Set the tmux pane role variable so the dashboard status hook can identify this session:
   ```
   tmux set-option -p @fishtank_role "<role-name>"
   ```
   The PostToolUse hook will automatically create the dashboard status file on the next tool call.

6. Run the role's initialization:
   - **Product Manager:** Check for existing PRDs in `docs/prds/` and in-progress features. Ask what feature to work on.
   - **Solutions Architect:** Check for approved PRDs (`Status: approved`) that don't have implementation plans yet. Call `get_active_plans()`. Suggest writing plans for any approved PRDs.
   - **Release Manager:** Call `get_active_plans()` and `get_open_bugs()`. Check `logs/.status/` for recent agent results. Present deployment status summary.
   - **Ops Engineer:** List setup guides in `docs/setup/`. Present available guides and ask which to execute, or offer to create a new one.
   - **Coordinator:** Follow the coordinator session startup procedure from `agents/coordinator.md` — run `feature-tracker.py --summary --active`, check bugs, check active plans, present highlights, and ask what to work on.
   - **Technical Lead:** Check for PRDs with `Status: ready-for-scope` in `docs/prds/`. Present any found and ask which to scope.
