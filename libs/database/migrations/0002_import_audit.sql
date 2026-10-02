CREATE TABLE import_audit.import_runs(
 id uuid PRIMARY KEY,
 source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[0-9a-f]{64}$'),
 transform_version text NOT NULL CHECK(transform_version ~ '[^[:space:]]'),
 source_label text NOT NULL CHECK(source_label ~ '[^[:space:]]'),
 status text NOT NULL CHECK(status IN ('staged','applied','failed')),
 started_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,
 manifest jsonb NOT NULL,
 source_key text NOT NULL CHECK(source_key ~ '[^[:space:]]'),
 scope text NOT NULL CHECK(scope IN ('core','enrichment','events')),
 effective_at timestamptz NOT NULL CHECK(isfinite(effective_at)),
 config_sha256 text NOT NULL CHECK(config_sha256 ~ '^[0-9a-f]{64}$'),
 CONSTRAINT import_runs_replay_key UNIQUE(source_key,source_sha256,transform_version,scope,config_sha256)
);
CREATE TABLE import_audit.import_rows(
 run_id uuid NOT NULL REFERENCES import_audit.import_runs ON UPDATE RESTRICT ON DELETE RESTRICT,
 sheet_name text NOT NULL CHECK(sheet_name ~ '[^[:space:]]'),row_number integer NOT NULL CHECK(row_number>0),
 cells jsonb NOT NULL,row_sha256 text NOT NULL CHECK(row_sha256 ~ '^[0-9a-f]{64}$'),stable_id text,
 PRIMARY KEY(run_id,sheet_name,row_number)
);
CREATE TABLE import_audit.import_issues(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 run_id uuid NOT NULL,sheet_name text NOT NULL,row_number integer NOT NULL,
 field_name text NOT NULL CHECK(field_name ~ '[^[:space:]]'),code text NOT NULL CHECK(code ~ '[^[:space:]]'),
 severity text NOT NULL CHECK(severity IN ('blocking','warning')),
 resolution_state text NOT NULL CHECK(resolution_state IN ('open','accepted','resolved')),
 resolution_note text,resolved_by text,resolved_at timestamptz,
 FOREIGN KEY(run_id,sheet_name,row_number) REFERENCES import_audit.import_rows ON UPDATE RESTRICT ON DELETE RESTRICT,
 CONSTRAINT issue_disposition CHECK((resolution_state='open' AND resolution_note IS NULL AND resolved_by IS NULL AND resolved_at IS NULL) OR (resolution_state<>'open' AND resolution_note IS NOT NULL AND resolution_note ~ '[^[:space:]]' AND resolved_by IS NOT NULL AND resolved_by ~ '[^[:space:]]' AND resolved_at IS NOT NULL AND isfinite(resolved_at)))
);
CREATE INDEX import_issues_row_idx ON import_audit.import_issues(run_id,sheet_name,row_number);
CREATE TABLE import_audit.source_heads(
 source_key text PRIMARY KEY CHECK(source_key ~ '[^[:space:]]'),effective_at timestamptz NOT NULL CHECK(isfinite(effective_at)),source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[0-9a-f]{64}$')
);
CREATE TABLE import_audit.field_baselines(
 source_key text NOT NULL CHECK(source_key ~ '[^[:space:]]'),entity_kind text NOT NULL CHECK(entity_kind ~ '[^[:space:]]'),entity_key text NOT NULL CHECK(entity_key ~ '[^[:space:]]'),field_name text NOT NULL CHECK(field_name ~ '[^[:space:]]'),
 source_value jsonb NOT NULL,source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[0-9a-f]{64}$'),
 accepted_run_id uuid NOT NULL REFERENCES import_audit.import_runs ON UPDATE RESTRICT ON DELETE RESTRICT,
 PRIMARY KEY(source_key,entity_kind,entity_key,field_name)
);
CREATE INDEX field_baselines_run_idx ON import_audit.field_baselines(accepted_run_id);
GRANT SELECT,INSERT,UPDATE ON import_audit.import_runs,import_audit.import_rows,import_audit.import_issues,import_audit.source_heads,import_audit.field_baselines TO library_importer;
GRANT SELECT ON import_audit.import_runs,import_audit.import_rows,import_audit.import_issues,import_audit.source_heads,import_audit.field_baselines TO library_private_reader;
GRANT USAGE,SELECT ON SEQUENCE import_audit.import_issues_id_seq TO library_importer;
