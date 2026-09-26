#!/usr/bin/env python3
"""Delete only the authorized legacy PoC rows, after retiring their HTTP writer.

Defaults to counts only. Read migration credentials from the environment, never
CLI arguments or logs. This is intentionally separate from schema migrations.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import psycopg


def verify_retired() -> None:
    # Fixed local service: a caller cannot supply another healthy server as proof.
    with urlopen("http://127.0.0.1:8002/pvp/v2/capabilities", timeout=5) as response:
        capabilities = json.load(response)
    if capabilities.get("datasetId") != "demo-v2":
        raise RuntimeError("production v2 dataset is not ready")
    request = Request("http://127.0.0.1:8002/pvp/snapshot", data=b"{}",
                      headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urlopen(request, timeout=5):
            raise RuntimeError("legacy writer is still active")
    except HTTPError as error:
        if error.code != 410:
            raise RuntimeError("legacy writer did not return 410") from None


def counts(connection) -> dict[str, int]:
    return {
        "players": connection.execute("SELECT count(*) FROM public.players").fetchone()[0],
        "ghosts": connection.execute("SELECT count(*) FROM public.party_snapshots").fetchone()[0],
    }


def purge(connection, expected_players: int, expected_ghosts: int) -> dict[str, int]:
    with connection.transaction():
        connection.execute("SET LOCAL lock_timeout = '5s'")
        connection.execute("SET LOCAL statement_timeout = '30s'")
        connection.execute("LOCK TABLE public.party_snapshots, public.players IN ACCESS EXCLUSIVE MODE")
        actual = counts(connection)
        if actual != {"players": expected_players, "ghosts": expected_ghosts}:
            raise RuntimeError(f"legacy counts changed; review before retry: {actual}")
        # Never TRUNCATE CASCADE: a new referencing table must stop this operation.
        connection.execute("DELETE FROM public.party_snapshots")
        connection.execute("DELETE FROM public.players")
        if counts(connection) != {"players": 0, "ghosts": 0}:
            raise RuntimeError("legacy purge verification failed")
    return actual


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--expected-players", type=int)
    parser.add_argument("--expected-ghosts", type=int)
    parser.add_argument("--restored-backup", type=Path,
                        help="Existing pg_dump archive already tested with pg_restore in isolation")
    args = parser.parse_args()
    dsn = os.environ["PVP_MIGRATION_DATABASE_URL"]
    if args.apply:
        if (args.expected_players is None or args.expected_ghosts is None
                or min(args.expected_players, args.expected_ghosts) < 0
                or args.restored_backup is None or not args.restored_backup.is_file()
                or args.restored_backup.stat().st_size == 0):
            parser.error("apply requires expected counts and a tested, nonempty backup archive")
        verify_retired()
    with psycopg.connect(dsn, autocommit=True) as connection:
        result = purge(connection, args.expected_players, args.expected_ghosts) if args.apply else counts(connection)
    print(json.dumps({"applied": args.apply, "legacyRows": result}, sort_keys=True))


if __name__ == "__main__":
    main()
