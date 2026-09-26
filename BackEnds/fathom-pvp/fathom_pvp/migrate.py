from __future__ import annotations

import argparse
import hashlib
import os
import re
from pathlib import Path

import psycopg
from psycopg import sql


IDENTIFIER = re.compile(r"^[a-z][a-z0-9_]{0,62}$")


def migration_files() -> list[Path]:
    return sorted((Path(__file__).parent.parent / "migrations").glob("[0-9][0-9][0-9]_*.sql"))


def render(source: str, schema: str) -> str:
    if not IDENTIFIER.fullmatch(schema):
        raise ValueError("schema must be a lowercase PostgreSQL identifier")
    return re.sub(r"\bgame\b", schema, source)


def migrate(dsn: str, schema: str = "game") -> None:
    with psycopg.connect(dsn) as conn:
      with conn.transaction():
            conn.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (f"fathom-pvp:{schema}",))
            for path in migration_files():
                version = path.name.split("_", 1)[0]
                source = path.read_text(encoding="utf-8")
                checksum = hashlib.sha256(source.encode()).hexdigest()
                exists = conn.execute(
                    "SELECT to_regclass(%s)", (f"{schema}.schema_migrations",)
                ).fetchone()[0]
                if exists:
                    row = conn.execute(
                        sql.SQL("SELECT checksum_sha256 FROM {}.schema_migrations WHERE version = %s").format(sql.Identifier(schema)),
                        (version,),
                    ).fetchone()
                    if row:
                        if row[0] != checksum:
                            raise RuntimeError(f"migration {version} checksum changed")
                        continue
                conn.execute(render(source, schema))
                conn.execute(
                    sql.SQL("INSERT INTO {}.schema_migrations(version, checksum_sha256) VALUES (%s, %s)").format(sql.Identifier(schema)),
                    (version, checksum),
                )


def main() -> None:
    parser = argparse.ArgumentParser(description="Apply checksum-verified Fathom PvP migrations")
    parser.add_argument("--database-url", default=os.getenv("PVP_MIGRATION_DATABASE_URL"))
    parser.add_argument("--schema", default="game")
    args = parser.parse_args()
    if not args.database_url: parser.error("set PVP_MIGRATION_DATABASE_URL or pass --database-url")
    migrate(args.database_url, args.schema)


if __name__ == "__main__":
    main()
