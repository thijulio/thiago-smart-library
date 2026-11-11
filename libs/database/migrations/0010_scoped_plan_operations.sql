-- Private preference/deferral intent and independent derived platform plans.
SET LOCAL ROLE library_owner;
CREATE TABLE library.reading_plan_policies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), stream_id uuid NOT NULL,
 library_id uuid NOT NULL, platform text NOT NULL, revision bigint NOT NULL CHECK(revision>0),
 rubric_version text NOT NULL, producer jsonb NOT NULL, actor_user_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(stream_id,revision),
 FOREIGN KEY(stream_id,library_id,platform) REFERENCES library.reading_plan_streams(id,library_id,platform),
 FOREIGN KEY(library_id,actor_user_id) REFERENCES library.user_libraries(id,owner_user_id)
);
ALTER TABLE library.reading_plan_streams ADD COLUMN policy_revision bigint;
ALTER TABLE library.reading_plan_streams ADD CONSTRAINT reading_plan_policy_fk
 FOREIGN KEY(id,policy_revision) REFERENCES library.reading_plan_policies(stream_id,revision);
CREATE TRIGGER immutable_revision BEFORE UPDATE OR DELETE ON library.reading_plan_policies
 FOR EACH ROW EXECUTE FUNCTION library.prevent_app_revision_rewrite();
REVOKE ALL ON library.reading_plan_policies FROM PUBLIC;

CREATE FUNCTION library.plan_library(p_actor text) RETURNS uuid
 LANGUAGE plpgsql STABLE SET search_path=pg_catalog,pg_temp AS $$
 DECLARE result uuid;
 BEGIN
  SELECT l.id INTO result FROM library.user_libraries l JOIN auth."user" u ON u.id=l.owner_user_id
   WHERE u.id=p_actor AND u."emailVerified"=true;
  IF result IS NULL THEN RAISE EXCEPTION 'LIBRARY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  RETURN result;
 END $$;
CREATE FUNCTION library.plan_write_context(p_actor text,p_request uuid,p_operation text) RETURNS uuid
 LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
 DECLARE lib uuid;
 BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'UNSUPPORTED_AI_ISOLATION'; END IF;
  IF p_request IS NULL THEN RAISE EXCEPTION 'INVALID_PLAN_REQUEST'; END IF;
  lib=library.plan_library(p_actor);
  PERFORM pg_advisory_xact_lock_shared(73421,2);
  PERFORM pg_advisory_xact_lock(73423,hashtext(p_actor||':'||p_operation||':'||p_request::text));
  PERFORM pg_advisory_xact_lock(73422,hashtext(lib::text));
  RETURN library.plan_library(p_actor);
 END $$;
