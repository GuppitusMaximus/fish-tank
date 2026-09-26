REVOKE ALL ON ALL TABLES IN SCHEMA game FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA game FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA game FROM PUBLIC;
-- Per-environment grants are applied explicitly by `python -m fathom_pvp.provision`.
