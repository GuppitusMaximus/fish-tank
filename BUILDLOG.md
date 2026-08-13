# FishTank Build Log

The platform wasn't designed up front — it was discovered by hitting walls. Every entry below
follows the same cycle: build a feature → hit a wall → build the minimum fix → use it → hit the
next wall. Dates are 2026; day numbers count from the platform's first commit.

---

## Day 1 (Feb 13) — The planning hub

Managing AI coding sessions by hand doesn't scale: plans get lost, context resets every session,
nothing tracks what was done. First answer: a planning repo of markdown plans, an MCP server that
serves them as live tools to Claude Code sessions, and a deploy script that spawns autonomous
agents. The deploy script went through **7 revisions in 45 minutes** — every deployment attempt
surfaced a new blocker.

## Day 2 (Feb 14) — The argument for QA

An agent rewrites `weather.js` and **silently deletes a feature**. Nobody notices until manual
testing. The same day, a prediction pipeline fails silently every hour because `|| true` swallows
errors. Both incidents plant the seed for mandatory, automated verification. Agent behavior
profiles are added so frontend and backend agents stop touching each other's code. 40+ plans
deploy in one day — but the human is still the orchestrator.

## Day 3 (Feb 15) — The orchestrator

A feature needs 4 dependent plans; deploying them by hand costs 6 interventions, 3 retries, and
2 hours of babysitting. That evening the orchestrator is built: 352 lines of Python that resolve
plan dependencies as a DAG, deploy agents in parallel, and retry failures automatically. Within
3 hours it deploys 8 plans in parallel with zero human intervention. QA pairing becomes mandatory.

## Day 4 (Feb 16) — Maturity through stress testing

Deliberate failure-mode tests (instant completion, infinite hang, silent stall...) expose that the
dashboard can't tell a dead agent from a thinking one. Health checks and failure cascading are
added — a permanently failed plan now skips its dependents instead of wasting tokens on doomed
work. A 4-hour planning session hits context mush, so the planner splits into separate roles.
The full lifecycle (PRD → scope → plan → deploy → verify) runs end-to-end for the first time.

## Days 5–9 (Feb 17–21) — Autonomous coordination

Agents write to files they shouldn't → a PreToolUse hook now *enforces* write permissions per
agent type instead of documenting them. Manual role-switching becomes the bottleneck → a
coordinator agent classifies intent and dispatches to the right role. State queries across 280+
plan files get slow → a shadow database mirrors the filesystem.

## Days 10–15 (Feb 22–27) — Dedicated compute

A MacBook Air can't run a fleet. A Proxmox homelab server (Ryzen 7 7700, 64GB DDR5, 2TB NVMe)
takes over: a dev VM for agents, LXCs for monitoring and databases. GitHub webhooks replace
polling — push a plan, and an agent starts in under 2 seconds.

## Days 16–22 (Feb 28 – Mar 6) — The knowledge problem

Pipeline agents re-read the same source files 2–4 times each. An exploration cache persists each
agent's findings for the next one. SQLite buckles under concurrent agent writes → PostgreSQL,
with a knowledge graph of components, request flows, dependencies, and data shapes.

## Days 23–30 (Mar 7–14) — Observability

With 4+ agents running in parallel on a remote server, a terminal dashboard isn't enough.
Grafana + Prometheus, fed by a custom exporter: token velocity, step progress, tool-call gaps,
review confidence — all live, with mobile alerts for stalls.

## Days 31–39 (Mar 15–23) — The autonomous pipeline

The full chain is automated: PRD → complexity assessment → scoping agent → planning agent →
approval gate → webhook → parallel deployment. The human participates at exactly two moments.
Agents move to a branch + PR workflow with a read-only code-reviewer agent handling merges.

## Days 40–42 (Mar 24–26) — Containerized agents

All agents shared one VM until a `git clean` in one agent wiped another's config. Now each plan
runs in its own ephemeral LXC container, cloned from a golden template via ZFS linked clone in
under a second and destroyed on completion. The design was clean; reality required 14 fixes in
2 days.

---

## The causal chain

```
context loss → planning repo → static delivery → MCP server →
can't monitor → progress display → silent failures → QA pairing →
manual orchestration → orchestrator → dead agents → health checks →
context overload → role split → cross-contamination → permission enforcement →
manual role switching → coordinator → slow state queries → shadow DB →
laptop too slow → homelab server → can't observe remote agents → Grafana →
redundant file reads → exploration cache → SQLite locking → PostgreSQL →
manual pipeline stages → auto-pipeline → no code review → branch+PR workflow →
shared filesystem conflicts → LXC worker containers
```

## The numbers (as of August 2026)

4,900+ commits · 1,375 plans · 1,319 completed autonomously · 22 agent roles · 52 MCP tools ·
12 Ansible roles · 0 lines of human-written code in the target projects.