CREATE FUNCTION library.plan_preference_write(p_actor text,p_request_id uuid,p_expected bigint,p_request jsonb,p_propose boolean) RETURNS jsonb
 LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
 DECLARE lib uuid;op text;digest text;prior jsonb;old library.preference_evidence;new_row library.preference_evidence;result jsonb;
  pref uuid;statement text;sources jsonb;producer jsonb;authorship text;decision text;
 BEGIN
  IF p_expected IS NOT NULL AND p_expected<1 THEN RAISE EXCEPTION 'INVALID_PLAN_REQUEST'; END IF;
  PERFORM library.ai_assert_uuid_array(jsonb_build_array(p_request->'preferenceId'),1);
  pref=(p_request->>'preferenceId')::uuid;
  IF p_propose THEN
   op='propose_preference_evidence';
   IF NOT library.ai_keys(p_request,ARRAY['preferenceId','statement','sources','producer']) THEN RAISE EXCEPTION 'INVALID_PLAN_REQUEST'; END IF;
   PERFORM library.ai_assert_producer(p_request->'producer');PERFORM library.ai_assert_sources(p_request->'sources');
  ELSE
   op='save_preference_evidence';
   IF NOT (library.ai_keys(p_request,ARRAY['preferenceId','decision']) OR
      library.ai_keys(p_request,ARRAY['preferenceId','decision','statement','sources']))
    OR COALESCE(p_request->>'decision','') NOT IN ('accepted','rejected','superseded')
   THEN RAISE EXCEPTION 'INVALID_PLAN_REQUEST'; END IF;
  END IF;
  IF octet_length(p_request::text)>1048576 THEN RAISE EXCEPTION 'INVALID_PLAN_REQUEST'; END IF;
  lib=library.plan_write_context(p_actor,p_request_id,op);
  digest=library.ai_hash(jsonb_build_object('expectedRevision',p_expected::text,'request',p_request));
  prior=library.ai_replay(p_actor,p_request_id,op,digest);IF prior IS NOT NULL THEN RETURN prior; END IF;
  SELECT * INTO old FROM library.preference_evidence WHERE library_id=lib AND preference_id=pref ORDER BY revision DESC LIMIT 1;
  IF old.revision IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
  IF p_propose THEN
   IF old.id IS NOT NULL AND (old.authorship<>'inferred' OR old.decision<>'proposed') THEN RAISE EXCEPTION 'PREFERENCE_DECISION_REQUIRED'; END IF;
   authorship='inferred';decision='proposed';statement=p_request->>'statement';sources=p_request->'sources';producer=p_request->'producer';
  ELSIF p_request ? 'statement' THEN
   IF (old.id IS NOT NULL AND old.authorship<>'explicit') OR p_request->>'decision'='rejected'
    OR jsonb_typeof(p_request->'sources') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'INVALID_PLAN_REQUEST'; END IF;
   sources=p_request->'sources';IF jsonb_array_length(sources)>0 THEN PERFORM library.ai_assert_sources(sources); END IF;
   authorship='explicit';decision=p_request->>'decision';statement=p_request->>'statement';producer=NULL;
  ELSE
   IF old.id IS NULL THEN RAISE EXCEPTION 'INVALID_PLAN_REQUEST'; END IF;
   IF old.authorship='explicit' AND p_request->>'decision'<>'superseded' THEN RAISE EXCEPTION 'INVALID_PLAN_REQUEST'; END IF;
   authorship=old.authorship;decision=p_request->>'decision';statement=old.statement;sources=old.sources;producer=old.producer;
  END IF;
  IF NOT library.ai_text(to_jsonb(statement),4000) THEN RAISE EXCEPTION 'INVALID_PLAN_REQUEST'; END IF;
  INSERT INTO library.preference_evidence(library_id,preference_id,revision,authorship,decision,statement,sources,producer,actor_user_id)
   VALUES(lib,pref,COALESCE(old.revision,0)+1,authorship,decision,statement,sources,producer,p_actor) RETURNING * INTO new_row;
  result=jsonb_build_object('preferenceId',pref,'revisionId',new_row.id,'revision',new_row.revision::text);
  INSERT INTO library.app_operation_receipts VALUES(p_actor,lib,op,p_request_id,digest,result,now());
  RETURN result;
 END $$;
CREATE FUNCTION library.save_preference_evidence(p_actor text,p_request_id uuid,p_expected bigint,p_request jsonb) RETURNS jsonb
 LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT library.plan_preference_write(p_actor,p_request_id,p_expected,p_request,false) $$;
CREATE FUNCTION library.propose_preference_evidence(p_actor text,p_request_id uuid,p_expected bigint,p_request jsonb) RETURNS jsonb
 LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT library.plan_preference_write(p_actor,p_request_id,p_expected,p_request,true) $$;

