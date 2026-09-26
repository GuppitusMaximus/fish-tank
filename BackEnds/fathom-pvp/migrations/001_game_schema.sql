CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS game;
REVOKE ALL ON SCHEMA game FROM PUBLIC;

CREATE TABLE game.schema_migrations (
    version text PRIMARY KEY,
    checksum_sha256 text NOT NULL CHECK (checksum_sha256 ~ '^[a-f0-9]{64}$'),
    applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TYPE game.account_state AS ENUM ('guest', 'registered', 'deleted');
CREATE TYPE game.ghost_state AS ENUM ('eligible', 'retired', 'quarantined', 'deleted');
CREATE TYPE game.encounter_source AS ENUM ('pending', 'online_match', 'local_generated');
CREATE TYPE game.match_state AS ENUM ('proposed', 'started', 'abandoned_before_start', 'completed');

CREATE TABLE game.accounts (
    account_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    state game.account_state NOT NULL DEFAULT 'guest',
    current_profile_revision bigint NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    deleted_at timestamptz,
    CHECK ((state = 'deleted') = (deleted_at IS NOT NULL))
);

CREATE TABLE game.account_sessions (
    session_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES game.accounts(account_id),
    credential_hash text NOT NULL UNIQUE,
    device_label text,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX account_sessions_account_idx ON game.account_sessions(account_id);

CREATE TABLE game.account_profile_revisions (
    account_id uuid NOT NULL REFERENCES game.accounts(account_id),
    revision bigint NOT NULL CHECK (revision > 0),
    gamer_tag text NOT NULL CHECK (char_length(gamer_tag) BETWEEN 3 AND 24),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (account_id, revision)
);

CREATE TABLE game.class_catalog (
    class_id text PRIMARY KEY,
    display_name text NOT NULL,
    default_available boolean NOT NULL DEFAULT false,
    default_portrait_id text,
    active boolean NOT NULL DEFAULT true
);

CREATE TABLE game.portrait_catalog (
    portrait_id text PRIMARY KEY,
    class_id text NOT NULL REFERENCES game.class_catalog(class_id),
    artwork_revision text NOT NULL,
    default_available boolean NOT NULL DEFAULT false,
    active boolean NOT NULL DEFAULT true,
    UNIQUE (portrait_id, class_id)
);
ALTER TABLE game.class_catalog ADD CONSTRAINT class_default_portrait_fk
    FOREIGN KEY (default_portrait_id, class_id)
    REFERENCES game.portrait_catalog(portrait_id, class_id)
    DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE game.unlock_grants (
    grant_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES game.accounts(account_id),
    object_type text NOT NULL CHECK (object_type IN ('class', 'portrait')),
    object_id text NOT NULL,
    source_type text NOT NULL CHECK (source_type IN ('demo', 'promotion', 'purchase', 'achievement', 'currency', 'support')),
    source_reference text NOT NULL,
    active boolean NOT NULL DEFAULT true,
    granted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    revoked_at timestamptz,
    UNIQUE (account_id, object_type, object_id, source_type, source_reference),
    CHECK ((active AND revoked_at IS NULL) OR (NOT active AND revoked_at IS NOT NULL))
);
CREATE INDEX unlock_grants_effective_idx ON game.unlock_grants(account_id, object_type, object_id) WHERE active;

CREATE TABLE game.class_loadouts (
    account_id uuid NOT NULL REFERENCES game.accounts(account_id),
    class_id text NOT NULL REFERENCES game.class_catalog(class_id),
    portrait_id text NOT NULL,
    revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (account_id, class_id),
    FOREIGN KEY (portrait_id, class_id) REFERENCES game.portrait_catalog(portrait_id, class_id)
);

CREATE TABLE game.release_manifests (
    release_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    build_id text NOT NULL,
    build_commit text NOT NULL CHECK (build_commit ~ '^[a-f0-9]{40}$'),
    game_version text NOT NULL,
    schema_version integer NOT NULL CHECK (schema_version = 4),
    ruleset_id text NOT NULL,
    rating_version text NOT NULL,
    content_hash text NOT NULL,
    artifact_sha256 text NOT NULL CHECK (artifact_sha256 ~ '^sha256:[a-f0-9]{64}$'),
    dataset_id text NOT NULL,
    matchmaking_pool_id text NOT NULL,
    start_health_policy text NOT NULL,
    allowed_cross_zone boolean NOT NULL DEFAULT false,
    acceptance_state text NOT NULL CHECK (acceptance_state IN ('accepted', 'retired', 'disabled')),
    manifest jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (build_id, dataset_id)
);
CREATE INDEX release_rules_idx ON game.release_manifests(dataset_id, ruleset_id, matchmaking_pool_id);

CREATE TABLE game.runs (
    run_id uuid PRIMARY KEY,
    account_id uuid NOT NULL REFERENCES game.accounts(account_id),
    dataset_id text NOT NULL,
    origin_build_id text NOT NULL,
    origin_game_version text NOT NULL,
    origin_build_commit text NOT NULL CHECK (origin_build_commit ~ '^[a-f0-9]{40}$'),
    imported_local boolean NOT NULL DEFAULT false,
    started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (run_id, account_id, dataset_id)
);
CREATE INDEX runs_account_idx ON game.runs(account_id, started_at DESC);

CREATE TABLE game.pvp_encounters (
    encounter_id uuid PRIMARY KEY,
    run_id uuid NOT NULL,
    account_id uuid NOT NULL,
    dataset_id text NOT NULL,
    floor integer NOT NULL CHECK (floor BETWEEN 1 AND 10000),
    encounter_kind text NOT NULL CHECK (encounter_kind = 'pvp'),
    source game.encounter_source NOT NULL DEFAULT 'pending',
    lifecycle text NOT NULL DEFAULT 'captured' CHECK (lifecycle IN ('captured', 'proposed', 'started', 'reconciled', 'completed')),
    local_generated_input jsonb,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    FOREIGN KEY (run_id, account_id, dataset_id) REFERENCES game.runs(run_id, account_id, dataset_id),
    UNIQUE (account_id, run_id, encounter_id),
    UNIQUE (run_id, floor, encounter_kind),
    CHECK ((source = 'local_generated') = (local_generated_input IS NOT NULL))
);

CREATE TABLE game.ghost_snapshots (
    ghost_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL,
    run_id uuid NOT NULL,
    encounter_id uuid NOT NULL,
    dataset_id text NOT NULL,
    build_id text NOT NULL,
    ruleset_id text NOT NULL,
    matchmaking_pool_id text NOT NULL,
    rating_version text NOT NULL,
    game_version text NOT NULL,
    build_commit text NOT NULL,
    floor integer NOT NULL,
    zone_id text NOT NULL,
    mode text NOT NULL,
    tier text NOT NULL,
    power_level double precision NOT NULL CHECK (power_level >= 0 AND power_level <= 1000000000),
    captured_gamer_tag text NOT NULL,
    captured_class_id text NOT NULL,
    captured_portrait_id text NOT NULL,
    captured_portrait_revision text NOT NULL,
    captured_profile_revision bigint NOT NULL,
    submission_hash text NOT NULL CHECK (submission_hash ~ '^[a-f0-9]{64}$'),
    accepted_payload_hash text NOT NULL CHECK (accepted_payload_hash ~ '^[a-f0-9]{64}$'),
    accepted_payload jsonb NOT NULL,
    captured_at timestamptz NOT NULL,
    received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    progression_trust text NOT NULL DEFAULT 'client_reported' CHECK (progression_trust = 'client_reported'),
    FOREIGN KEY (run_id, account_id, dataset_id) REFERENCES game.runs(run_id, account_id, dataset_id),
    FOREIGN KEY (encounter_id, account_id, run_id) REFERENCES game.pvp_encounters(encounter_id, account_id, run_id),
    UNIQUE (account_id, run_id, encounter_id)
);
CREATE INDEX ghost_history_idx ON game.ghost_snapshots(account_id, run_id, floor, received_at DESC);
CREATE INDEX ghost_candidates_idx ON game.ghost_snapshots(dataset_id, matchmaking_pool_id, floor, mode, tier, power_level, received_at DESC);

CREATE TABLE game.ghost_status (
    ghost_id uuid PRIMARY KEY REFERENCES game.ghost_snapshots(ghost_id),
    state game.ghost_state NOT NULL DEFAULT 'eligible',
    reason text,
    changed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE game.pvp_matches (
    match_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_ghost_id uuid NOT NULL REFERENCES game.ghost_snapshots(ghost_id),
    requester_account_id uuid NOT NULL REFERENCES game.accounts(account_id),
    run_id uuid NOT NULL REFERENCES game.runs(run_id),
    encounter_id uuid NOT NULL REFERENCES game.pvp_encounters(encounter_id),
    opponent_ghost_id uuid REFERENCES game.ghost_snapshots(ghost_id),
    opponent_kind text NOT NULL CHECK (opponent_kind IN ('player_ghost', 'generated')),
    seed text NOT NULL,
    ruleset_id text NOT NULL,
    battle_input jsonb NOT NULL,
    public_opponent jsonb NOT NULL,
    selection_reason text NOT NULL,
    selection_band text NOT NULL,
    rating_difference double precision,
    state game.match_state NOT NULL DEFAULT 'proposed',
    proposed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    started_at timestamptz,
    abandoned_at timestamptz,
    UNIQUE (requester_account_id, encounter_id),
    CHECK ((opponent_kind = 'player_ghost') = (opponent_ghost_id IS NOT NULL))
);

CREATE TABLE game.pvp_results (
    result_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES game.accounts(account_id),
    encounter_id uuid NOT NULL UNIQUE REFERENCES game.pvp_encounters(encounter_id),
    match_id uuid REFERENCES game.pvp_matches(match_id),
    outcome text NOT NULL CHECK (outcome IN ('win', 'loss', 'interrupted')),
    reported_payload jsonb NOT NULL,
    payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
    outcome_trust text NOT NULL DEFAULT 'client_reported' CHECK (outcome_trust = 'client_reported'),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE game.request_deduplication (
    account_id uuid NOT NULL REFERENCES game.accounts(account_id),
    operation text NOT NULL,
    idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 200),
    request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
    response_status integer NOT NULL,
    response_body jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (account_id, operation, idempotency_key)
);

CREATE TABLE game.bootstrap_requests (
    bootstrap_key_hash text PRIMARY KEY CHECK (bootstrap_key_hash ~ '^[a-f0-9]{64}$'),
    request_hash text NOT NULL,
    account_id uuid NOT NULL REFERENCES game.accounts(account_id),
    session_id uuid NOT NULL REFERENCES game.account_sessions(session_id),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE OR REPLACE FUNCTION game.reject_immutable_change() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'immutable table % cannot be changed', TG_TABLE_NAME; END $$;
CREATE TRIGGER ghost_snapshots_immutable BEFORE UPDATE OR DELETE ON game.ghost_snapshots
FOR EACH ROW EXECUTE FUNCTION game.reject_immutable_change();
CREATE TRIGGER pvp_results_immutable BEFORE UPDATE OR DELETE ON game.pvp_results
FOR EACH ROW EXECUTE FUNCTION game.reject_immutable_change();

INSERT INTO game.class_catalog(class_id, display_name, default_available)
VALUES ('andy', 'Andy', true), ('saba', 'Saba', true);
INSERT INTO game.portrait_catalog(portrait_id, class_id, artwork_revision, default_available)
VALUES ('andy-default', 'andy', 'demo-v1', true), ('saba-default', 'saba', 'demo-v1', true),
       ('andy-abyss-angler', 'andy', 'demo-v1', false), ('andy-veteran', 'andy', 'demo-v1', false);
UPDATE game.class_catalog SET default_portrait_id = class_id || '-default';
