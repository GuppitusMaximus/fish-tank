#!/usr/bin/env python3
"""Export GitHub Actions workflow run data for the frontend dashboard.

Fetches recent workflow runs from the GitHub API and writes a summary
JSON file for the frontend Workflow tab.

Usage:
    GH_TOKEN=$(gh auth token) python export_workflow.py --output /tmp/workflow.json
    python export_workflow.py --output path/to/workflow.json --hours 72
"""

import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from urllib.error import URLError
from urllib.request import Request, urlopen


def fetch_runs(repo, token):
    """Fetch workflow runs from GitHub API. Returns parsed JSON or None."""
    url = f"https://api.github.com/repos/{repo}/actions/workflows/netatmo.yml/runs?per_page=100"
    req = Request(url)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Accept", "application/vnd.github+json")
    resp = urlopen(req, timeout=30)
    return json.loads(resp.read().decode())


def parse_timestamp(ts):
    """Parse a GitHub API timestamp string to a datetime."""
    return datetime.strptime(ts, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def format_duration(seconds):
    """Format seconds as 'Xm Ys'."""
    m, s = divmod(int(seconds), 60)
    return f"{m}m {s}s"


def export(output_path, hours):
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=hours)
    generated_at = now.strftime("%Y-%m-%dT%H:%M:%SZ")

    # Compute next run as next :00 UTC boundary
    if now.minute == 0 and now.second == 0:
        next_run = now + timedelta(hours=1)
    else:
        next_run = now.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
    next_run_str = next_run.strftime("%Y-%m-%dT%H:%M:%SZ")

    token = os.environ.get("GH_TOKEN")
    repo = os.environ.get("GITHUB_REPOSITORY", "GuppitusMaximus/fish-tank")

    if not token:
        print("Warning: GH_TOKEN not set, writing minimal output")
        minimal = {
            "generated_at": generated_at,
            "schedule": {"cron": "0 * * * *", "next_run": next_run_str},
            "latest": None,
            "runs": [],
            "stats": None,
        }
        write_output(output_path, minimal)
        return

    try:
        data = fetch_runs(repo, token)
    except (URLError, OSError, json.JSONDecodeError, KeyError) as e:
        print(f"Warning: API call failed ({e}), writing minimal output")
        minimal = {
            "generated_at": generated_at,
            "schedule": {"cron": "0 * * * *", "next_run": next_run_str},
            "latest": None,
            "runs": [],
            "stats": None,
        }
        write_output(output_path, minimal)
        return

    # Filter and process runs
    runs = []
    for run in data.get("workflow_runs", []):
        created_at = parse_timestamp(run["created_at"])
        if created_at < cutoff:
            continue

        updated_at = parse_timestamp(run["updated_at"])
        duration_seconds = None
        duration_display = None
        if run["status"] == "completed":
            duration_seconds = int((updated_at - created_at).total_seconds())
            duration_display = format_duration(duration_seconds)

        runs.append({
            "id": run["id"],
            "status": run["status"],
            "conclusion": run["conclusion"],
            "event": run["event"],
            "created_at": run["created_at"],
            "updated_at": run["updated_at"],
            "duration_seconds": duration_seconds,
            "duration_display": duration_display,
            "html_url": run["html_url"],
        })

    # Sort newest first
    runs.sort(key=lambda r: r["created_at"], reverse=True)

    # Build latest — skip the current run (it's still in_progress when we query)
    current_run_id = int(os.environ.get("GITHUB_RUN_ID", "0"))
    latest = None
    for r in runs:
        if r["id"] != current_run_id:
            latest = dict(r)
            break

    # Build compact runs array — exclude the current in-progress run
    compact_runs = []
    for r in runs:
        if r["id"] == current_run_id:
            continue
        compact_runs.append({
            "id": r["id"],
            "conclusion": r["conclusion"],
            "event": r["event"],
            "created_at": r["created_at"],
            "duration_seconds": r["duration_seconds"],
            "duration_display": r["duration_display"],
        })

    # Compute stats — exclude the current in-progress run
    other_runs = [r for r in runs if r["id"] != current_run_id]
    completed = [r for r in other_runs if r["status"] == "completed"]
    total_runs = len(other_runs)
    success_count = sum(1 for r in completed if r["conclusion"] == "success")
    failure_count = sum(1 for r in completed if r["conclusion"] == "failure")
    durations = [r["duration_seconds"] for r in completed if r["duration_seconds"] is not None]
    avg_duration = int(sum(durations) / len(durations)) if durations else 0
    success_rate = round(success_count / total_runs * 100, 1) if total_runs > 0 else 0.0

    stats = {
        "total_runs": total_runs,
        "success_count": success_count,
        "failure_count": failure_count,
        "success_rate": success_rate,
        "avg_duration_seconds": avg_duration,
        "avg_duration_display": format_duration(avg_duration),
        "period_hours": hours,
    }

    result = {
        "generated_at": generated_at,
        "schedule": {"cron": "0 * * * *", "next_run": next_run_str},
        "latest": latest,
        "runs": compact_runs,
        "stats": stats,
    }

    write_output(output_path, result)

    print(f"Exported workflow data to {output_path}")
    print(f"  Runs: {total_runs} (last {hours}h)")
    print(f"  Success rate: {success_rate}%")
    if latest:
        print(f"  Latest: {latest['conclusion']} ({latest['created_at']})")


def write_output(output_path, data):
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Export workflow run data")
    parser.add_argument("--output", required=True, help="Output path for workflow.json")
    parser.add_argument("--hours", type=int, default=48, help="Hours of history (default: 48)")
    args = parser.parse_args()
    export(args.output, args.hours)