CREATE FUNCTION library.configure_reading_plan(p_actor text,p_request_id uuid,p_expected bigint,p_request jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 DECLARE lib uuid;s library.reading_plan_streams;policy library.reading_plan_policies;digest text;prior jsonb;result jsonb;
 BEGIN
  IF NOT library.ai_keys(p_request,ARRAY['platform','rubricVersion','producer'])
   OR COALESCE(p_request->>'platform','') NOT IN ('Kindle','Audible')
   OR NOT library.ai_text(p_request->'rubricVersion',200) OR (p_expected IS NOT NULL AND p_expected<1)
  THEN RAISE EXCEPTION 'INVALID_PLAN_REQUEST'; END IF;
  PERFORM library.ai_assert_producer(p_request->'producer');
  lib=library.plan_write_context(p_actor,p_request_id,'configure_reading_plan');
  digest=library.ai_hash(jsonb_build_object('expectedRevision',p_expected::text,'request',p_request));
  prior=library.ai_replay(p_actor,p_request_id,'configure_reading_plan',digest);IF prior IS NOT NULL THEN RETURN prior; END IF;
  INSERT INTO library.reading_plan_streams(library_id,platform) VALUES(lib,p_request->>'platform') ON CONFLICT(library_id,platform) DO NOTHING;
  SELECT * INTO s FROM library.reading_plan_streams WHERE library_id=lib AND platform=p_request->>'platform' FOR UPDATE;
  IF s.policy_revision IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
  SELECT * INTO policy FROM library.reading_plan_policies WHERE stream_id=s.id AND revision=s.policy_revision;
  IF policy.id IS NULL OR policy.rubric_version IS DISTINCT FROM p_request->>'rubricVersion' OR policy.producer IS DISTINCT FROM p_request->'producer' THEN
   INSERT INTO library.reading_plan_policies(stream_id,library_id,platform,revision,rubric_version,producer,actor_user_id)
    VALUES(s.id,lib,s.platform,COALESCE(s.policy_revision,0)+1,p_request->>'rubricVersion',p_request->'producer',p_actor) RETURNING * INTO policy;
   UPDATE library.reading_plan_streams SET policy_revision=policy.revision WHERE id=s.id;
  END IF;
  result=jsonb_build_object('policyId',policy.id,'policyRevision',policy.revision::text);
  INSERT INTO library.app_operation_receipts VALUES(p_actor,lib,'configure_reading_plan',p_request_id,digest,result,now());
  RETURN result;
 END $$;

CREATE FUNCTION library.record_plan_deferral(p_actor text,p_request_id uuid,p_expected_plan bigint,p_request jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 DECLARE lib uuid;context record;s library.reading_plan_streams;old library.plan_deferrals;new_row library.plan_deferrals;
  expected bigint;head bigint;digest text;prior jsonb;result jsonb;
 BEGIN
  IF NOT library.ai_keys(p_request,ARRAY['deferralId','bookStableId','platform','state','reason','expectedDeferralRevision'])
   OR NOT library.ai_text(p_request->'bookStableId',500) OR NOT library.ai_text(p_request->'reason',4000)
   OR COALESCE(p_request->>'platform','') NOT IN ('Kindle','Audible') OR COALESCE(p_request->>'state','') NOT IN ('active','cancelled')
   OR NOT (p_request->'expectedDeferralRevision'='null'::jsonb OR library.ai_counter(p_request->'expectedDeferralRevision'))
   OR (p_expected_plan IS NOT NULL AND p_expected_plan<1)
  THEN RAISE EXCEPTION 'INVALID_PLAN_REQUEST'; END IF;
  PERFORM library.ai_assert_uuid_array(jsonb_build_array(p_request->'deferralId'),1);
  expected=(p_request->>'expectedDeferralRevision')::bigint;
  lib=library.plan_write_context(p_actor,p_request_id,'record_plan_deferral');
  SELECT * INTO context FROM library.ai_owned_subject(p_actor,p_request->>'bookStableId');
  digest=library.ai_hash(jsonb_build_object('expectedPlanRevision',p_expected_plan::text,'request',p_request));
  prior=library.ai_replay(p_actor,p_request_id,'record_plan_deferral',digest);IF prior IS NOT NULL THEN RETURN prior; END IF;
  PERFORM 1 FROM library.books WHERE id=context.book_id FOR UPDATE;
  PERFORM library.ai_owned_subject(p_actor,p_request->>'bookStableId');
  SELECT * INTO s FROM library.reading_plan_streams WHERE library_id=lib AND platform=p_request->>'platform' FOR UPDATE;
  SELECT revision INTO head FROM library.reading_plan_revisions WHERE id=s.head_revision_id;
  IF head IS DISTINCT FROM p_expected_plan THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
  SELECT * INTO old FROM library.plan_deferrals WHERE library_id=lib AND deferral_id=(p_request->>'deferralId')::uuid ORDER BY revision DESC LIMIT 1;
  IF old.revision IS DISTINCT FROM expected THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
  IF (old.id IS NULL AND p_request->>'state'<>'active') OR
    (old.id IS NOT NULL AND (old.book_id<>context.book_id OR old.platform<>p_request->>'platform'))
  THEN RAISE EXCEPTION 'INVALID_PLAN_REQUEST'; END IF;
  INSERT INTO library.plan_deferrals(library_id,deferral_id,revision,book_id,platform,expected_plan_revision_id,state,reason,actor_user_id)
   VALUES(lib,(p_request->>'deferralId')::uuid,COALESCE(old.revision,0)+1,context.book_id,p_request->>'platform',s.head_revision_id,
    p_request->>'state',p_request->>'reason',p_actor) RETURNING * INTO new_row;
  result=jsonb_build_object('deferralId',new_row.deferral_id,'revisionId',new_row.id,'revision',new_row.revision::text);
  INSERT INTO library.app_operation_receipts VALUES(p_actor,lib,'record_plan_deferral',p_request_id,digest,result,now());
  RETURN result;
 END $$;

CREATE FUNCTION library.plan_assert_selector(v jsonb) RETURNS void
 LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
 DECLARE item jsonb;names text[]='{}';
 BEGIN
  IF NOT library.ai_keys(v,ARRAY['books','resultRevisionIds']) OR jsonb_typeof(v->'books') IS DISTINCT FROM 'array'
  THEN RAISE EXCEPTION 'INVALID_PLAN_REQUEST'; END IF;
  IF jsonb_array_length(v->'books')>512 THEN RAISE EXCEPTION 'DEPENDENCY_LIMIT_EXCEEDED'; END IF;
  PERFORM library.ai_assert_uuid_array(v->'resultRevisionIds',127);
  FOR item IN SELECT value FROM jsonb_array_elements(v->'books') LOOP
   IF NOT library.ai_keys(item,ARRAY['bookStableId','fields']) OR NOT library.ai_text(item->'bookStableId',500)
    OR item->>'bookStableId'=ANY(names) THEN RAISE EXCEPTION 'INVALID_PLAN_REQUEST'; END IF;
   names=array_append(names,item->>'bookStableId');PERFORM library.ai_assert_fields(item->'fields');
  END LOOP;
 END $$;
CREATE FUNCTION library.plan_inputs(p_actor text,p_platform text,p_selector jsonb) RETURNS jsonb
 LANGUAGE plpgsql STABLE SET search_path=pg_catalog,pg_temp AS $$
 DECLARE lib uuid;policy record;books jsonb='[]';item jsonb;hashes jsonb;fields jsonb;selected jsonb;
  candidates jsonb;preferences jsonb;deferrals jsonb;deps jsonb;manifest jsonb;descriptor jsonb;
 BEGIN
  IF COALESCE(p_platform,'') NOT IN ('Kindle','Audible') THEN RAISE EXCEPTION 'INVALID_PLAN_REQUEST'; END IF;
  PERFORM library.plan_assert_selector(p_selector);lib=library.plan_library(p_actor);
  SELECT p.*,s.policy_revision INTO policy FROM library.reading_plan_streams s JOIN library.reading_plan_policies p
   ON p.stream_id=s.id AND p.revision=s.policy_revision WHERE s.library_id=lib AND s.platform=p_platform;
  IF NOT FOUND THEN RAISE EXCEPTION 'PLAN_POLICY_UNAVAILABLE'; END IF;
  PERFORM library.ai_assert_producer(policy.producer);
  IF NOT library.ai_text(to_jsonb(policy.rubric_version),200) THEN RAISE EXCEPTION 'INVALID_PLAN_REQUEST'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_selector->'books') ORDER BY value->>'bookStableId' LOOP
   hashes=library.ai_all_book_hashes(p_actor,item->>'bookStableId');
   SELECT jsonb_agg(to_jsonb(value) ORDER BY value),jsonb_object_agg(value,hashes->value) INTO fields,selected
    FROM jsonb_array_elements_text(item->'fields');
   books=books||jsonb_build_array(jsonb_build_object('bookStableId',item->>'bookStableId','fields',fields,'fieldHashes',selected));
  END LOOP;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('bookStableId',b.stable_id,'status',b.status,'platform',b.platform,'provenance',
    (SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.field_name),'[]') FROM library.book_field_provenance p WHERE p.book_id=b.id AND p.field_name IN ('books.status','books.platform'))) ORDER BY b.stable_id),'[]') INTO candidates
   FROM library.books b JOIN library.library_books m ON m.book_id=b.id WHERE m.library_id=lib AND b.archived_at IS NULL AND b.platform IN (p_platform,'Unknown');
  SELECT COALESCE(jsonb_agg(to_jsonb(id::text) ORDER BY id),'[]') INTO preferences FROM (
   SELECT DISTINCT ON(preference_id) id,decision FROM library.preference_evidence WHERE library_id=lib ORDER BY preference_id,revision DESC
  ) current_evidence WHERE decision='accepted';
  SELECT COALESCE(jsonb_agg(to_jsonb(id::text) ORDER BY id),'[]') INTO deferrals FROM (
   SELECT DISTINCT ON(deferral_id) id FROM library.plan_deferrals WHERE library_id=lib AND platform=p_platform ORDER BY deferral_id,revision DESC
  ) current_deferrals;
  IF jsonb_array_length(candidates)>1000 OR jsonb_array_length(preferences)>128 OR jsonb_array_length(deferrals)>1000 THEN RAISE EXCEPTION 'DEPENDENCY_LIMIT_EXCEEDED'; END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(value::uuid::text) ORDER BY value::uuid::text),'[]') INTO deps FROM jsonb_array_elements_text(p_selector->'resultRevisionIds');
  IF (SELECT count(*) FROM library.ai_result_revisions WHERE library_id=lib AND id IN(SELECT value::uuid FROM jsonb_array_elements_text(deps)))<>jsonb_array_length(deps)
  THEN RAISE EXCEPTION 'INVALID_DEPENDENCY'; END IF;
  descriptor=jsonb_build_object('rubricVersion',policy.rubric_version,'producer',policy.producer);
  manifest=jsonb_build_object('schemaVersion',1,'hashVersion','pg-jsonb-text-v1','platform',p_platform,'books',books,'candidates',candidates,
   'preferenceRevisionIds',preferences,'deferralRevisionIds',deferrals,'resultRevisionIds',deps,'policyRevision',policy.policy_revision::text,'policyHash',library.ai_hash(descriptor));
  RETURN jsonb_build_object('manifest',manifest,'fingerprint',library.ai_hash(manifest),'policy',descriptor);
 END $$;
