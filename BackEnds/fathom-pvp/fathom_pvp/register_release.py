from __future__ import annotations
import argparse, hashlib, json, os, re
from pathlib import Path
import psycopg
from psycopg import sql

def main()->None:
    parser=argparse.ArgumentParser();parser.add_argument("manifest",type=Path);parser.add_argument("--database-url",default=os.getenv("PVP_MIGRATION_DATABASE_URL"));parser.add_argument("--schema",default="game");parser.add_argument("--dataset",required=True);parser.add_argument("--artifact-sha256",required=True)
    args=parser.parse_args()
    if not args.database_url:parser.error("set PVP_MIGRATION_DATABASE_URL")
    if not re.fullmatch(r"sha256:[a-f0-9]{64}",args.artifact_sha256):parser.error("artifact digest must be sha256:<hex>")
    manifest=json.loads(args.manifest.read_text(encoding="utf-8"));required=("buildId","buildCommit","gameVersion","schemaVersion","rulesetId","ratingVersion","contentHash","matchmakingPoolId","datasetId","startHealthPolicy","artifactDigest")
    missing=[key for key in required if key not in manifest]
    if missing:parser.error("manifest missing: "+", ".join(missing))
    if manifest["datasetId"]!=args.dataset or manifest["schemaVersion"]!=4 or manifest["artifactDigest"]!=args.artifact_sha256:parser.error("manifest dataset/schema/artifact digest does not match registration arguments")
    values=(manifest["buildId"],manifest["buildCommit"],manifest["gameVersion"],manifest["schemaVersion"],manifest["rulesetId"],manifest["ratingVersion"],manifest["contentHash"],args.artifact_sha256,args.dataset,manifest["matchmakingPoolId"],manifest["startHealthPolicy"],json.dumps(manifest))
    with psycopg.connect(args.database_url) as conn:
        inserted=conn.execute(sql.SQL("INSERT INTO {}.release_manifests(build_id,build_commit,game_version,schema_version,ruleset_id,rating_version,content_hash,artifact_sha256,dataset_id,matchmaking_pool_id,start_health_policy,acceptance_state,manifest) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'accepted',%s) ON CONFLICT(build_id,dataset_id) DO NOTHING RETURNING release_id").format(sql.Identifier(args.schema)),values).fetchone()
        if not inserted:
            existing=conn.execute(sql.SQL("SELECT build_commit,game_version,schema_version,ruleset_id,rating_version,content_hash,artifact_sha256,matchmaking_pool_id,start_health_policy,manifest FROM {}.release_manifests WHERE build_id=%s AND dataset_id=%s").format(sql.Identifier(args.schema)),(manifest["buildId"],args.dataset)).fetchone()
            comparable=tuple(values[i] for i in (1,2,3,4,5,6,7,9,10))+(manifest,)
            if tuple(existing)!=comparable:raise RuntimeError("release registration conflicts with the immutable existing row")
if __name__=="__main__":main()
