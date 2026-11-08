-- Scoped derived-result operations. No provider calls or hosted writer login.
SET LOCAL ROLE library_owner;
CREATE TABLE library.ai_result_policies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 stream_id uuid NOT NULL,
 library_id uuid NOT NULL,
 revision bigint NOT NULL CHECK(revision>0),
 rubric_version text NOT NULL,
 producer jsonb NOT NULL CHECK(jsonb_typeof(producer)='object'),
 actor_user_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(stream_id,revision),
 FOREIGN KEY(stream_id,library_id) REFERENCES library.ai_result_streams(id,library_id) ON DELETE RESTRICT,
 FOREIGN KEY(library_id,actor_user_id) REFERENCES library.user_libraries(id,owner_user_id) ON DELETE RESTRICT
);
ALTER TABLE library.ai_result_streams ADD COLUMN policy_revision bigint;
ALTER TABLE library.ai_result_streams ADD CONSTRAINT ai_result_current_policy_fk
 FOREIGN KEY(id,policy_revision) REFERENCES library.ai_result_policies(stream_id,revision) ON DELETE RESTRICT;
CREATE TRIGGER immutable_revision BEFORE UPDATE OR DELETE ON library.ai_result_policies
 FOR EACH ROW EXECUTE FUNCTION library.prevent_app_revision_rewrite();
REVOKE ALL ON library.ai_result_policies FROM PUBLIC;

CREATE FUNCTION library.ai_keys(v jsonb,expected text[]) RETURNS boolean
 LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
 BEGIN
  IF jsonb_typeof(v) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  RETURN v ?& expected AND (SELECT count(*) FROM jsonb_object_keys(v))=cardinality(expected);
 END $$;

