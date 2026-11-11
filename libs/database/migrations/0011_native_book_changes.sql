-- Additive, default-disabled conversational writer. Existing books are never marked native.
CREATE TABLE library.native_write_permissions (
 library_id uuid PRIMARY KEY REFERENCES library.user_libraries(id) ON DELETE RESTRICT,
 enabled boolean NOT NULL DEFAULT false,
 approved_by text NOT NULL CHECK(length(btrim(approved_by))>0),
 approved_at timestamptz NOT NULL CHECK(isfinite(approved_at))
);
COMMENT ON TABLE library.native_write_permissions IS 'Offline owner-controlled authority only; changes must take shared import gate then library context lock.';
CREATE TABLE library.native_books (
 book_id bigint PRIMARY KEY,
 library_id uuid NOT NULL,
 created_by_user_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(library_id,book_id) REFERENCES library.library_books(library_id,book_id) ON DELETE RESTRICT,
 FOREIGN KEY(library_id,created_by_user_id) REFERENCES library.user_libraries(id,owner_user_id) ON DELETE RESTRICT
);
CREATE TABLE library.book_change_proposals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 library_id uuid NOT NULL,
 actor_user_id text NOT NULL,
 change jsonb NOT NULL CHECK(jsonb_typeof(change)='object'),
 before_book jsonb,
 digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),
 channel text NOT NULL CHECK(channel IN ('site','mcp')),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT(now()+interval '30 minutes'),
 confirmed_at timestamptz,
 result jsonb,
 FOREIGN KEY(library_id,actor_user_id) REFERENCES library.user_libraries(id,owner_user_id) ON DELETE RESTRICT,
 CHECK(result IS NULL OR (confirmed_at IS NOT NULL AND jsonb_typeof(result)='object'))
);
CREATE INDEX book_change_proposals_library_idx ON library.book_change_proposals(library_id);
CREATE FUNCTION library.book_change_immutable() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
 BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'PROPOSAL_IMMUTABLE'; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.library_id IS DISTINCT FROM OLD.library_id
   OR NEW.actor_user_id IS DISTINCT FROM OLD.actor_user_id OR NEW.change IS DISTINCT FROM OLD.change
   OR NEW.before_book IS DISTINCT FROM OLD.before_book OR NEW.digest IS DISTINCT FROM OLD.digest
   OR NEW.channel IS DISTINCT FROM OLD.channel OR NEW.created_at IS DISTINCT FROM OLD.created_at
   OR (OLD.result IS NOT NULL AND (NEW.result IS DISTINCT FROM OLD.result OR NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at))
  THEN RAISE EXCEPTION 'PROPOSAL_IMMUTABLE'; END IF;
  RETURN NEW;
 END $$;
CREATE TRIGGER book_change_immutable BEFORE UPDATE OR DELETE ON library.book_change_proposals
 FOR EACH ROW EXECUTE FUNCTION library.book_change_immutable();

CREATE FUNCTION library.change_keys(v jsonb,required text[],optional text[] DEFAULT '{}') RETURNS boolean
 LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT COALESCE(jsonb_typeof(v)='object' AND v ?& required AND NOT EXISTS(
  SELECT 1 FROM jsonb_object_keys(v) k WHERE NOT k=ANY(required||optional)),false)
 $$;
