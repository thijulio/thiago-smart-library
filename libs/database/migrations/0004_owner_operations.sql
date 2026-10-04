-- Helpers are private; only the five public owner operations receive EXECUTE.
CREATE TABLE library.owner_requests(request_id uuid PRIMARY KEY,operation text NOT NULL,payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[0-9a-f]{64}$'),result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE FUNCTION library.immutable_identity() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id OR (TG_TABLE_NAME='books' AND to_jsonb(NEW)->'stable_id' IS DISTINCT FROM to_jsonb(OLD)->'stable_id') THEN RAISE EXCEPTION 'IMMUTABLE_IDENTITY'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER books_identity BEFORE UPDATE ON library.books FOR EACH ROW EXECUTE FUNCTION library.immutable_identity();
CREATE TRIGGER authors_identity BEFORE UPDATE ON library.authors FOR EACH ROW EXECUTE FUNCTION library.immutable_identity();
CREATE TRIGGER series_identity BEFORE UPDATE ON library.series FOR EACH ROW EXECUTE FUNCTION library.immutable_identity();
CREATE TRIGGER genres_identity BEFORE UPDATE ON library.genres FOR EACH ROW EXECUTE FUNCTION library.immutable_identity();
CREATE FUNCTION library.require_author() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE parent_id bigint;
BEGIN
 IF TG_TABLE_NAME='books' THEN parent_id=NEW.id; ELSE parent_id=coalesce(NEW.book_id,OLD.book_id); END IF;
 IF EXISTS(SELECT 1 FROM library.books WHERE id=parent_id) AND NOT EXISTS(SELECT 1 FROM library.book_authors WHERE book_id=parent_id) THEN RAISE EXCEPTION 'BOOK_REQUIRES_AUTHOR'; END IF;
 IF TG_TABLE_NAME='book_authors' THEN
 IF TG_OP='UPDATE' AND OLD.book_id<>NEW.book_id AND NOT EXISTS(SELECT 1 FROM library.book_authors WHERE book_id=OLD.book_id) THEN RAISE EXCEPTION 'BOOK_REQUIRES_AUTHOR'; END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER book_author_required AFTER INSERT ON library.books DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION library.require_author();
CREATE CONSTRAINT TRIGGER author_link_required AFTER INSERT OR UPDATE OR DELETE ON library.book_authors DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION library.require_author();
CREATE FUNCTION library.lock_author_parents() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 PERFORM id FROM library.books WHERE id IN (CASE WHEN TG_OP<>'INSERT' THEN OLD.book_id END,CASE WHEN TG_OP<>'DELETE' THEN NEW.book_id END) ORDER BY id FOR UPDATE;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER author_parent_lock BEFORE INSERT OR UPDATE OR DELETE ON library.book_authors FOR EACH ROW EXECUTE FUNCTION library.lock_author_parents();

CREATE FUNCTION library.normalize_payload(payload jsonb,kind text) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE k text;v jsonb;allowed text[];numeric_keys text[];integer_keys text[];date_keys text[];normalized jsonb='{}';
BEGIN
 IF payload IS NULL OR jsonb_typeof(payload)<>'object' THEN RAISE EXCEPTION 'INVALID_PAYLOAD'; END IF;
 IF kind='books' THEN
 allowed=ARRAY['title','series_id','series_volume','platform','status','cover_url','word_count','next_rank','next_slot','why_next','community_rating','ratings_count','rating_source','rating_updated','finished_from','finished_to','finished_precision','finished_date_raw','finished_year_raw','added_at','author_ids','genre_ids'];
 ELSIF kind='book_feedback' THEN allowed=ARRAY['rating','opinion','opinion_raw','notes'];
 ELSIF kind='book_assessments' THEN allowed=ARRAY['pros','cons','personal_relevance','relevance_reason','relevance_updated'];
 ELSE RAISE EXCEPTION 'INVALID_PAYLOAD'; END IF;
 numeric_keys=ARRAY['series_volume','community_rating','rating','personal_relevance'];integer_keys=ARRAY['series_id','word_count','next_rank','ratings_count'];date_keys=ARRAY['rating_updated','finished_from','finished_to','added_at','relevance_updated'];
 FOR k,v IN SELECT key,value FROM jsonb_each(payload) LOOP
  IF NOT k=ANY(allowed) THEN RAISE EXCEPTION 'INVALID_PAYLOAD_KEY'; END IF;
  IF v='null'::jsonb THEN NULL;
  ELSIF k=ANY(numeric_keys) THEN
   IF jsonb_typeof(v) NOT IN ('string','number') THEN RAISE EXCEPTION 'INVALID_NUMBER'; END IF;
   IF NOT pg_input_is_valid(v#>>'{}','numeric') THEN RAISE EXCEPTION 'INVALID_NUMBER'; END IF;
   IF (v#>>'{}')::numeric IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) THEN RAISE EXCEPTION 'INVALID_NUMBER'; END IF;
   v=to_jsonb(trim_scale((v#>>'{}')::numeric)::text);
  ELSIF k=ANY(integer_keys) THEN
   IF jsonb_typeof(v) NOT IN ('string','number') THEN RAISE EXCEPTION 'INVALID_INTEGER'; END IF;
   IF (v#>>'{}')!~'^[0-9]+$' OR NOT pg_input_is_valid(v#>>'{}','bigint') THEN RAISE EXCEPTION 'INVALID_INTEGER'; END IF;
   v=to_jsonb(((v#>>'{}')::bigint)::text);
  ELSIF k=ANY(date_keys) THEN
   IF jsonb_typeof(v)<>'string' THEN RAISE EXCEPTION 'INVALID_DATE'; END IF;
   IF (v#>>'{}')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR NOT pg_input_is_valid(v#>>'{}','date') THEN RAISE EXCEPTION 'INVALID_DATE'; END IF;
   IF NOT isfinite((v#>>'{}')::date) THEN RAISE EXCEPTION 'INVALID_DATE'; END IF;
  ELSIF k IN ('author_ids','genre_ids') THEN
   IF jsonb_typeof(v)<>'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements(v) x WHERE jsonb_typeof(x) NOT IN ('string','number') OR (x#>>'{}')!~'^[1-9][0-9]*$') THEN RAISE EXCEPTION 'INVALID_RELATIONS'; END IF;
   SELECT coalesce(jsonb_agg(to_jsonb((x#>>'{}')::bigint::text) ORDER BY CASE WHEN k='genre_ids' THEN (x#>>'{}')::bigint ELSE ord END),'[]') INTO v FROM jsonb_array_elements(v) WITH ORDINALITY a(x,ord);
  ELSE
   IF jsonb_typeof(v)<>'string' THEN RAISE EXCEPTION 'INVALID_TEXT'; END IF;
   IF k='cover_url' AND (v#>>'{}')!~'^https?://[a-zA-Z0-9\[][^[:space:]]*$' THEN RAISE EXCEPTION 'INVALID_URL'; END IF;
  END IF;
  normalized=normalized||jsonb_build_object(k,v);
 END LOOP;
 RETURN normalized;
END $$;
CREATE FUNCTION library.request_start(request uuid,operation_name text,payload jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE prior library.owner_requests;digest text;
BEGIN
 IF request IS NULL THEN RAISE EXCEPTION 'MISSING_REQUEST_ID'; END IF;
 -- Replay lookup must see requests committed while waiting for the request lock.
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'READ_COMMITTED_REQUIRED'; END IF;
 PERFORM pg_advisory_xact_lock_shared(73421,2);
 PERFORM pg_advisory_xact_lock(hashtextextended(request::text,73421));
 digest=library.value_hash(operation_name,'request',jsonb_build_object('actor',session_user,'payload',payload));
 SELECT * INTO prior FROM library.owner_requests WHERE request_id=request;
 IF FOUND THEN
  IF prior.operation<>operation_name OR prior.payload_sha256<>digest THEN RAISE EXCEPTION 'REQUEST_CONFLICT'; END IF;
  RETURN prior.result;
 END IF;
 RETURN NULL;
END $$;
CREATE FUNCTION library.request_finish(request uuid,operation_name text,payload jsonb,result jsonb) RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog,pg_temp AS $$
 INSERT INTO library.owner_requests(request_id,operation,payload_sha256,result) VALUES(request,operation_name,library.value_hash(operation_name,'request',jsonb_build_object('actor',session_user,'payload',payload)),result) RETURNING result
$$;
CREATE FUNCTION library.attribute(parent bigint,kind text,before_row jsonb,after_row jsonb) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE k text;v jsonb;logical_type text;
BEGIN
 FOR k,v IN SELECT key,value FROM jsonb_each(after_row) LOOP
  IF (NOT before_row?k AND v='null'::jsonb) OR before_row->k IS NOT DISTINCT FROM v OR k IN ('id','book_id','stable_id','created_at','updated_at','updated_by','row_version','source_updated_at','source_updated_by','last_import_run_id','archived_at','review_state','reviewed_by','reviewed_at') THEN CONTINUE; END IF;
  logical_type=CASE WHEN k IN ('series_volume','community_rating','rating','personal_relevance') THEN 'numeric' WHEN k IN ('series_id','word_count','next_rank','ratings_count') THEN 'integer' WHEN k IN ('rating_updated','finished_from','finished_to','added_at','relevance_updated') THEN 'date' WHEN k IN ('authors','genres') THEN 'array' ELSE 'text' END;
  IF logical_type IN ('numeric','integer') AND v<>'null'::jsonb THEN v=to_jsonb(trim_scale((v#>>'{}')::numeric)::text); END IF;
  INSERT INTO library.book_field_provenance(book_id,field_name,origin,actor,produced_at,value_sha256,hash_version)
  VALUES(parent,kind||'.'||k,'user',session_user,now(),library.value_hash(kind||'.'||k,logical_type,v),'pg-jsonb-text-v1')
  ON CONFLICT(book_id,field_name) DO UPDATE SET origin='user',actor=session_user,provider=NULL,model=NULL,prompt_version=NULL,source_reference=NULL,produced_at=now(),reviewed_by=NULL,reviewed_at=NULL,import_run_id=NULL,value_sha256=excluded.value_sha256,hash_version=excluded.hash_version;
 END LOOP;
END $$;

CREATE FUNCTION library.patch_book(stable_id text,expected_version bigint,patch jsonb,request_id uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE p jsonb;req jsonb;prior jsonb;b library.books;n library.books;old_data jsonb;new_data jsonb;result jsonb;
BEGIN
 p=library.normalize_payload(patch,'books');req=jsonb_build_object('stable_id',stable_id,'expected_version',expected_version,'patch',p);
 prior=library.request_start(request_id,'patch_book',req);IF prior IS NOT NULL THEN RETURN prior; END IF;
 SELECT * INTO b FROM library.books WHERE books.stable_id=patch_book.stable_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'BOOK_NOT_FOUND'; END IF;
 IF expected_version IS NULL OR b.row_version<>expected_version THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
 old_data=to_jsonb(b);
 IF p?'author_ids' THEN
  IF p->'author_ids' IS NULL OR p->'author_ids'='null'::jsonb OR jsonb_array_length(p->'author_ids')=0 THEN RAISE EXCEPTION 'BOOK_REQUIRES_AUTHOR'; END IF;
  old_data=old_data||jsonb_build_object('authors',(SELECT jsonb_agg(author_id::text ORDER BY position) FROM library.book_authors WHERE book_id=b.id));
  DELETE FROM library.book_authors WHERE book_id=b.id;
  INSERT INTO library.book_authors SELECT b.id,(x#>>'{}')::bigint,ord::integer FROM jsonb_array_elements(p->'author_ids') WITH ORDINALITY a(x,ord);
 END IF;
 IF p?'genre_ids' THEN
  IF p->'genre_ids'='null'::jsonb THEN RAISE EXCEPTION 'INVALID_RELATIONS'; END IF;
  old_data=old_data||jsonb_build_object('genres',coalesce((SELECT jsonb_agg(genre_id::text ORDER BY genre_id) FROM library.book_genres WHERE book_id=b.id),'[]'));
  DELETE FROM library.book_genres WHERE book_id=b.id;INSERT INTO library.book_genres SELECT b.id,(x#>>'{}')::bigint FROM jsonb_array_elements(p->'genre_ids') a(x);
 END IF;
 n=jsonb_populate_record(b,p-'author_ids'-'genre_ids');new_data=to_jsonb(n);
 IF p?'author_ids' THEN new_data=new_data||jsonb_build_object('authors',p->'author_ids'); END IF;
 IF p?'genre_ids' THEN new_data=new_data||jsonb_build_object('genres',coalesce((SELECT jsonb_agg(genre_id::text ORDER BY genre_id) FROM library.book_genres WHERE book_id=b.id),'[]')); END IF;
 IF new_data IS DISTINCT FROM old_data THEN
  UPDATE library.books SET title=n.title,series_id=n.series_id,series_volume=n.series_volume,platform=n.platform,status=n.status,cover_url=n.cover_url,word_count=n.word_count,next_rank=n.next_rank,next_slot=n.next_slot,why_next=n.why_next,community_rating=n.community_rating,ratings_count=n.ratings_count,rating_source=n.rating_source,rating_updated=n.rating_updated,finished_from=n.finished_from,finished_to=n.finished_to,finished_precision=n.finished_precision,finished_date_raw=n.finished_date_raw,finished_year_raw=n.finished_year_raw,added_at=n.added_at,row_version=b.row_version+1,updated_at=now(),updated_by=session_user WHERE id=b.id RETURNING * INTO n;
  PERFORM library.attribute(b.id,'books',old_data,new_data);
 END IF;
 result=jsonb_build_object('id',b.id::text,'stable_id',b.stable_id,'row_version',n.row_version::text);
 RETURN library.request_finish(request_id,'patch_book',req,result);
END $$;
CREATE FUNCTION library.create_book(payload jsonb,request_id uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE supplied jsonb;p jsonb;prior jsonb;b library.books;result jsonb;
BEGIN
 supplied=library.normalize_payload(payload,'books');
 p=jsonb_build_object('finished_precision','unknown','genre_ids','[]'::jsonb)||supplied;
 IF NOT (p?'title' AND p?'platform' AND p?'status' AND p?'author_ids') OR p->'author_ids'='null'::jsonb OR jsonb_array_length(p->'author_ids')=0 THEN RAISE EXCEPTION 'MISSING_REQUIRED_BOOK_FIELDS'; END IF;
 prior=library.request_start(request_id,'create_book',p);IF prior IS NOT NULL THEN RETURN prior; END IF;
 b=jsonb_populate_record(NULL::library.books,p-'author_ids'-'genre_ids');
 INSERT INTO library.books(stable_id,title,series_id,series_volume,platform,status,cover_url,word_count,next_rank,next_slot,why_next,community_rating,ratings_count,rating_source,rating_updated,finished_from,finished_to,finished_precision,finished_date_raw,finished_year_raw,added_at,updated_by)
 VALUES(gen_random_uuid()::text,b.title,b.series_id,b.series_volume,b.platform,b.status,b.cover_url,b.word_count,b.next_rank,b.next_slot,b.why_next,b.community_rating,b.ratings_count,b.rating_source,b.rating_updated,b.finished_from,b.finished_to,b.finished_precision,b.finished_date_raw,b.finished_year_raw,b.added_at,session_user) RETURNING * INTO b;
 INSERT INTO library.book_authors SELECT b.id,(x#>>'{}')::bigint,ord::integer FROM jsonb_array_elements(p->'author_ids') WITH ORDINALITY a(x,ord);
 IF p?'genre_ids' THEN INSERT INTO library.book_genres SELECT b.id,(x#>>'{}')::bigint FROM jsonb_array_elements(p->'genre_ids') a(x); END IF;
 -- Attribute only owner-supplied fields; defaults and absent fields stay unattributed.
 PERFORM library.attribute(b.id,'books','{}',
  (SELECT coalesce(jsonb_object_agg(key,value),'{}') FROM jsonb_each(to_jsonb(b)) WHERE supplied?key)
  ||jsonb_build_object('authors',p->'author_ids')
  ||CASE WHEN supplied?'genre_ids' THEN jsonb_build_object('genres',p->'genre_ids') ELSE '{}'::jsonb END);
 result=jsonb_build_object('id',b.id::text,'stable_id',b.stable_id,'row_version',b.row_version::text);
 RETURN library.request_finish(request_id,'create_book',p,result);
END $$;
CREATE FUNCTION library.archive_book(stable_id text,expected_version bigint,request_id uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE req jsonb;prior jsonb;b library.books;result jsonb;
BEGIN
 req=jsonb_build_object('stable_id',stable_id,'expected_version',expected_version);prior=library.request_start(request_id,'archive_book',req);IF prior IS NOT NULL THEN RETURN prior; END IF;
 SELECT * INTO b FROM library.books WHERE books.stable_id=archive_book.stable_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'BOOK_NOT_FOUND'; END IF;
 IF expected_version IS NULL OR b.row_version<>expected_version THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
 IF b.archived_at IS NULL THEN UPDATE library.books SET archived_at=now(),row_version=row_version+1,updated_at=now(),updated_by=session_user WHERE id=b.id RETURNING * INTO b; END IF;
 result=jsonb_build_object('id',b.id::text,'stable_id',b.stable_id,'row_version',b.row_version::text);
 RETURN library.request_finish(request_id,'archive_book',req,result);
END $$;

CREATE FUNCTION library.patch_feedback(stable_id text,expected_version bigint,patch jsonb,request_id uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE p jsonb;req jsonb;prior jsonb;parent bigint;b library.book_feedback;n library.book_feedback;old_data jsonb;new_data jsonb;result jsonb;exists_row boolean;
BEGIN
 p=library.normalize_payload(patch,'book_feedback');req=jsonb_build_object('stable_id',stable_id,'expected_version',expected_version,'patch',p);
 prior=library.request_start(request_id,'patch_feedback',req);IF prior IS NOT NULL THEN RETURN prior; END IF;
 SELECT id INTO parent FROM library.books WHERE books.stable_id=patch_feedback.stable_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'BOOK_NOT_FOUND'; END IF;
 SELECT * INTO b FROM library.book_feedback WHERE book_id=parent FOR UPDATE;exists_row=FOUND;
 IF (exists_row AND (expected_version IS NULL OR b.row_version<>expected_version)) OR (NOT exists_row AND expected_version IS NOT NULL) THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
 IF NOT exists_row AND NOT EXISTS(SELECT 1 FROM jsonb_each(p) WHERE value<>'null'::jsonb) THEN
  result=jsonb_build_object('id',parent::text,'stable_id',stable_id,'row_version',NULL);
  RETURN library.request_finish(request_id,'patch_feedback',req,result);
 END IF;
 old_data=CASE WHEN exists_row THEN to_jsonb(b) ELSE '{}'::jsonb END;
 n=jsonb_populate_record(b,p);new_data=to_jsonb(n);
 IF NOT exists_row THEN
 INSERT INTO library.book_feedback(book_id,rating,opinion,opinion_raw,notes,updated_by) VALUES(parent,n.rating,n.opinion,n.opinion_raw,n.notes,session_user) RETURNING * INTO n;
 ELSIF new_data IS DISTINCT FROM old_data THEN
 UPDATE library.book_feedback SET rating=n.rating,opinion=n.opinion,opinion_raw=n.opinion_raw,notes=n.notes,row_version=b.row_version+1,updated_at=now(),updated_by=session_user WHERE book_id=parent RETURNING * INTO n;
 END IF;
 PERFORM library.attribute(parent,'book_feedback',old_data,to_jsonb(n));
 result=jsonb_build_object('id',parent::text,'stable_id',stable_id,'row_version',n.row_version::text);
 RETURN library.request_finish(request_id,'patch_feedback',req,result);
END $$;

CREATE FUNCTION library.patch_assessment(stable_id text,expected_version bigint,patch jsonb,request_id uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE p jsonb;req jsonb;prior jsonb;parent bigint;b library.book_assessments;n library.book_assessments;old_data jsonb;new_data jsonb;result jsonb;exists_row boolean;
BEGIN
 p=library.normalize_payload(patch,'book_assessments');req=jsonb_build_object('stable_id',stable_id,'expected_version',expected_version,'patch',p);
 prior=library.request_start(request_id,'patch_assessment',req);IF prior IS NOT NULL THEN RETURN prior; END IF;
 SELECT id INTO parent FROM library.books WHERE books.stable_id=patch_assessment.stable_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'BOOK_NOT_FOUND'; END IF;
 SELECT * INTO b FROM library.book_assessments WHERE book_id=parent FOR UPDATE;exists_row=FOUND;
 IF (exists_row AND (expected_version IS NULL OR b.row_version<>expected_version)) OR (NOT exists_row AND expected_version IS NOT NULL) THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
 IF NOT exists_row AND NOT EXISTS(SELECT 1 FROM jsonb_each(p) WHERE value<>'null'::jsonb) THEN
  result=jsonb_build_object('id',parent::text,'stable_id',stable_id,'row_version',NULL);
  RETURN library.request_finish(request_id,'patch_assessment',req,result);
 END IF;
 old_data=CASE WHEN exists_row THEN to_jsonb(b) ELSE '{}'::jsonb END;
 n=jsonb_populate_record(b,p);new_data=to_jsonb(n);
 IF NOT exists_row THEN
 INSERT INTO library.book_assessments(book_id,pros,cons,personal_relevance,relevance_reason,relevance_updated,updated_by) VALUES(parent,n.pros,n.cons,n.personal_relevance,n.relevance_reason,n.relevance_updated,session_user) RETURNING * INTO n;
 ELSIF new_data IS DISTINCT FROM old_data THEN
 UPDATE library.book_assessments SET pros=n.pros,cons=n.cons,personal_relevance=n.personal_relevance,relevance_reason=n.relevance_reason,relevance_updated=n.relevance_updated,row_version=b.row_version+1,updated_at=now(),updated_by=session_user,review_state='unreviewed',reviewed_by=NULL,reviewed_at=NULL WHERE book_id=parent RETURNING * INTO n;
 END IF;
 PERFORM library.attribute(parent,'book_assessments',old_data,to_jsonb(n));
 result=jsonb_build_object('id',parent::text,'stable_id',stable_id,'row_version',n.row_version::text);
 RETURN library.request_finish(request_id,'patch_assessment',req,result);
END $$;

GRANT DELETE ON library.book_authors,library.book_genres TO library_importer;
GRANT EXECUTE ON FUNCTION library.create_book(jsonb,uuid),library.patch_book(text,bigint,jsonb,uuid),library.patch_feedback(text,bigint,jsonb,uuid),library.patch_assessment(text,bigint,jsonb,uuid),library.archive_book(text,bigint,uuid) TO library_editor;