CREATE FUNCTION library.reading_plan_inputs_for_user(p_actor text,p_platform text,p_selector jsonb) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 DECLARE result jsonb;lib uuid;ids uuid[];
 BEGIN
  result=library.plan_inputs(p_actor,p_platform,p_selector);lib=library.plan_library(p_actor);
  ids=library.ai_dependency_graph(lib,p_selector->'resultRevisionIds',NULL);
  IF library.ai_dependencies_state(p_actor,lib,ids) IS NOT NULL THEN RAISE EXCEPTION 'STALE_DEPENDENCY'; END IF;
  RETURN result;
 END $$;
CREATE FUNCTION library.plan_assert_entries(v jsonb,p_manifest jsonb) RETURNS void
 LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
 DECLARE item jsonb;position integer=0;names text[]='{}';dep text;
 BEGIN
  IF jsonb_typeof(v) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'INVALID_PLAN_REQUEST'; END IF;
  IF jsonb_array_length(v)>1000 THEN RAISE EXCEPTION 'INVALID_PLAN_REQUEST'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(v) LOOP
   position=position+1;
   IF NOT library.ai_keys(item,ARRAY['bookStableId','position','reason','evidence','judgmentRevisionIds'])
    OR NOT library.ai_text(item->'bookStableId',500) OR item->'position' IS DISTINCT FROM to_jsonb(position)
    OR NOT library.ai_text(item->'reason',4000) OR item->>'bookStableId'=ANY(names)
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_manifest->'books') b WHERE b->>'bookStableId'=item->>'bookStableId')
   THEN RAISE EXCEPTION 'INVALID_PLAN_REQUEST'; END IF;
   names=array_append(names,item->>'bookStableId');PERFORM library.ai_assert_sources(item->'evidence');PERFORM library.ai_assert_uuid_array(item->'judgmentRevisionIds',128);
   FOR dep IN SELECT value::uuid::text FROM jsonb_array_elements_text(item->'judgmentRevisionIds') LOOP
    IF NOT p_manifest->'resultRevisionIds' ? dep THEN RAISE EXCEPTION 'INVALID_DEPENDENCY'; END IF;
   END LOOP;
  END LOOP;
 END $$;
