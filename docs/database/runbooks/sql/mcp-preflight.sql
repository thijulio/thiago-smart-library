-- Read-only metadata. No private books, users, sessions, tokens or credentials.
SELECT jsonb_build_object(
  'database', current_database(),
  'migrations', (
    SELECT jsonb_agg(jsonb_build_object('name', name, 'checksum', checksum) ORDER BY name)
    FROM db_meta.schema_migrations
  ),
  'native_permission_table_installed', to_regclass('library.native_write_permissions') IS NOT NULL,
  'oauth_storage_installed', to_regclass('auth."oauthClient"') IS NOT NULL,
  'runtime_restricted', (
    SELECT NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
    FROM pg_roles WHERE rolname = 'sl_app_runtime'
  ),
  'runtime_memberships', (
    SELECT COALESCE(jsonb_agg(g.rolname ORDER BY g.rolname), '[]'::jsonb)
    FROM pg_auth_members m JOIN pg_roles g ON g.oid = m.roleid
    WHERE m.member = (SELECT oid FROM pg_roles WHERE rolname = 'sl_app_runtime')
  ),
  'private_relation_access', (
    SELECT COALESCE(jsonb_agg(c.oid::regclass::text ORDER BY c.oid::regclass::text), '[]'::jsonb)
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('library', 'import_audit', 'db_meta')
      AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
      AND has_table_privilege((SELECT oid FROM pg_roles WHERE rolname = 'sl_app_runtime'), c.oid,
        'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  ),
  'legacy_runtime_execute', (
    SELECT COALESCE(jsonb_agg(p.oid::regprocedure::text ORDER BY p.oid::regprocedure::text), '[]'::jsonb)
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'library'
      AND p.proname IN ('create_book', 'patch_book', 'patch_feedback', 'patch_assessment', 'archive_book')
      AND has_function_privilege((SELECT oid FROM pg_roles WHERE rolname = 'sl_app_runtime'), p.oid, 'EXECUTE')
  )
) AS readiness;