CREATE FUNCTION library.change_nullable_text(v jsonb,max_units integer) RETURNS boolean
 LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT COALESCE(v='null'::jsonb OR (jsonb_typeof(v)='string' AND length(v#>>'{}')+regexp_count(v#>>'{}',U&'[\+010000-\+10FFFF]')<=max_units),false)
 $$;
CREATE FUNCTION library.change_date(v jsonb) RETURNS boolean
 LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
 DECLARE d date;
 BEGIN
  IF jsonb_typeof(v) IS DISTINCT FROM 'string' OR (v#>>'{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
   OR left(v#>>'{}',4)='0000' OR NOT pg_input_is_valid(v#>>'{}','date') THEN RETURN false; END IF;
  d=(v#>>'{}')::date;
  RETURN isfinite(d) AND to_char(d,'YYYY-MM-DD')=v#>>'{}';
 END $$;
CREATE FUNCTION library.change_author_key(v text) RETURNS text
 LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT lower(normalize(regexp_replace(v,U&'^[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+|[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+$','','g'),NFC))
 $$;
CREATE FUNCTION library.assert_book_change(v jsonb) RETURNS void
 LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
 DECLARE p jsonb;a jsonb;names text[]='{}';key text;r numeric;
 BEGIN
  IF v IS NULL OR jsonb_typeof(v) IS DISTINCT FROM 'object' OR octet_length(v::text)>32768 THEN RAISE EXCEPTION 'INVALID_BOOK_CHANGE'; END IF;
  IF v->>'type'='create' THEN
   IF NOT library.change_keys(v,ARRAY['type','title','authors','platform','status'],ARRAY['rating','opinion','notes','finishedDate'])
    OR NOT library.ai_text(v->'title',500) OR jsonb_typeof(v->'authors') IS DISTINCT FROM 'array'
   THEN RAISE EXCEPTION 'INVALID_BOOK_CHANGE'; END IF;
   IF jsonb_array_length(v->'authors') NOT BETWEEN 1 AND 16 THEN RAISE EXCEPTION 'INVALID_BOOK_CHANGE'; END IF;
   FOR a IN SELECT value FROM jsonb_array_elements(v->'authors') LOOP
    key=library.change_author_key(a#>>'{}');
    IF NOT library.ai_text(a,200) OR key=ANY(names) THEN RAISE EXCEPTION 'INVALID_BOOK_CHANGE'; END IF;
    names=array_append(names,key);
   END LOOP;
   p=v-'type'-'title'-'authors';
  ELSIF v->>'type'='update' THEN
   IF NOT library.change_keys(v,ARRAY['type','stableId','expectedVersion','expectedFeedbackVersion','patch'])
    OR NOT library.ai_text(v->'stableId',500) OR NOT library.ai_counter(v->'expectedVersion')
    OR NOT(v->'expectedFeedbackVersion'='null'::jsonb OR library.ai_counter(v->'expectedFeedbackVersion'))
    OR NOT library.change_keys(v->'patch','{}',ARRAY['platform','status','rating','opinion','notes','finishedDate']) OR v->'patch'='{}'::jsonb
   THEN RAISE EXCEPTION 'INVALID_BOOK_CHANGE'; END IF;
   p=v->'patch';
  ELSE RAISE EXCEPTION 'INVALID_BOOK_CHANGE'; END IF;
  IF (p?'platform' AND COALESCE(p->>'platform','') NOT IN('Audible','Kindle','Physical','Unknown'))
   OR (p?'status' AND COALESCE(p->>'status','') NOT IN('wishlist','unread','reading','paused','read'))
   OR (p?'opinion' AND NOT library.change_nullable_text(p->'opinion',4000))
   OR (p?'notes' AND NOT library.change_nullable_text(p->'notes',10000))
   OR (p?'finishedDate' AND p->'finishedDate'<>'null'::jsonb AND NOT library.change_date(p->'finishedDate'))
   OR (p?'finishedDate' AND p->'finishedDate'<>'null'::jsonb AND p?'status' AND p->>'status'<>'read')
  THEN RAISE EXCEPTION 'INVALID_BOOK_CHANGE'; END IF;
  IF p?'rating' AND p->'rating'<>'null'::jsonb THEN
   IF jsonb_typeof(p->'rating') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'INVALID_BOOK_CHANGE'; END IF;
   r=(p->>'rating')::numeric;
   IF r<1 OR r>5 OR r*2<>trunc(r*2) THEN RAISE EXCEPTION 'INVALID_BOOK_CHANGE'; END IF;
  END IF;
 END $$;

CREATE FUNCTION library.change_native(p_library uuid,p_book bigint) RETURNS boolean
 LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM library.native_books n JOIN library.books b ON b.id=n.book_id
  WHERE n.library_id=p_library AND n.book_id=p_book AND b.last_import_run_id IS NULL
   AND b.source_updated_at IS NULL AND b.source_updated_by IS NULL
   AND NOT EXISTS(SELECT 1 FROM library.book_feedback f WHERE f.book_id=b.id AND (f.last_import_run_id IS NOT NULL OR f.source_updated_at IS NOT NULL OR f.source_updated_by IS NOT NULL))
   AND NOT EXISTS(SELECT 1 FROM library.book_field_provenance p WHERE p.book_id=b.id AND p.import_run_id IS NOT NULL)
   AND NOT EXISTS(SELECT 1 FROM import_audit.field_baselines f WHERE f.entity_kind='book' AND f.entity_key=b.stable_id))
 $$;
CREATE FUNCTION library.change_permission(p_library uuid) RETURNS void
 LANGUAGE plpgsql STABLE SET search_path=pg_catalog,pg_temp AS $$
 BEGIN
  IF NOT EXISTS(SELECT 1 FROM library.native_write_permissions WHERE library_id=p_library AND enabled)
  THEN RAISE EXCEPTION 'NATIVE_WRITES_DISABLED'; END IF;
 END $$;
CREATE FUNCTION library.editable_book_for_user(p_actor text,p_stable text) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 DECLARE context record;b library.books;f library.book_feedback;native boolean;
 BEGIN
  SELECT * INTO context FROM library.ai_owned_subject(p_actor,p_stable);
  SELECT * INTO b FROM library.books WHERE id=context.book_id;
  SELECT * INTO f FROM library.book_feedback WHERE book_id=context.book_id;
  native=library.change_native(context.library_id,b.id);
  RETURN jsonb_build_object('stableId',b.stable_id,'title',b.title,
   'authors',(SELECT jsonb_agg(a.name ORDER BY ba.position) FROM library.book_authors ba JOIN library.authors a ON a.id=ba.author_id WHERE ba.book_id=b.id),
   'platform',b.platform,'status',b.status,'rating',f.rating,'opinion',f.opinion,'notes',f.notes,
   'finishedDate',CASE WHEN b.finished_precision='day' THEN to_char(b.finished_from,'YYYY-MM-DD') ELSE NULL END,
   'version',b.row_version::text,'feedbackVersion',f.row_version::text,'native',native,'writable',native AND EXISTS(SELECT 1 FROM library.native_write_permissions WHERE library_id=context.library_id AND enabled));
 END $$;
CREATE FUNCTION library.change_assert_subject(p_actor text,p_change jsonb,p_lock boolean) RETURNS bigint
 LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
 DECLARE context record;b library.books;f library.book_feedback;p jsonb;
 BEGIN
  SELECT * INTO context FROM library.ai_owned_subject(p_actor,p_change->>'stableId');
  IF p_lock THEN PERFORM 1 FROM library.books WHERE id=context.book_id FOR UPDATE; END IF;
  SELECT * INTO context FROM library.ai_owned_subject(p_actor,p_change->>'stableId');
  IF NOT library.change_native(context.library_id,context.book_id) THEN RAISE EXCEPTION 'BOOK_NOT_WRITABLE'; END IF;
  SELECT * INTO b FROM library.books WHERE id=context.book_id;
  IF p_lock THEN PERFORM 1 FROM library.book_feedback WHERE book_id=b.id FOR UPDATE; END IF;
  SELECT * INTO f FROM library.book_feedback WHERE book_id=b.id;
  IF b.row_version::text IS DISTINCT FROM p_change->>'expectedVersion' OR f.row_version::text IS DISTINCT FROM p_change->>'expectedFeedbackVersion'
  THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
  p=p_change->'patch';
  IF (CASE WHEN p?'finishedDate' THEN p->>'finishedDate' IS NOT NULL ELSE b.finished_from IS NOT NULL END)
   AND COALESCE(p->>'status',b.status)<>'read' THEN RAISE EXCEPTION 'INVALID_BOOK_CHANGE'; END IF;
  RETURN b.id;
 END $$;
CREATE FUNCTION library.book_change_for_user(p_actor text,p_proposal uuid) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 DECLARE lib uuid;p library.book_change_proposals;
 BEGIN
  lib=library.plan_library(p_actor);
  SELECT * INTO p FROM library.book_change_proposals WHERE id=p_proposal AND library_id=lib AND actor_user_id=p_actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROPOSAL_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  RETURN jsonb_build_object('id',p.id,'digest',p.digest,'change',p.change,'before',p.before_book,
   'expiresAt',to_char(p.expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
   'state',CASE WHEN p.result IS NOT NULL THEN 'committed' WHEN p.expires_at<=now() THEN 'expired' ELSE 'pending' END,'receipt',p.result);
 END $$;
CREATE FUNCTION library.prepare_book_change(p_actor text,p_request_id uuid,p_change jsonb,p_channel text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 DECLARE lib uuid;digest text;prior jsonb;before_book jsonb;new_id uuid;
 BEGIN
  PERFORM library.assert_book_change(p_change);
  IF p_channel IS NULL OR p_channel NOT IN('site','mcp') THEN RAISE EXCEPTION 'INVALID_BOOK_CHANGE'; END IF;
  lib=library.plan_write_context(p_actor,p_request_id,'prepare_book_change');
  PERFORM library.change_permission(lib);
  IF p_change->>'type'='update' THEN
   -- Ownership/native authority is checked before returning any replay.
   PERFORM library.ai_owned_subject(p_actor,p_change->>'stableId');
   IF NOT library.change_native(lib,(SELECT book_id FROM library.ai_owned_subject(p_actor,p_change->>'stableId'))) THEN RAISE EXCEPTION 'BOOK_NOT_WRITABLE'; END IF;
  END IF;
  digest=library.ai_hash(jsonb_build_object('change',p_change,'channel',p_channel));
  prior=library.ai_replay(p_actor,p_request_id,'prepare_book_change',digest);
  IF prior IS NOT NULL THEN RETURN library.book_change_for_user(p_actor,(prior->>'proposalId')::uuid); END IF;
  IF p_change->>'type'='update' THEN
   PERFORM library.change_assert_subject(p_actor,p_change,true);
   before_book=library.editable_book_for_user(p_actor,p_change->>'stableId');
  END IF;
  INSERT INTO library.book_change_proposals(library_id,actor_user_id,change,before_book,digest,channel)
   VALUES(lib,p_actor,p_change,before_book,digest,p_channel) RETURNING id INTO new_id;
  INSERT INTO library.app_operation_receipts(actor_user_id,library_id,operation,request_id,request_sha256,result)
   VALUES(p_actor,lib,'prepare_book_change',p_request_id,digest,jsonb_build_object('proposalId',new_id));
  RETURN library.book_change_for_user(p_actor,new_id);
 END $$;

-- Provenance intentionally names the application actor, never the pooled SQL login.
CREATE FUNCTION library.change_attribute(p_book bigint,p_actor text,p_kind text,p_before jsonb,p_after jsonb) RETURNS void
 LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
 DECLARE k text;v jsonb;t text;
 BEGIN
  FOR k,v IN SELECT key,value FROM jsonb_each(p_after) LOOP
   IF p_before->k IS NOT DISTINCT FROM v OR (NOT p_before?k AND v='null'::jsonb) THEN CONTINUE; END IF;
   t=CASE WHEN k='rating' THEN 'numeric' WHEN k IN('finished_from','finished_to') THEN 'date' WHEN k='authors' THEN 'array' ELSE 'text' END;
   IF t='numeric' AND v<>'null'::jsonb THEN v=to_jsonb(trim_scale((v#>>'{}')::numeric)::text); END IF;
   INSERT INTO library.book_field_provenance(book_id,field_name,origin,actor,produced_at,value_sha256,hash_version)
    VALUES(p_book,p_kind||'.'||k,'user',p_actor,now(),library.value_hash(p_kind||'.'||k,t,v),'pg-jsonb-text-v1')
    ON CONFLICT(book_id,field_name) DO UPDATE SET origin='user',actor=p_actor,provider=NULL,model=NULL,prompt_version=NULL,source_reference=NULL,
     produced_at=now(),reviewed_by=NULL,reviewed_at=NULL,import_run_id=NULL,value_sha256=excluded.value_sha256,hash_version=excluded.hash_version;
  END LOOP;
 END $$;
CREATE FUNCTION library.change_apply(p_actor text,p_library uuid,p_change jsonb,p_proposal uuid) RETURNS jsonb
 LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
 DECLARE p jsonb;b library.books;n library.books;f library.book_feedback;nf library.book_feedback;
  old_book jsonb;new_book jsonb;old_feedback jsonb;new_feedback jsonb;author record;aid bigint;pos integer=0;
  book_changed boolean=false;feedback_changed boolean=false;author_ids jsonb='[]';
 BEGIN
  IF p_change->>'type'='create' THEN
   p=p_change;
   INSERT INTO library.books(stable_id,title,platform,status,finished_from,finished_to,finished_precision,updated_by)
    VALUES(gen_random_uuid()::text,p->>'title',p->>'platform',p->>'status',(p->>'finishedDate')::date,(p->>'finishedDate')::date,
     CASE WHEN p->>'finishedDate' IS NULL THEN 'unknown' ELSE 'day' END,p_actor) RETURNING * INTO b;
   -- Insert in globally deterministic key order, never rename shared lookup rows.
   FOR author IN SELECT value#>>'{}' name,library.change_author_key(value#>>'{}') key FROM jsonb_array_elements(p->'authors') ORDER BY 2 LOOP
    SELECT author_id INTO aid FROM library.author_aliases WHERE alias_key=author.key;
    IF aid IS NULL THEN
     INSERT INTO library.authors(name,name_key,updated_by) VALUES(btrim(author.name),author.key,p_actor) ON CONFLICT(name_key) DO NOTHING;
    END IF;
   END LOOP;
   FOR author IN SELECT value#>>'{}' name,library.change_author_key(value#>>'{}') key FROM jsonb_array_elements(p->'authors') LOOP
    pos=pos+1;
    SELECT author_id INTO aid FROM library.author_aliases WHERE alias_key=author.key;
    IF aid IS NULL THEN SELECT id INTO aid FROM library.authors WHERE name_key=author.key; END IF;
    IF EXISTS(SELECT 1 FROM library.book_authors WHERE book_id=b.id AND author_id=aid) THEN RAISE EXCEPTION 'INVALID_BOOK_CHANGE'; END IF;
    INSERT INTO library.book_authors VALUES(b.id,aid,pos);author_ids=author_ids||to_jsonb(aid::text);
   END LOOP;
   INSERT INTO library.library_books(book_id,library_id) VALUES(b.id,p_library);
   INSERT INTO library.native_books(book_id,library_id,created_by_user_id) VALUES(b.id,p_library,p_actor);
   old_book='{}';
   new_book=jsonb_build_object('title',b.title,'platform',b.platform,'status',b.status,'authors',author_ids);
   IF p?'finishedDate' THEN new_book=new_book||jsonb_build_object('finished_from',b.finished_from,'finished_to',b.finished_to,'finished_precision',b.finished_precision); END IF;
   book_changed=true;
  ELSE
   p=p_change->'patch';
   SELECT * INTO b FROM library.books WHERE id=library.change_assert_subject(p_actor,p_change,true);
   n=b;
   IF p?'platform' THEN n.platform=p->>'platform'; END IF;
   IF p?'status' THEN n.status=p->>'status'; END IF;
   IF p?'finishedDate' THEN
    n.finished_from=(p->>'finishedDate')::date;n.finished_to=n.finished_from;
    n.finished_precision=CASE WHEN n.finished_from IS NULL THEN 'unknown' ELSE 'day' END;
    n.finished_date_raw=NULL;n.finished_year_raw=NULL;
   END IF;
   old_book=jsonb_build_object('platform',b.platform,'status',b.status,'finished_from',b.finished_from,'finished_to',b.finished_to,
    'finished_precision',b.finished_precision,'finished_date_raw',b.finished_date_raw,'finished_year_raw',b.finished_year_raw);
   new_book=jsonb_build_object('platform',n.platform,'status',n.status,'finished_from',n.finished_from,'finished_to',n.finished_to,
    'finished_precision',n.finished_precision,'finished_date_raw',n.finished_date_raw,'finished_year_raw',n.finished_year_raw);
   book_changed=old_book IS DISTINCT FROM new_book;
   IF book_changed THEN
    UPDATE library.books SET platform=n.platform,status=n.status,finished_from=n.finished_from,finished_to=n.finished_to,
     finished_precision=n.finished_precision,finished_date_raw=n.finished_date_raw,finished_year_raw=n.finished_year_raw,
     row_version=b.row_version+1,updated_at=now(),updated_by=p_actor WHERE id=b.id RETURNING * INTO b;
   END IF;
  END IF;
  SELECT * INTO f FROM library.book_feedback WHERE book_id=b.id;
  nf=f;
  IF p?'rating' THEN nf.rating=(p->>'rating')::numeric; END IF;
  IF p?'opinion' THEN nf.opinion=p->>'opinion'; END IF;
  IF p?'notes' THEN nf.notes=p->>'notes'; END IF;
  old_feedback=jsonb_build_object('rating',f.rating,'opinion',f.opinion,'notes',f.notes);
  new_feedback=jsonb_build_object('rating',nf.rating,'opinion',nf.opinion,'notes',nf.notes);
  feedback_changed=old_feedback IS DISTINCT FROM new_feedback;
  IF feedback_changed THEN
   IF f.book_id IS NULL THEN
    INSERT INTO library.book_feedback(book_id,rating,opinion,notes,updated_by) VALUES(b.id,nf.rating,nf.opinion,nf.notes,p_actor) RETURNING * INTO f;
   ELSE
    UPDATE library.book_feedback SET rating=nf.rating,opinion=nf.opinion,notes=nf.notes,row_version=f.row_version+1,updated_at=now(),updated_by=p_actor WHERE book_id=b.id RETURNING * INTO f;
   END IF;
   PERFORM library.change_attribute(b.id,p_actor,'book_feedback',old_feedback,new_feedback);
  END IF;
  IF book_changed THEN PERFORM library.change_attribute(b.id,p_actor,'books',old_book,new_book); END IF;
  RETURN jsonb_build_object('proposalId',p_proposal,'stableId',b.stable_id,'version',b.row_version::text,'feedbackVersion',f.row_version::text,
   'appliedAt',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'changed',book_changed OR feedback_changed);
 END $$;
CREATE FUNCTION library.change_commit(p_actor text,p_request_id uuid,p_proposal uuid,p_digest text,p_confirm boolean) RETURNS jsonb
 LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
 DECLARE lib uuid;p library.book_change_proposals;op text;digest text;prior jsonb;committed_result jsonb;context record;
 BEGIN
  op=CASE WHEN p_confirm THEN 'confirm_and_commit_book_change' ELSE 'commit_book_change' END;
  lib=library.plan_write_context(p_actor,p_request_id,op);
  PERFORM library.change_permission(lib);
  SELECT * INTO p FROM library.book_change_proposals WHERE id=p_proposal AND library_id=lib AND actor_user_id=p_actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROPOSAL_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF p_digest IS NULL OR p.digest<>p_digest THEN RAISE EXCEPTION 'PROPOSAL_DIGEST_MISMATCH'; END IF;
  IF p.digest<>library.ai_hash(jsonb_build_object('change',p.change,'channel',p.channel)) THEN RAISE EXCEPTION 'PROPOSAL_DIGEST_MISMATCH'; END IF;
  PERFORM library.assert_book_change(p.change);
  IF p.change->>'type'='update' OR p.result IS NOT NULL THEN
   SELECT * INTO context FROM library.ai_owned_subject(p_actor,COALESCE(p.result->>'stableId',p.change->>'stableId'));
   IF NOT library.change_native(lib,context.book_id) THEN RAISE EXCEPTION 'BOOK_NOT_WRITABLE'; END IF;
  END IF;
  digest=library.ai_hash(jsonb_build_object('proposalId',p_proposal,'digest',p_digest));
  prior=library.ai_replay(p_actor,p_request_id,op,digest);
  IF prior IS NOT NULL THEN RETURN prior; END IF;
  IF p.result IS NOT NULL THEN committed_result=p.result;
  ELSE
   IF p.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'PROPOSAL_EXPIRED'; END IF;
   IF NOT p_confirm AND p.confirmed_at IS NULL THEN RAISE EXCEPTION 'CONFIRMATION_REQUIRED'; END IF;
   committed_result=library.change_apply(p_actor,lib,p.change,p.id);
   UPDATE library.book_change_proposals SET confirmed_at=COALESCE(confirmed_at,now()),result=committed_result WHERE id=p.id;
  END IF;
  INSERT INTO library.app_operation_receipts(actor_user_id,library_id,operation,request_id,request_sha256,result)
   VALUES(p_actor,lib,op,p_request_id,digest,committed_result);
  RETURN committed_result;
 END $$;
CREATE FUNCTION library.commit_book_change(p_actor text,p_request_id uuid,p_proposal uuid,p_digest text) RETURNS jsonb
 LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT library.change_commit(p_actor,p_request_id,p_proposal,p_digest,false)
 $$;
CREATE FUNCTION library.confirm_and_commit_book_change(p_actor text,p_request_id uuid,p_proposal uuid,p_digest text) RETURNS jsonb
 LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT library.change_commit(p_actor,p_request_id,p_proposal,p_digest,true)
 $$;
REVOKE ALL ON library.native_write_permissions,library.native_books,library.book_change_proposals FROM PUBLIC,library_app_runtime,library_ai_producer;
DO $private$
DECLARE f record;
BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='library' AND (left(p.proname,7)='change_' OR p.proname IN('assert_book_change','book_change_immutable',
   'prepare_book_change','book_change_for_user','editable_book_for_user','commit_book_change','confirm_and_commit_book_change')) LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',f.signature);
 END LOOP;
END $private$;
GRANT EXECUTE ON FUNCTION library.prepare_book_change(text,uuid,jsonb,text),library.book_change_for_user(text,uuid),
 library.editable_book_for_user(text,text),library.commit_book_change(text,uuid,uuid,text),
 library.confirm_and_commit_book_change(text,uuid,uuid,text) TO library_app_runtime;
