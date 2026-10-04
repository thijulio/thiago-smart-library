-- An applied run returns its original sanitized outcome after later native writes.
ALTER TABLE import_audit.import_runs ADD COLUMN result jsonb;
-- Replacing ordered relations requires deleting join rows, never their canonical parents.
GRANT DELETE ON library.book_authors,library.book_genres TO library_importer;
-- Import operations must inspect the purpose marker without owner credentials.
GRANT USAGE ON SCHEMA db_meta TO library_importer;
GRANT SELECT ON db_meta.environment TO library_importer;
GRANT SELECT ON db_meta.schema_migrations TO library_importer;