CREATE FUNCTION library.ai_text(v jsonb,max_units integer) RETURNS boolean
 LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT COALESCE(jsonb_typeof(v)='string' AND (v#>>'{}') ~ U&'[^\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]'
  AND length(v#>>'{}')+regexp_count(v#>>'{}',U&'[\+010000-\+10FFFF]')<=max_units,false)
 $$;
CREATE FUNCTION library.ai_counter(v jsonb) RETURNS boolean
 LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
 BEGIN
  IF jsonb_typeof(v) IS DISTINCT FROM 'string' OR (v#>>'{}') !~ '^[1-9][0-9]{0,18}$' THEN RETURN false; END IF;
  RETURN (v#>>'{}')::numeric<=9223372036854775807;
 END $$;
CREATE FUNCTION library.ai_hash(v jsonb) RETURNS text
 LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT encode(sha256(convert_to(v::text,'UTF8')),'hex') $$;
CREATE FUNCTION library.ai_assert_producer(v jsonb) RETURNS void
 LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
 BEGIN
  IF NOT library.ai_text(v->'id',200) THEN RAISE EXCEPTION 'INVALID_AI_REQUEST'; END IF;
  IF v->>'kind'='application' THEN
   IF library.ai_keys(v,ARRAY['kind','id','version']) AND library.ai_text(v->'version',200) THEN RETURN; END IF;
  ELSIF v->>'kind'='model' THEN
   IF library.ai_keys(v,ARRAY['kind','id','provider','model','promptVersion'])
    AND library.ai_text(v->'provider',200) AND library.ai_text(v->'model',200)
    AND library.ai_text(v->'promptVersion',200) THEN RETURN; END IF;
  END IF;
  RAISE EXCEPTION 'INVALID_AI_REQUEST';
 END $$;
CREATE FUNCTION library.ai_assert_sources(v jsonb) RETURNS void
 LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
 DECLARE item jsonb;
 BEGIN
  IF jsonb_typeof(v) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'INVALID_AI_REQUEST'; END IF;
  IF jsonb_array_length(v) NOT BETWEEN 1 AND 128 THEN RAISE EXCEPTION 'INVALID_AI_REQUEST'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(v) LOOP
   IF NOT library.ai_keys(item,ARRAY['reference','revision']) OR NOT library.ai_text(item->'reference',2000)
    OR NOT (item->'revision'='null'::jsonb OR library.ai_counter(item->'revision'))
   THEN RAISE EXCEPTION 'INVALID_AI_REQUEST'; END IF;
  END LOOP;
 END $$;
CREATE FUNCTION library.ai_assert_payload(p_kind text,v jsonb) RETURNS void
 LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
 DECLARE item jsonb;items jsonb;names text[]='{}';n numeric;lo numeric;hi numeric;
 BEGIN
  IF v IS NULL OR octet_length(v::text)>1048576 THEN RAISE EXCEPTION 'INVALID_AI_REQUEST'; END IF;
  PERFORM library.ai_assert_sources(v->'sources');
  IF p_kind='enrichment' THEN
   IF NOT library.ai_keys(v,ARRAY['description','tags','sources']) OR NOT library.ai_text(v->'description',20000)
    OR jsonb_typeof(v->'tags') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'INVALID_AI_REQUEST'; END IF;
   IF jsonb_array_length(v->'tags')>64 THEN RAISE EXCEPTION 'INVALID_AI_REQUEST'; END IF;
   FOR item IN SELECT value FROM jsonb_array_elements(v->'tags') LOOP
    IF NOT library.ai_text(item,100) THEN RAISE EXCEPTION 'INVALID_AI_REQUEST'; END IF;
   END LOOP;
  ELSIF p_kind='taste' THEN
   IF NOT library.ai_keys(v,ARRAY['scores','sources']) OR jsonb_typeof(v->'scores') IS DISTINCT FROM 'array'
   THEN RAISE EXCEPTION 'INVALID_AI_REQUEST'; END IF;
   items=v->'scores';
   IF jsonb_array_length(items) NOT BETWEEN 1 AND 64 THEN RAISE EXCEPTION 'INVALID_AI_REQUEST'; END IF;
   FOR item IN SELECT value FROM jsonb_array_elements(items) LOOP
    IF NOT library.ai_keys(item,ARRAY['factor','value','min','max']) OR NOT library.ai_text(item->'factor',200)
     OR jsonb_typeof(item->'value') IS DISTINCT FROM 'number' OR jsonb_typeof(item->'min') IS DISTINCT FROM 'number'
     OR jsonb_typeof(item->'max') IS DISTINCT FROM 'number' OR item->>'factor'=ANY(names)
    THEN RAISE EXCEPTION 'INVALID_AI_REQUEST'; END IF;
    names=array_append(names,item->>'factor');
    n=(item->>'value')::numeric;lo=(item->>'min')::numeric;hi=(item->>'max')::numeric;
    IF abs(n)>1.7976931348623157e308 OR abs(lo)>1.7976931348623157e308 OR abs(hi)>1.7976931348623157e308
     OR lo>=hi OR n<lo OR n>hi THEN RAISE EXCEPTION 'INVALID_AI_REQUEST'; END IF;
    IF lo::double precision>=hi::double precision THEN RAISE EXCEPTION 'INVALID_AI_REQUEST'; END IF;
   END LOOP;
  ELSIF p_kind='format' THEN
   IF NOT library.ai_keys(v,ARRAY['judgments','sources']) OR jsonb_typeof(v->'judgments') IS DISTINCT FROM 'array'
   THEN RAISE EXCEPTION 'INVALID_AI_REQUEST'; END IF;
   items=v->'judgments';
   IF jsonb_array_length(items) NOT BETWEEN 1 AND 2 THEN RAISE EXCEPTION 'INVALID_AI_REQUEST'; END IF;
   FOR item IN SELECT value FROM jsonb_array_elements(items) LOOP
    IF COALESCE(item->>'platform','') NOT IN ('Kindle','Audible') OR item->>'platform'=ANY(names)
    THEN RAISE EXCEPTION 'INVALID_AI_REQUEST'; END IF;
    names=array_append(names,item->>'platform');
    IF item->>'state'='unknown' AND library.ai_keys(item,ARRAY['platform','state']) THEN CONTINUE; END IF;
    IF item->>'state'='known' AND library.ai_keys(item,ARRAY['platform','state','editionReference','suitability'])
     AND library.ai_text(item->'editionReference',2000) AND item->>'suitability' IN ('suitable','unsuitable','mixed') THEN CONTINUE; END IF;
    RAISE EXCEPTION 'INVALID_AI_REQUEST';
   END LOOP;
  ELSE RAISE EXCEPTION 'INVALID_AI_REQUEST'; END IF;
 EXCEPTION WHEN numeric_value_out_of_range THEN RAISE EXCEPTION 'INVALID_AI_REQUEST';
 END $$;

CREATE FUNCTION library.ai_owned_subject(p_actor text,p_stable text) RETURNS TABLE(library_id uuid,book_id bigint)
 LANGUAGE plpgsql STABLE SET search_path=pg_catalog,pg_temp AS $$
 BEGIN
  RETURN QUERY SELECT l.id,b.id FROM library.user_libraries l
   JOIN auth."user" u ON u.id=l.owner_user_id AND u."emailVerified"=true
   JOIN library.library_books m ON m.library_id=l.id JOIN library.books b ON b.id=m.book_id
   WHERE l.owner_user_id=p_actor AND b.stable_id=p_stable AND b.archived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOK_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 END $$;
CREATE FUNCTION library.ai_write_context(p_actor text,p_request uuid,p_operation text,p_stable text)
 RETURNS TABLE(library_id uuid,book_id bigint)
 LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
 DECLARE context record;
 BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'UNSUPPORTED_AI_ISOLATION'; END IF;
  IF p_request IS NULL THEN RAISE EXCEPTION 'INVALID_AI_REQUEST'; END IF;
  SELECT * INTO context FROM library.ai_owned_subject(p_actor,p_stable);
  PERFORM pg_advisory_xact_lock_shared(73421,2);
  PERFORM pg_advisory_xact_lock(73423,hashtext(p_actor||':'||p_operation||':'||p_request::text));
  PERFORM pg_advisory_xact_lock(73422,hashtext(context.library_id::text));
  RETURN QUERY SELECT * FROM library.ai_owned_subject(p_actor,p_stable);
 END $$;
CREATE FUNCTION library.ai_replay(p_actor text,p_request uuid,p_operation text,p_hash text) RETURNS jsonb
 LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
 DECLARE prior library.app_operation_receipts;
 BEGIN
  SELECT * INTO prior FROM library.app_operation_receipts r
   WHERE r.actor_user_id=p_actor AND r.operation=p_operation AND r.request_id=p_request;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF prior.request_sha256<>p_hash THEN RAISE EXCEPTION 'REQUEST_REPLAY_MISMATCH'; END IF;
  RETURN prior.result;
 END $$;

CREATE FUNCTION library.configure_ai_result(p_actor text,p_request_id uuid,p_expected_policy bigint,p_request jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 DECLARE context record;s library.ai_result_streams;policy library.ai_result_policies;
  digest text;prior jsonb;result jsonb;descriptor jsonb;
 BEGIN
  IF NOT library.ai_keys(p_request,ARRAY['bookStableId','kind','rubricVersion','producer'])
   OR NOT library.ai_text(p_request->'bookStableId',500) OR NOT library.ai_text(p_request->'rubricVersion',200)
   OR COALESCE(p_request->>'kind','') NOT IN ('enrichment','taste','format') OR octet_length(p_request::text)>1048576
  THEN RAISE EXCEPTION 'INVALID_AI_REQUEST'; END IF;
  PERFORM library.ai_assert_producer(p_request->'producer');
  SELECT * INTO context FROM library.ai_write_context(p_actor,p_request_id,'configure_ai_result',p_request->>'bookStableId');
  digest=library.ai_hash(jsonb_build_object('expectedPolicyRevision',p_expected_policy::text,'request',p_request));
  prior=library.ai_replay(p_actor,p_request_id,'configure_ai_result',digest);
  IF prior IS NOT NULL THEN RETURN prior; END IF;
  PERFORM 1 FROM library.books WHERE id=context.book_id FOR UPDATE;
  PERFORM library.ai_owned_subject(p_actor,p_request->>'bookStableId');
  INSERT INTO library.ai_result_streams(library_id,book_id,kind)
   VALUES(context.library_id,context.book_id,p_request->>'kind') ON CONFLICT(library_id,book_id,kind) DO NOTHING;
  SELECT * INTO s FROM library.ai_result_streams WHERE library_id=context.library_id AND book_id=context.book_id AND kind=p_request->>'kind' FOR UPDATE;
  IF s.policy_revision IS DISTINCT FROM p_expected_policy THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
  SELECT * INTO policy FROM library.ai_result_policies WHERE stream_id=s.id AND revision=s.policy_revision;
  IF policy.id IS NULL OR policy.rubric_version IS DISTINCT FROM p_request->>'rubricVersion'
   OR policy.producer IS DISTINCT FROM p_request->'producer' THEN
   INSERT INTO library.ai_result_policies(stream_id,library_id,revision,rubric_version,producer,actor_user_id)
    VALUES(s.id,s.library_id,COALESCE(s.policy_revision,0)+1,p_request->>'rubricVersion',p_request->'producer',p_actor)
    RETURNING * INTO policy;
   UPDATE library.ai_result_streams SET policy_revision=policy.revision WHERE id=s.id;
  END IF;
  result=jsonb_build_object('streamId',s.id,'policyId',policy.id,'policyRevision',policy.revision::text);
  INSERT INTO library.app_operation_receipts(actor_user_id,library_id,operation,request_id,request_sha256,result)
   VALUES(p_actor,s.library_id,'configure_ai_result',p_request_id,digest,result);
  RETURN result;
 END $$;

CREATE FUNCTION library.ai_field_map() RETURNS jsonb
 LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT '{"title":"books.title","authors":"books.authors","genres":"books.genres","status":"books.status","platform":"books.platform","coverUrl":"books.cover_url","seriesName":"books.series_id","seriesVolume":"books.series_volume","rating":"book_feedback.rating","finishedFrom":"books.finished_from","finishedTo":"books.finished_to","finishedPrecision":"books.finished_precision","wordCount":"books.word_count","opinion":"book_feedback.opinion","notes":"book_feedback.notes","whyNext":"books.why_next"}'::jsonb $$;
CREATE FUNCTION library.ai_assert_fields(v jsonb) RETURNS void
 LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
 DECLARE item jsonb;names text[]='{}';
 BEGIN
  IF jsonb_typeof(v) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'INVALID_AI_REQUEST'; END IF;
  IF jsonb_array_length(v) NOT BETWEEN 1 AND 16 THEN RAISE EXCEPTION 'INVALID_AI_REQUEST'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(v) LOOP
   IF jsonb_typeof(item) IS DISTINCT FROM 'string' OR NOT (library.ai_field_map() ? (item#>>'{}'))
    OR (item#>>'{}')=ANY(names) THEN RAISE EXCEPTION 'INVALID_AI_REQUEST'; END IF;
   names=array_append(names,item#>>'{}');
  END LOOP;
 END $$;
CREATE FUNCTION library.ai_assert_uuid_array(v jsonb,max_count integer) RETURNS void
 LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
 DECLARE item jsonb;ids uuid[]='{}';id uuid;
 BEGIN
  IF jsonb_typeof(v) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'INVALID_AI_REQUEST'; END IF;
  IF jsonb_array_length(v)>max_count THEN RAISE EXCEPTION 'INVALID_AI_REQUEST'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(v) LOOP
   IF jsonb_typeof(item) IS DISTINCT FROM 'string' OR (item#>>'{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   THEN RAISE EXCEPTION 'INVALID_AI_REQUEST'; END IF;
   id=(item#>>'{}')::uuid;
   IF id=ANY(ids) THEN RAISE EXCEPTION 'INVALID_AI_REQUEST'; END IF;
   ids=array_append(ids,id);
  END LOOP;
 END $$;
CREATE FUNCTION library.ai_assert_selector(v jsonb) RETURNS void
 LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
 DECLARE item jsonb;names text[]='{}';
 BEGIN
  IF NOT (library.ai_keys(v,ARRAY['fields','resultRevisionIds']) OR
          library.ai_keys(v,ARRAY['fields','resultRevisionIds','relatedBooks']))
  THEN RAISE EXCEPTION 'INVALID_AI_REQUEST'; END IF;
  PERFORM library.ai_assert_fields(v->'fields');
  PERFORM library.ai_assert_uuid_array(v->'resultRevisionIds',127);
  IF v ? 'relatedBooks' THEN
   IF jsonb_typeof(v->'relatedBooks') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'INVALID_AI_REQUEST'; END IF;
   IF jsonb_array_length(v->'relatedBooks')>127 THEN RAISE EXCEPTION 'INVALID_AI_REQUEST'; END IF;
   FOR item IN SELECT value FROM jsonb_array_elements(v->'relatedBooks') LOOP
    IF NOT library.ai_keys(item,ARRAY['bookStableId','fields']) OR NOT library.ai_text(item->'bookStableId',500)
     OR item->>'bookStableId'=ANY(names) THEN RAISE EXCEPTION 'INVALID_AI_REQUEST'; END IF;
    names=array_append(names,item->>'bookStableId');
    PERFORM library.ai_assert_fields(item->'fields');
   END LOOP;
  END IF;
 END $$;

CREATE FUNCTION library.ai_all_book_hashes(p_actor text,p_stable text) RETURNS jsonb
 LANGUAGE plpgsql STABLE SET search_path=pg_catalog,pg_temp AS $$
 DECLARE context record;detail jsonb;result jsonb;
 BEGIN
  SELECT * INTO context FROM library.ai_owned_subject(p_actor,p_stable);
  detail=library.book_for_user(p_actor,p_stable);
  IF detail IS NULL THEN RAISE EXCEPTION 'BOOK_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  SELECT jsonb_object_agg(f.key,library.value_hash('ai.input.'||f.key,'json',
    jsonb_build_object('value',detail->f.key,'provenance',to_jsonb(p)))) INTO result
   FROM jsonb_each_text(library.ai_field_map()) f
   LEFT JOIN library.book_field_provenance p ON p.book_id=context.book_id AND p.field_name=f.value;
  RETURN result;
 END $$;

CREATE FUNCTION library.ai_current_inputs(p_actor text,p_stable text,p_kind text,p_selector jsonb,p_cache jsonb DEFAULT '{}') RETURNS jsonb
 LANGUAGE plpgsql STABLE SET search_path=pg_catalog,pg_temp AS $$
 DECLARE context record;policy record;fields jsonb;hashes jsonb;all_hashes jsonb;
  preferences jsonb='[]';deps jsonb;related jsonb='[]';item jsonb;part jsonb;manifest jsonb;descriptor jsonb;
 BEGIN
  IF COALESCE(p_kind,'') NOT IN ('enrichment','taste','format') THEN RAISE EXCEPTION 'INVALID_AI_REQUEST'; END IF;
  PERFORM library.ai_assert_selector(p_selector);
  SELECT * INTO context FROM library.ai_owned_subject(p_actor,p_stable);
  SELECT s.id,s.policy_revision,p.rubric_version,p.producer INTO policy
   FROM library.ai_result_streams s JOIN library.ai_result_policies p ON p.stream_id=s.id AND p.revision=s.policy_revision
   WHERE s.library_id=context.library_id AND s.book_id=context.book_id AND s.kind=p_kind;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESULT_POLICY_UNAVAILABLE'; END IF;
  PERFORM library.ai_assert_producer(policy.producer);
  IF NOT library.ai_text(to_jsonb(policy.rubric_version),200) THEN RAISE EXCEPTION 'INVALID_AI_REQUEST'; END IF;
  all_hashes=COALESCE(p_cache->p_stable,library.ai_all_book_hashes(p_actor,p_stable));
  SELECT jsonb_agg(to_jsonb(value) ORDER BY value),jsonb_object_agg(value,all_hashes->value)
   INTO fields,hashes FROM jsonb_array_elements_text(p_selector->'fields');
  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(p_selector->'relatedBooks','[]')) ORDER BY value->>'bookStableId' LOOP
   IF item->>'bookStableId'=p_stable THEN RAISE EXCEPTION 'INVALID_AI_REQUEST'; END IF;
   all_hashes=COALESCE(p_cache->(item->>'bookStableId'),library.ai_all_book_hashes(p_actor,item->>'bookStableId'));
   SELECT jsonb_build_object('bookStableId',item->>'bookStableId',
    'fields',jsonb_agg(to_jsonb(value) ORDER BY value),'fieldHashes',jsonb_object_agg(value,all_hashes->value))
    INTO part FROM jsonb_array_elements_text(item->'fields');
   related=related||jsonb_build_array(part);
  END LOOP;
  SELECT COALESCE(jsonb_agg(to_jsonb(value::uuid::text) ORDER BY value::uuid::text),'[]') INTO deps
   FROM jsonb_array_elements_text(p_selector->'resultRevisionIds');
  IF (SELECT count(*) FROM library.ai_result_revisions r WHERE r.library_id=context.library_id
    AND r.id IN (SELECT value::uuid FROM jsonb_array_elements_text(deps)))<>jsonb_array_length(deps)
  THEN RAISE EXCEPTION 'INVALID_DEPENDENCY'; END IF;
  IF p_kind IN ('taste','format') THEN
   SELECT COALESCE(jsonb_agg(to_jsonb(id::text) ORDER BY id),'[]') INTO preferences FROM (
    SELECT DISTINCT ON (preference_id) id,decision FROM library.preference_evidence
    WHERE library_id=context.library_id ORDER BY preference_id,revision DESC
   ) current_evidence WHERE decision='accepted';
   IF jsonb_array_length(preferences)>128 THEN RAISE EXCEPTION 'DEPENDENCY_LIMIT_EXCEEDED'; END IF;
  END IF;
  descriptor=jsonb_build_object('rubricVersion',policy.rubric_version,'producer',policy.producer);
  manifest=jsonb_build_object('schemaVersion',1,'hashVersion','pg-jsonb-text-v1','bookStableId',p_stable,'kind',p_kind,
   'fields',fields,'fieldHashes',hashes,'relatedBooks',related,'preferenceRevisionIds',preferences,'resultRevisionIds',deps,
   'policyRevision',policy.policy_revision::text,'policyHash',library.ai_hash(descriptor));
  RETURN jsonb_build_object('manifest',manifest,'fingerprint',library.ai_hash(manifest),'policy',descriptor);
 END $$;

CREATE FUNCTION library.ai_dependency_graph(p_library uuid,p_ids jsonb,p_exclude_stream uuid) RETURNS uuid[]
 LANGUAGE plpgsql STABLE SET search_path=pg_catalog,pg_temp AS $$
 DECLARE ids uuid[];
 BEGIN
  PERFORM library.ai_assert_uuid_array(p_ids,127);
  WITH RECURSIVE graph(id) AS (
   SELECT value::uuid FROM jsonb_array_elements_text(p_ids)
   UNION
   SELECT value::uuid FROM graph g JOIN library.ai_result_revisions r ON r.id=g.id AND r.library_id=p_library
    CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(r.input_manifest->'resultRevisionIds')='array'
     THEN r.input_manifest->'resultRevisionIds' ELSE '[]'::jsonb END) v(value)
  ) SELECT COALESCE(array_agg(id),'{}'::uuid[]) INTO ids FROM (SELECT id FROM graph LIMIT 128) bounded;
  IF cardinality(ids)>127 THEN RAISE EXCEPTION 'DEPENDENCY_LIMIT_EXCEEDED'; END IF;
  IF (SELECT count(*) FROM library.ai_result_revisions WHERE id=ANY(ids) AND library_id=p_library)<>cardinality(ids)
   OR EXISTS(SELECT 1 FROM library.ai_result_revisions WHERE id=ANY(ids) AND stream_id=p_exclude_stream)
  THEN RAISE EXCEPTION 'INVALID_DEPENDENCY'; END IF;
  RETURN ids;
 END $$;

CREATE FUNCTION library.ai_dependencies_state(p_actor text,p_library uuid,p_roots uuid[],p_root uuid DEFAULT NULL) RETURNS text
 LANGUAGE plpgsql STABLE SET search_path=pg_catalog,pg_temp AS $$
 DECLARE stack uuid[]=p_roots;exits boolean[]=array_fill(false,ARRAY[cardinality(p_roots)]);
  active uuid[]='{}';done uuid[]='{}';node_id uuid;leaving boolean;n record;old_policy record;
  manifest jsonb;current_context jsonb;selection jsonb;dep text;book text;cache jsonb='{}';calc text;
 BEGIN
  WHILE cardinality(stack)>0 LOOP
   node_id=stack[cardinality(stack)];leaving=exits[cardinality(exits)];
   stack=stack[1:cardinality(stack)-1];exits=exits[1:cardinality(exits)-1];
   IF leaving THEN active=array_remove(active,node_id);done=array_append(done,node_id);CONTINUE; END IF;
   IF node_id=ANY(active) THEN RETURN 'unavailable'; END IF;
   IF node_id=ANY(done) THEN CONTINUE; END IF;
   IF cardinality(active)+cardinality(done)>=128 THEN RETURN 'unavailable'; END IF;
   SELECT r.*,s.kind,s.book_id,b.stable_id,s.head_revision_id INTO n
    FROM library.ai_result_revisions r JOIN library.ai_result_streams s ON s.id=r.stream_id
    JOIN library.books b ON b.id=s.book_id WHERE r.id=node_id AND r.library_id=p_library;
   IF NOT FOUND THEN RETURN 'unavailable'; END IF;
   IF n.head_revision_id IS DISTINCT FROM node_id THEN RETURN 'inputs_changed'; END IF;
   manifest=n.input_manifest;
   IF NOT library.ai_keys(manifest,ARRAY['schemaVersion','hashVersion','bookStableId','kind','fields','fieldHashes','relatedBooks',
    'preferenceRevisionIds','resultRevisionIds','policyRevision','policyHash']) OR manifest->'schemaVersion'<>'1'::jsonb
    OR manifest->>'hashVersion'<>'pg-jsonb-text-v1' OR manifest->>'bookStableId'<>n.stable_id OR manifest->>'kind'<>n.kind
    OR NOT library.ai_counter(manifest->'policyRevision') OR n.input_fingerprint<>library.ai_hash(manifest)
   THEN RETURN 'unavailable'; END IF;
   PERFORM library.ai_assert_payload(n.kind,n.payload);
   PERFORM library.ai_assert_producer(n.producer);
   calc=to_char(n.calculated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
   IF length(calc)<>24 OR NOT library.ai_text(to_jsonb(n.rubric_version),200) THEN RETURN 'unavailable'; END IF;
   SELECT * INTO old_policy FROM library.ai_result_policies
    WHERE stream_id=n.stream_id AND revision=(manifest->>'policyRevision')::bigint;
   IF NOT FOUND OR old_policy.rubric_version IS DISTINCT FROM n.rubric_version OR old_policy.producer IS DISTINCT FROM n.producer
    OR library.ai_hash(jsonb_build_object('rubricVersion',old_policy.rubric_version,'producer',old_policy.producer)) IS DISTINCT FROM manifest->>'policyHash'
   THEN RETURN 'unavailable'; END IF;
   IF jsonb_typeof(manifest->'relatedBooks') IS DISTINCT FROM 'array' THEN RETURN 'unavailable'; END IF;
   selection=jsonb_build_object('fields',manifest->'fields','resultRevisionIds',manifest->'resultRevisionIds','relatedBooks',
    (SELECT COALESCE(jsonb_agg(value-'fieldHashes'),'[]') FROM jsonb_array_elements(manifest->'relatedBooks')));
   PERFORM library.ai_assert_selector(selection);
   FOR book IN SELECT n.stable_id UNION SELECT value->>'bookStableId' FROM jsonb_array_elements(manifest->'relatedBooks') LOOP
    IF NOT cache ? book THEN
     IF (SELECT count(*) FROM jsonb_object_keys(cache))>=512 THEN RETURN 'unavailable'; END IF;
     cache=cache||jsonb_build_object(book,library.ai_all_book_hashes(p_actor,book));
    END IF;
   END LOOP;
   current_context=library.ai_current_inputs(p_actor,n.stable_id,n.kind,selection,cache);
   IF current_context->'manifest'->'policyRevision' IS DISTINCT FROM manifest->'policyRevision'
    OR current_context->'manifest'->'policyHash' IS DISTINCT FROM manifest->'policyHash'
   THEN RETURN CASE WHEN node_id=p_root THEN 'versions_changed' ELSE 'inputs_changed' END; END IF;
   IF current_context->'manifest' IS DISTINCT FROM manifest THEN RETURN 'inputs_changed'; END IF;
   active=array_append(active,node_id);stack=array_append(stack,node_id);exits=array_append(exits,true);
   FOR dep IN SELECT value FROM jsonb_array_elements_text(manifest->'resultRevisionIds') LOOP
    stack=array_append(stack,dep::uuid);exits=array_append(exits,false);
   END LOOP;
  END LOOP;
  RETURN NULL;
 EXCEPTION
  WHEN SQLSTATE 'P0002' THEN RETURN 'source_unavailable';
  WHEN SQLSTATE 'P0001' OR invalid_text_representation OR invalid_parameter_value OR numeric_value_out_of_range THEN RETURN 'unavailable';
 END $$;

CREATE FUNCTION library.ai_result_inputs_for_user(p_actor text,p_stable text,p_kind text,p_selector jsonb) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 DECLARE context record;s uuid;ids uuid[];result jsonb;
 BEGIN
  result=library.ai_current_inputs(p_actor,p_stable,p_kind,p_selector);
  SELECT * INTO context FROM library.ai_owned_subject(p_actor,p_stable);
  SELECT id INTO s FROM library.ai_result_streams WHERE library_id=context.library_id AND book_id=context.book_id AND kind=p_kind;
  ids=library.ai_dependency_graph(context.library_id,p_selector->'resultRevisionIds',s);
  IF library.ai_dependencies_state(p_actor,context.library_id,ids) IS NOT NULL THEN RAISE EXCEPTION 'STALE_DEPENDENCY'; END IF;
  RETURN result;
 END $$;

CREATE FUNCTION library.publish_ai_result(p_actor text,p_request_id uuid,p_expected_revision bigint,p_request jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 DECLARE context record;s library.ai_result_streams;policy library.ai_result_policies;
  digest text;prior jsonb;selection jsonb;current_context jsonb;ids uuid[];books text[];book_ids bigint[];book text;
  current_revision bigint;next_revision bigint;new_id uuid;result jsonb;calculated timestamptz;
 BEGIN
  IF NOT library.ai_keys(p_request,ARRAY['bookStableId','kind','inputs','payload','calculatedAt'])
   OR NOT library.ai_text(p_request->'bookStableId',500) OR COALESCE(p_request->>'kind','') NOT IN ('enrichment','taste','format')
   OR NOT library.ai_keys(p_request->'inputs',ARRAY['manifest','fingerprint','policy']) OR octet_length(p_request::text)>1048576
   OR COALESCE(p_request->>'calculatedAt','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
   OR (p_expected_revision IS NOT NULL AND p_expected_revision<1)
  THEN RAISE EXCEPTION 'INVALID_AI_REQUEST'; END IF;
  PERFORM library.ai_assert_payload(p_request->>'kind',p_request->'payload');
  BEGIN
   calculated=(p_request->>'calculatedAt')::timestamptz;
   IF to_char(calculated AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')<>p_request->>'calculatedAt'
   THEN RAISE EXCEPTION 'INVALID_AI_REQUEST'; END IF;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'INVALID_AI_REQUEST'; END;
  SELECT * INTO context FROM library.ai_write_context(p_actor,p_request_id,'publish_ai_result',p_request->>'bookStableId');
  digest=library.ai_hash(jsonb_build_object('expectedRevision',p_expected_revision::text,'request',p_request));
  prior=library.ai_replay(p_actor,p_request_id,'publish_ai_result',digest);
  IF prior IS NOT NULL THEN RETURN prior; END IF;
  SELECT * INTO s FROM library.ai_result_streams WHERE library_id=context.library_id AND book_id=context.book_id AND kind=p_request->>'kind';
  IF NOT FOUND OR s.policy_revision IS NULL THEN RAISE EXCEPTION 'RESULT_POLICY_UNAVAILABLE'; END IF;
  selection=jsonb_build_object('fields',p_request->'inputs'->'manifest'->'fields',
   'resultRevisionIds',p_request->'inputs'->'manifest'->'resultRevisionIds','relatedBooks',
   (SELECT COALESCE(jsonb_agg(value-'fieldHashes'),'[]') FROM jsonb_array_elements(COALESCE(p_request->'inputs'->'manifest'->'relatedBooks','[]'))));
  PERFORM library.ai_assert_selector(selection);
  ids=library.ai_dependency_graph(context.library_id,selection->'resultRevisionIds',s.id);
  SELECT array_agg(DISTINCT stable) INTO books FROM (
   SELECT p_request->>'bookStableId' AS stable
   UNION SELECT value->>'bookStableId' FROM jsonb_array_elements(selection->'relatedBooks')
   UNION SELECT b.stable_id FROM library.ai_result_revisions r JOIN library.ai_result_streams ds ON ds.id=r.stream_id
    JOIN library.books b ON b.id=ds.book_id WHERE r.id=ANY(ids)
   UNION SELECT value->>'bookStableId' FROM library.ai_result_revisions r
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.input_manifest->'relatedBooks','[]')) v(value) WHERE r.id=ANY(ids)
  ) subjects;
  IF cardinality(books)>512 THEN RAISE EXCEPTION 'DEPENDENCY_LIMIT_EXCEEDED'; END IF;
  SELECT array_agg(b.id ORDER BY b.id) INTO book_ids FROM library.books b JOIN library.library_books m ON m.book_id=b.id
   WHERE m.library_id=context.library_id AND b.stable_id=ANY(books);
  IF cardinality(book_ids) IS DISTINCT FROM cardinality(books) THEN RAISE EXCEPTION 'INVALID_DEPENDENCY'; END IF;
  PERFORM 1 FROM library.books WHERE id=ANY(book_ids) ORDER BY id FOR UPDATE;
  PERFORM library.ai_owned_subject(p_actor,p_request->>'bookStableId');
  SELECT * INTO s FROM library.ai_result_streams WHERE id=s.id FOR UPDATE;
  SELECT revision INTO current_revision FROM library.ai_result_revisions WHERE id=s.head_revision_id;
  IF current_revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
  current_context=library.ai_current_inputs(p_actor,p_request->>'bookStableId',p_request->>'kind',selection);
  IF current_context IS DISTINCT FROM p_request->'inputs' THEN RAISE EXCEPTION 'INPUTS_CHANGED'; END IF;
  IF library.ai_dependencies_state(p_actor,context.library_id,ids) IS NOT NULL THEN RAISE EXCEPTION 'STALE_DEPENDENCY'; END IF;
  SELECT * INTO policy FROM library.ai_result_policies WHERE stream_id=s.id AND revision=s.policy_revision;
  SELECT COALESCE(max(revision),0)+1 INTO next_revision FROM library.ai_result_revisions WHERE stream_id=s.id;
  INSERT INTO library.ai_result_revisions(stream_id,library_id,revision,payload,input_manifest,input_fingerprint,rubric_version,producer,calculated_at)
   VALUES(s.id,s.library_id,next_revision,p_request->'payload',current_context->'manifest',current_context->>'fingerprint',
    policy.rubric_version,policy.producer,calculated) RETURNING id INTO new_id;
  UPDATE library.ai_result_streams SET head_revision_id=new_id WHERE id=s.id;
  result=jsonb_build_object('revisionId',new_id,'revision',next_revision::text);
  INSERT INTO library.app_operation_receipts(actor_user_id,library_id,operation,request_id,request_sha256,result)
   VALUES(p_actor,s.library_id,'publish_ai_result',p_request_id,digest,result);
  RETURN result;
 END $$;

CREATE FUNCTION library.ai_result_for_user(p_actor text,p_stable text,p_kind text) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 DECLARE context record;r library.ai_result_revisions;reason text;header jsonb;data jsonb;
 BEGIN
  IF COALESCE(p_kind,'') NOT IN ('enrichment','taste','format') THEN RAISE EXCEPTION 'INVALID_AI_REQUEST'; END IF;
  SELECT * INTO context FROM library.ai_owned_subject(p_actor,p_stable);
  header=jsonb_build_object('bookStableId',p_stable,'kind',p_kind);
  SELECT v.* INTO r FROM library.ai_result_streams s JOIN library.ai_result_revisions v ON v.id=s.head_revision_id
   WHERE s.library_id=context.library_id AND s.book_id=context.book_id AND s.kind=p_kind;
  IF NOT FOUND THEN RETURN header||jsonb_build_object('state','missing'); END IF;
  reason=library.ai_dependencies_state(p_actor,context.library_id,ARRAY[r.id],r.id);
  IF reason='unavailable' THEN RETURN header||jsonb_build_object('state','unavailable'); END IF;
  data=header||jsonb_build_object('state',CASE WHEN reason IS NULL THEN 'fresh' ELSE 'stale' END,
   'revision',jsonb_build_object('id',r.id,'revision',r.revision::text,'schemaVersion',r.schema_version,
    'calculatedAt',to_char(r.calculated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'inputFingerprint',r.input_fingerprint,'rubricVersion',r.rubric_version,'producer',r.producer,'payload',r.payload));
  IF reason IS NOT NULL THEN data=data||jsonb_build_object('reason',reason); END IF;
  RETURN data;
 END $$;


DO $private$
DECLARE f record;
BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='library' AND (left(p.proname,3)='ai_' OR p.proname IN ('configure_ai_result','publish_ai_result')) LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',f.signature);
 END LOOP;
END $private$;
GRANT EXECUTE ON FUNCTION library.configure_ai_result(text,uuid,bigint,jsonb),
 library.ai_result_inputs_for_user(text,text,text,jsonb),library.publish_ai_result(text,uuid,bigint,jsonb) TO library_ai_producer;
GRANT EXECUTE ON FUNCTION library.ai_result_for_user(text,text,text) TO library_app_runtime;
