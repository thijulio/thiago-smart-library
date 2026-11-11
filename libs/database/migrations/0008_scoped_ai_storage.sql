-- Separate app-owned persistence. No imported fields or production writers change.
RESET ROLE;
DO $role$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='library_ai_producer') THEN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='library_ai_producer' AND
    (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls))
    OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname='library_ai_producer'))
  THEN RAISE EXCEPTION 'UNSAFE_EXISTING_ROLE'; END IF;
 ELSE
  CREATE ROLE library_ai_producer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
 END IF;
END $role$;
SET LOCAL ROLE library_owner;

ALTER TABLE library.user_libraries ADD CONSTRAINT user_libraries_id_owner_key UNIQUE(id,owner_user_id);
ALTER TABLE library.library_books ADD CONSTRAINT library_books_library_book_key UNIQUE(library_id,book_id);

CREATE TABLE library.ai_result_streams (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 library_id uuid NOT NULL REFERENCES library.user_libraries(id) ON DELETE RESTRICT,
 book_id bigint NOT NULL,
 kind text NOT NULL CHECK(kind IN ('enrichment','taste','format')),
 head_revision_id uuid,
 UNIQUE(library_id,book_id,kind), UNIQUE(id,library_id),
 FOREIGN KEY(library_id,book_id) REFERENCES library.library_books(library_id,book_id) ON DELETE RESTRICT
);
CREATE TABLE library.ai_result_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 stream_id uuid NOT NULL,
 library_id uuid NOT NULL,
 revision bigint NOT NULL CHECK(revision>0),
 schema_version smallint NOT NULL DEFAULT 1 CHECK(schema_version=1),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
 input_manifest jsonb NOT NULL CHECK(jsonb_typeof(input_manifest)='object'),
 input_fingerprint text NOT NULL CHECK(input_fingerprint ~ '^[a-f0-9]{64}$'),
 rubric_version text NOT NULL CHECK(length(btrim(rubric_version))>0 AND length(rubric_version)<=200),
 producer jsonb NOT NULL CHECK(jsonb_typeof(producer)='object'),
 calculated_at timestamptz NOT NULL CHECK(isfinite(calculated_at)),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(stream_id,revision), UNIQUE(id,library_id), UNIQUE(stream_id,id),
 FOREIGN KEY(stream_id,library_id) REFERENCES library.ai_result_streams(id,library_id) ON DELETE RESTRICT
);
ALTER TABLE library.ai_result_streams ADD CONSTRAINT ai_result_head_stream_fk
 FOREIGN KEY(id,head_revision_id) REFERENCES library.ai_result_revisions(stream_id,id) ON DELETE RESTRICT;

CREATE TABLE library.reading_plan_streams (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 library_id uuid NOT NULL REFERENCES library.user_libraries(id) ON DELETE RESTRICT,
 platform text NOT NULL CHECK(platform IN ('Kindle','Audible')),
 head_revision_id uuid,
 UNIQUE(library_id,platform), UNIQUE(id,library_id,platform)
);
CREATE TABLE library.reading_plan_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 stream_id uuid NOT NULL,
 library_id uuid NOT NULL,
 platform text NOT NULL CHECK(platform IN ('Kindle','Audible')),
 revision bigint NOT NULL CHECK(revision>0),
 schema_version smallint NOT NULL DEFAULT 1 CHECK(schema_version=1),
 input_manifest jsonb NOT NULL CHECK(jsonb_typeof(input_manifest)='object'),
 input_fingerprint text NOT NULL CHECK(input_fingerprint ~ '^[a-f0-9]{64}$'),
 rubric_version text NOT NULL CHECK(length(btrim(rubric_version))>0 AND length(rubric_version)<=200),
 producer jsonb NOT NULL CHECK(jsonb_typeof(producer)='object'),
 calculated_at timestamptz NOT NULL CHECK(isfinite(calculated_at)),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(stream_id,revision), UNIQUE(id,library_id), UNIQUE(stream_id,id),
 UNIQUE(id,library_id,platform),
 FOREIGN KEY(stream_id,library_id,platform) REFERENCES library.reading_plan_streams(id,library_id,platform) ON DELETE RESTRICT
);
ALTER TABLE library.reading_plan_streams ADD CONSTRAINT reading_plan_head_stream_fk
 FOREIGN KEY(id,head_revision_id) REFERENCES library.reading_plan_revisions(stream_id,id) ON DELETE RESTRICT;
CREATE TABLE library.reading_plan_entries (
 revision_id uuid NOT NULL,
 library_id uuid NOT NULL,
 position integer NOT NULL CHECK(position BETWEEN 1 AND 1000),
 book_id bigint NOT NULL,
 reason text NOT NULL CHECK(length(btrim(reason))>0 AND length(reason)<=4000),
 evidence jsonb NOT NULL CHECK(jsonb_typeof(evidence)='array' AND jsonb_array_length(evidence)<=128),
 PRIMARY KEY(revision_id,position), UNIQUE(revision_id,book_id),
 UNIQUE(revision_id,position,library_id),
 FOREIGN KEY(revision_id,library_id) REFERENCES library.reading_plan_revisions(id,library_id) ON DELETE RESTRICT,
 FOREIGN KEY(library_id,book_id) REFERENCES library.library_books(library_id,book_id) ON DELETE RESTRICT
);
CREATE TABLE library.reading_plan_entry_judgments (
 revision_id uuid NOT NULL,
 position integer NOT NULL,
 library_id uuid NOT NULL,
 result_revision_id uuid NOT NULL,
 PRIMARY KEY(revision_id,position,result_revision_id),
 FOREIGN KEY(revision_id,position,library_id) REFERENCES library.reading_plan_entries(revision_id,position,library_id) ON DELETE RESTRICT,
 FOREIGN KEY(result_revision_id,library_id) REFERENCES library.ai_result_revisions(id,library_id) ON DELETE RESTRICT
);

