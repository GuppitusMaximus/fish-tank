from __future__ import annotations
import argparse, os, re
import psycopg
from psycopg import sql

IDENTIFIER=re.compile(r"^[a-z][a-z0-9_]{0,62}$")
READ_TABLES=("class_catalog","portrait_catalog","unlock_grants","release_manifests","schema_migrations")
WRITE_TABLES=("accounts","account_sessions","account_profile_revisions","class_loadouts","runs","pvp_encounters","ghost_snapshots","ghost_status","pvp_matches","pvp_results","request_deduplication","bootstrap_requests")

def provision(dsn:str,schema:str,role:str)->None:
    if not IDENTIFIER.fullmatch(schema) or not IDENTIFIER.fullmatch(role):raise ValueError("schema and role must be lowercase PostgreSQL identifiers")
    with psycopg.connect(dsn,autocommit=True) as conn:
        flags=conn.execute("SELECT rolsuper,rolbypassrls,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=%s",(role,)).fetchone()
        if not flags:raise RuntimeError("create the runtime role separately with an environment-specific password")
        if any(flags):raise RuntimeError("runtime role must not be superuser, BYPASSRLS, CREATEDB, or CREATEROLE")
        conn.execute(sql.SQL("REVOKE ALL ON SCHEMA {} FROM PUBLIC").format(sql.Identifier(schema)))
        for browser_role in ("anon","authenticated"):
            if conn.execute("SELECT 1 FROM pg_roles WHERE rolname=%s",(browser_role,)).fetchone():
                conn.execute(sql.SQL("REVOKE ALL ON SCHEMA {} FROM {}").format(sql.Identifier(schema),sql.Identifier(browser_role)))
                conn.execute(sql.SQL("REVOKE ALL ON ALL TABLES IN SCHEMA {} FROM {}").format(sql.Identifier(schema),sql.Identifier(browser_role)))
        conn.execute(sql.SQL("REVOKE ALL ON ALL TABLES IN SCHEMA {} FROM {}").format(sql.Identifier(schema),sql.Identifier(role)))
        conn.execute(sql.SQL("GRANT USAGE ON SCHEMA {} TO {}").format(sql.Identifier(schema),sql.Identifier(role)))
        for table in READ_TABLES:conn.execute(sql.SQL("GRANT SELECT ON {}.{} TO {}").format(sql.Identifier(schema),sql.Identifier(table),sql.Identifier(role)))
        for table in WRITE_TABLES:conn.execute(sql.SQL("GRANT SELECT,INSERT,UPDATE ON {}.{} TO {}").format(sql.Identifier(schema),sql.Identifier(table),sql.Identifier(role)))
        for table in ("ghost_snapshots","pvp_results"):
            conn.execute(sql.SQL("REVOKE UPDATE,DELETE ON {}.{} FROM {}").format(sql.Identifier(schema),sql.Identifier(table),sql.Identifier(role)))

def main()->None:
    parser=argparse.ArgumentParser();parser.add_argument("--database-url",default=os.getenv("PVP_MIGRATION_DATABASE_URL"));parser.add_argument("--schema",required=True);parser.add_argument("--role",required=True)
    args=parser.parse_args()
    if not args.database_url:parser.error("set PVP_MIGRATION_DATABASE_URL or pass --database-url")
    provision(args.database_url,args.schema,args.role)
if __name__=="__main__":main()
