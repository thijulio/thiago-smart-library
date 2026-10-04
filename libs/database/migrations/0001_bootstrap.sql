DO $bootstrap$
DECLARE group_name text;
BEGIN
 FOREACH group_name IN ARRAY ARRAY['library_owner','library_importer','library_editor','library_private_reader','library_public_reader','library_ranking_worker'] LOOP
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=group_name) THEN
   IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=group_name AND (rolcanlogin OR rolsuper OR rolcreaterole OR rolcreatedb OR rolbypassrls OR rolreplication)) OR EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.member WHERE r.rolname=group_name) THEN
    RAISE EXCEPTION 'UNSAFE_EXISTING_ROLE';
   END IF;
  ELSE EXECUTE pg_catalog.format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',group_name);
  END IF;
 END LOOP;
 EXECUTE pg_catalog.format('GRANT library_owner TO %I',session_user);
 EXECUTE pg_catalog.format('REVOKE CREATE,TEMPORARY ON DATABASE %I FROM PUBLIC',pg_catalog.current_database());
END $bootstrap$;
ALTER SCHEMA db_meta OWNER TO library_owner;
ALTER TABLE db_meta.schema_migrations OWNER TO library_owner;
DO $$ BEGIN IF to_regclass('db_meta.environment') IS NOT NULL THEN ALTER TABLE db_meta.environment OWNER TO library_owner; END IF; END $$;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA db_meta FROM PUBLIC;
CREATE SCHEMA library AUTHORIZATION library_owner;
CREATE SCHEMA import_audit AUTHORIZATION library_owner;
CREATE SCHEMA api_public AUTHORIZATION library_owner;
REVOKE ALL ON SCHEMA library,import_audit,api_public FROM PUBLIC;
SET LOCAL ROLE library_owner;
ALTER DEFAULT PRIVILEGES FOR ROLE library_owner REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
CREATE TABLE IF NOT EXISTS db_meta.environment(
 singleton boolean PRIMARY KEY CHECK(singleton),
 instance_id uuid NOT NULL UNIQUE DEFAULT pg_catalog.gen_random_uuid(),
 purpose text NOT NULL CHECK(purpose IN ('synthetic-test','staging','production'))
);
ALTER TABLE db_meta.environment OWNER TO library_owner;
INSERT INTO db_meta.environment(singleton,purpose) SELECT true,pg_catalog.current_setting('smart_library.purpose') WHERE NOT EXISTS(SELECT 1 FROM db_meta.environment);
GRANT USAGE ON SCHEMA library TO library_importer,library_editor,library_private_reader;
GRANT USAGE ON SCHEMA import_audit TO library_importer,library_private_reader;
GRANT USAGE ON SCHEMA api_public TO library_public_reader;