CREATE TABLE library.preference_evidence (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 library_id uuid NOT NULL,
 preference_id uuid NOT NULL,
 revision bigint NOT NULL CHECK(revision>0),
 authorship text NOT NULL CHECK(authorship IN ('explicit','inferred')),
 decision text NOT NULL CHECK(decision IN ('proposed','accepted','rejected','superseded')),
 statement text NOT NULL CHECK(length(btrim(statement))>0 AND length(statement)<=4000),
 sources jsonb NOT NULL CHECK(jsonb_typeof(sources)='array' AND jsonb_array_length(sources)<=128),
 producer jsonb,
 actor_user_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(library_id,preference_id,revision), UNIQUE(id,library_id),
 CHECK(authorship='inferred' OR decision IN ('accepted','superseded')),
 CHECK((authorship='explicit' AND producer IS NULL) OR
       (authorship='inferred' AND producer IS NOT NULL AND jsonb_typeof(producer)='object' AND jsonb_array_length(sources)>0)),
 FOREIGN KEY(library_id,actor_user_id) REFERENCES library.user_libraries(id,owner_user_id) ON DELETE RESTRICT
);
CREATE TABLE library.plan_deferrals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 library_id uuid NOT NULL,
 deferral_id uuid NOT NULL,
 revision bigint NOT NULL CHECK(revision>0),
 book_id bigint NOT NULL,
 platform text NOT NULL CHECK(platform IN ('Kindle','Audible')),
 expected_plan_revision_id uuid,
 state text NOT NULL CHECK(state IN ('active','cancelled')),
 reason text NOT NULL CHECK(length(btrim(reason))>0 AND length(reason)<=4000),
 actor_user_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(library_id,deferral_id,revision), UNIQUE(id,library_id,platform),
 FOREIGN KEY(library_id,actor_user_id) REFERENCES library.user_libraries(id,owner_user_id) ON DELETE RESTRICT,
 FOREIGN KEY(library_id,book_id) REFERENCES library.library_books(library_id,book_id) ON DELETE RESTRICT,
 FOREIGN KEY(expected_plan_revision_id,library_id,platform) REFERENCES library.reading_plan_revisions(id,library_id,platform) ON DELETE RESTRICT
);
CREATE TABLE library.app_operation_receipts (
 actor_user_id text NOT NULL,
 library_id uuid NOT NULL,
 operation text NOT NULL CHECK(length(btrim(operation))>0 AND length(operation)<=200),
 request_id uuid NOT NULL,
 request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),
 result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(actor_user_id,operation,request_id),
 FOREIGN KEY(library_id,actor_user_id) REFERENCES library.user_libraries(id,owner_user_id) ON DELETE RESTRICT
);

CREATE FUNCTION library.prevent_app_revision_rewrite() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
 BEGIN RAISE EXCEPTION 'APP_REVISION_IMMUTABLE'; END $$;
DO $history$
DECLARE name text;
BEGIN
 FOREACH name IN ARRAY ARRAY['ai_result_revisions','reading_plan_revisions','reading_plan_entries','reading_plan_entry_judgments','preference_evidence','plan_deferrals','app_operation_receipts'] LOOP
  EXECUTE format('CREATE TRIGGER immutable_revision BEFORE UPDATE OR DELETE ON library.%I FOR EACH ROW EXECUTE FUNCTION library.prevent_app_revision_rewrite()',name);
 END LOOP;
END $history$;
CREATE FUNCTION library.guard_plan_entry_append() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
 DECLARE target_stream uuid;target_version bigint;current_version bigint;
 BEGIN
  SELECT stream_id,revision INTO target_stream,target_version
   FROM library.reading_plan_revisions WHERE id=NEW.revision_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  -- Serialize entry construction with head publication before checking history.
  PERFORM 1 FROM library.reading_plan_streams WHERE id=target_stream FOR UPDATE;
  SELECT r.revision INTO current_version FROM library.reading_plan_streams s
   JOIN library.reading_plan_revisions r ON r.id=s.head_revision_id WHERE s.id=target_stream;
  IF current_version>=target_version THEN RAISE EXCEPTION 'APP_REVISION_IMMUTABLE'; END IF;
  RETURN NEW;
 END $$;
CREATE TRIGGER unpublished_entry_only BEFORE INSERT ON library.reading_plan_entries
 FOR EACH ROW EXECUTE FUNCTION library.guard_plan_entry_append();
CREATE TRIGGER unpublished_judgment_only BEFORE INSERT ON library.reading_plan_entry_judgments
 FOR EACH ROW EXECUTE FUNCTION library.guard_plan_entry_append();
REVOKE ALL ON library.ai_result_streams,library.ai_result_revisions,
 library.reading_plan_streams,library.reading_plan_revisions,library.reading_plan_entries,library.reading_plan_entry_judgments,
 library.preference_evidence,library.plan_deferrals,library.app_operation_receipts FROM PUBLIC;
REVOKE ALL ON FUNCTION library.prevent_app_revision_rewrite() FROM PUBLIC;
REVOKE ALL ON FUNCTION library.guard_plan_entry_append() FROM PUBLIC;
GRANT USAGE ON SCHEMA library TO library_ai_producer;
-- No runtime or producer table access, writer execution, hosted login or worker activation.