CREATE FUNCTION library.publish_reading_plan(p_actor text,p_request_id uuid,p_expected bigint,p_request jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 DECLARE lib uuid;s library.reading_plan_streams;policy library.reading_plan_policies;digest text;prior jsonb;selection jsonb;context jsonb;
  ids uuid[];current_revision bigint;next_revision bigint;new_id uuid;result jsonb;item jsonb;book_ids bigint[];calculated timestamptz;
 BEGIN
  IF NOT library.ai_keys(p_request,ARRAY['platform','inputs','entries','calculatedAt']) OR COALESCE(p_request->>'platform','') NOT IN ('Kindle','Audible')
   OR NOT library.ai_keys(p_request->'inputs',ARRAY['manifest','fingerprint','policy']) OR octet_length(p_request::text)>1048576
   OR COALESCE(p_request->>'calculatedAt','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
   OR (p_expected IS NOT NULL AND p_expected<1) OR jsonb_typeof(p_request->'inputs'->'manifest'->'books') IS DISTINCT FROM 'array'
  THEN RAISE EXCEPTION 'INVALID_PLAN_REQUEST'; END IF;
  BEGIN
   calculated=(p_request->>'calculatedAt')::timestamptz;
   IF to_char(calculated AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')<>p_request->>'calculatedAt' THEN RAISE EXCEPTION 'INVALID_PLAN_REQUEST'; END IF;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'INVALID_PLAN_REQUEST'; END;
  lib=library.plan_write_context(p_actor,p_request_id,'publish_reading_plan');
  digest=library.ai_hash(jsonb_build_object('expectedRevision',p_expected::text,'request',p_request));
  prior=library.ai_replay(p_actor,p_request_id,'publish_reading_plan',digest);IF prior IS NOT NULL THEN RETURN prior; END IF;
  selection=jsonb_build_object('books',(SELECT COALESCE(jsonb_agg(value-'fieldHashes'),'[]') FROM jsonb_array_elements(p_request->'inputs'->'manifest'->'books')),
   'resultRevisionIds',p_request->'inputs'->'manifest'->'resultRevisionIds');
  PERFORM library.plan_assert_selector(selection);PERFORM library.plan_assert_entries(p_request->'entries',p_request->'inputs'->'manifest');
  ids=library.ai_dependency_graph(lib,selection->'resultRevisionIds',NULL);
  -- Lock the library's books before any stream revision FK is constructed.
  SELECT array_agg(book_id ORDER BY book_id) INTO book_ids FROM library.library_books WHERE library_id=lib;
  IF cardinality(book_ids)>2048 THEN RAISE EXCEPTION 'DEPENDENCY_LIMIT_EXCEEDED'; END IF;
  PERFORM 1 FROM library.books WHERE id=ANY(book_ids) ORDER BY id FOR UPDATE;
  PERFORM library.plan_library(p_actor);
  SELECT * INTO s FROM library.reading_plan_streams WHERE library_id=lib AND platform=p_request->>'platform' FOR UPDATE;
  IF NOT FOUND OR s.policy_revision IS NULL THEN RAISE EXCEPTION 'PLAN_POLICY_UNAVAILABLE'; END IF;
  SELECT revision INTO current_revision FROM library.reading_plan_revisions WHERE id=s.head_revision_id;
  IF current_revision IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
  context=library.plan_inputs(p_actor,s.platform,selection);
  IF context IS DISTINCT FROM p_request->'inputs' THEN RAISE EXCEPTION 'INPUTS_CHANGED'; END IF;
  IF library.ai_dependencies_state(p_actor,lib,ids) IS NOT NULL THEN RAISE EXCEPTION 'STALE_DEPENDENCY'; END IF;
  SELECT * INTO policy FROM library.reading_plan_policies WHERE stream_id=s.id AND revision=s.policy_revision;
  SELECT COALESCE(max(revision),0)+1 INTO next_revision FROM library.reading_plan_revisions WHERE stream_id=s.id;
  INSERT INTO library.reading_plan_revisions(stream_id,library_id,platform,revision,input_manifest,input_fingerprint,rubric_version,producer,calculated_at)
   VALUES(s.id,lib,s.platform,next_revision,context->'manifest',context->>'fingerprint',policy.rubric_version,policy.producer,calculated) RETURNING id INTO new_id;
  FOR item IN SELECT value FROM jsonb_array_elements(p_request->'entries') LOOP
   INSERT INTO library.reading_plan_entries(revision_id,library_id,position,book_id,reason,evidence)
    SELECT new_id,lib,(item->>'position')::integer,b.id,item->>'reason',item->'evidence' FROM library.books b WHERE b.stable_id=item->>'bookStableId';
   INSERT INTO library.reading_plan_entry_judgments SELECT new_id,(item->>'position')::integer,lib,value::uuid FROM jsonb_array_elements_text(item->'judgmentRevisionIds');
  END LOOP;
  UPDATE library.reading_plan_streams SET head_revision_id=new_id WHERE id=s.id;
  result=jsonb_build_object('revisionId',new_id,'revision',next_revision::text);
  INSERT INTO library.app_operation_receipts VALUES(p_actor,lib,'publish_reading_plan',p_request_id,digest,result,now());
  RETURN result;
 END $$;
CREATE FUNCTION library.plan_projection(p_actor text,p_revision uuid) RETURNS jsonb
 LANGUAGE plpgsql STABLE SET search_path=pg_catalog,pg_temp AS $$
 DECLARE lib uuid;r library.reading_plan_revisions;policy library.reading_plan_policies;manifest jsonb;selection jsonb;context jsonb;
  reason text;entries jsonb;header jsonb;data jsonb;ids uuid[];
 BEGIN
  lib=library.plan_library(p_actor);SELECT * INTO r FROM library.reading_plan_revisions WHERE id=p_revision AND library_id=lib;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_PLAN_REQUEST'; END IF;
  header=jsonb_build_object('platform',r.platform);manifest=r.input_manifest;
  IF NOT library.ai_keys(manifest,ARRAY['schemaVersion','hashVersion','platform','books','candidates','preferenceRevisionIds','deferralRevisionIds',
   'resultRevisionIds','policyRevision','policyHash']) OR manifest->'schemaVersion'<>'1'::jsonb OR manifest->>'hashVersion'<>'pg-jsonb-text-v1'
   OR manifest->>'platform'<>r.platform OR r.input_fingerprint<>library.ai_hash(manifest)
   OR NOT library.ai_counter(manifest->'policyRevision') OR jsonb_typeof(manifest->'books') IS DISTINCT FROM 'array'
  THEN RETURN header||jsonb_build_object('state','unavailable'); END IF;
  IF EXISTS(SELECT 1 FROM library.reading_plan_entries e JOIN library.books b ON b.id=e.book_id WHERE e.revision_id=r.id AND b.archived_at IS NOT NULL)
  THEN RETURN header||jsonb_build_object('state','unavailable'); END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('bookStableId',b.stable_id,'position',e.position,'reason',e.reason,'evidence',e.evidence,
   'judgmentRevisionIds',(SELECT COALESCE(jsonb_agg(to_jsonb(j.result_revision_id::text) ORDER BY j.result_revision_id),'[]')
    FROM library.reading_plan_entry_judgments j WHERE j.revision_id=e.revision_id AND j.position=e.position)) ORDER BY e.position),'[]') INTO entries
   FROM library.reading_plan_entries e JOIN library.books b ON b.id=e.book_id WHERE e.revision_id=r.id;
  PERFORM library.plan_assert_entries(entries,manifest);PERFORM library.ai_assert_producer(r.producer);
  IF NOT library.ai_text(to_jsonb(r.rubric_version),200) OR length(to_char(r.calculated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))<>24
  THEN RETURN header||jsonb_build_object('state','unavailable'); END IF;
  SELECT * INTO policy FROM library.reading_plan_policies WHERE stream_id=r.stream_id AND revision=(manifest->>'policyRevision')::bigint;
  IF NOT FOUND OR policy.rubric_version IS DISTINCT FROM r.rubric_version OR policy.producer IS DISTINCT FROM r.producer
   OR library.ai_hash(jsonb_build_object('rubricVersion',policy.rubric_version,'producer',policy.producer)) IS DISTINCT FROM manifest->>'policyHash'
  THEN RETURN header||jsonb_build_object('state','unavailable'); END IF;
  selection=jsonb_build_object('books',(SELECT COALESCE(jsonb_agg(value-'fieldHashes'),'[]') FROM jsonb_array_elements(manifest->'books')),'resultRevisionIds',manifest->'resultRevisionIds');
  BEGIN
   context=library.plan_inputs(p_actor,r.platform,selection);
   IF context->'manifest'->'policyRevision' IS DISTINCT FROM manifest->'policyRevision' OR context->'manifest'->'policyHash' IS DISTINCT FROM manifest->'policyHash'
   THEN reason='versions_changed';ELSIF context->'manifest' IS DISTINCT FROM manifest THEN reason='inputs_changed'; END IF;
   ids=library.ai_dependency_graph(lib,manifest->'resultRevisionIds',NULL);
   IF reason IS NULL THEN reason=library.ai_dependencies_state(p_actor,lib,ids); END IF;
  EXCEPTION WHEN SQLSTATE 'P0002' THEN reason='source_unavailable'; END;
  IF reason='unavailable' THEN RETURN header||jsonb_build_object('state','unavailable'); END IF;
  data=header||jsonb_build_object('state',CASE WHEN reason IS NULL THEN 'fresh' ELSE 'stale' END,'revision',
   jsonb_build_object('id',r.id,'revision',r.revision::text,'schemaVersion',r.schema_version,
    'calculatedAt',to_char(r.calculated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'inputFingerprint',r.input_fingerprint,
    'rubricVersion',r.rubric_version,'producer',r.producer,'entries',entries));
  IF reason IS NOT NULL THEN data=data||jsonb_build_object('reason',reason); END IF;
  RETURN data;
 EXCEPTION WHEN SQLSTATE 'P0001' OR invalid_text_representation OR invalid_parameter_value OR numeric_value_out_of_range THEN
  RETURN jsonb_build_object('platform',r.platform,'state','unavailable');
 END $$;
CREATE FUNCTION library.reading_plan_for_user(p_actor text,p_platform text) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 DECLARE lib uuid;head uuid;
 BEGIN
  IF COALESCE(p_platform,'') NOT IN ('Kindle','Audible') THEN RAISE EXCEPTION 'INVALID_PLAN_REQUEST'; END IF;
  IF NOT EXISTS(SELECT 1 FROM auth."user" WHERE id=p_actor AND "emailVerified"=true) THEN
   RAISE EXCEPTION 'LIBRARY_NOT_FOUND' USING ERRCODE='P0002';
  END IF;
  SELECT id INTO lib FROM library.user_libraries WHERE owner_user_id=p_actor;
  SELECT head_revision_id INTO head FROM library.reading_plan_streams WHERE library_id=lib AND platform=p_platform;
  IF head IS NULL THEN RETURN jsonb_build_object('platform',p_platform,'state','missing'); END IF;
  RETURN library.plan_projection(p_actor,head);
 END $$;
DO $private$
DECLARE f record;
BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='library' AND (left(p.proname,5)='plan_' OR p.proname IN('save_preference_evidence','propose_preference_evidence',
   'configure_reading_plan','record_plan_deferral','reading_plan_inputs_for_user','publish_reading_plan','reading_plan_for_user')) LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',f.signature);
 END LOOP;
END $private$;
GRANT EXECUTE ON FUNCTION library.save_preference_evidence(text,uuid,bigint,jsonb),library.record_plan_deferral(text,uuid,bigint,jsonb),
 library.reading_plan_for_user(text,text) TO library_app_runtime;
GRANT EXECUTE ON FUNCTION library.propose_preference_evidence(text,uuid,bigint,jsonb),library.configure_reading_plan(text,uuid,bigint,jsonb),
 library.reading_plan_inputs_for_user(text,text,jsonb),library.publish_reading_plan(text,uuid,bigint,jsonb) TO library_ai_producer;
