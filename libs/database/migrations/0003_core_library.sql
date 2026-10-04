CREATE TABLE library.authors(
id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name text NOT NULL CHECK(name ~ '[^[:space:]]'), name_key text NOT NULL UNIQUE CHECK(name_key ~ '[^[:space:]]'),
created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by text NOT NULL CHECK(updated_by ~ '[^[:space:]]'), source_updated_at timestamptz, source_updated_by text,
 last_import_run_id uuid REFERENCES import_audit.import_runs ON UPDATE RESTRICT ON DELETE RESTRICT
);
CREATE INDEX authors_import_run_idx ON library.authors(last_import_run_id);
CREATE TABLE library.series(
id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name text NOT NULL CHECK(name ~ '[^[:space:]]'), name_key text NOT NULL UNIQUE CHECK(name_key ~ '[^[:space:]]'), published_count integer CHECK(published_count>=0), planned_count integer CHECK(planned_count>=0), status text CHECK(status IN ('Complete','Ongoing','No sequence','Unknown')), checked_at date CHECK(isfinite(checked_at)),
created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by text NOT NULL CHECK(updated_by ~ '[^[:space:]]'), source_updated_at timestamptz, source_updated_by text,
 last_import_run_id uuid REFERENCES import_audit.import_runs ON UPDATE RESTRICT ON DELETE RESTRICT
);
CREATE INDEX series_import_run_idx ON library.series(last_import_run_id);
CREATE TABLE library.genres(
id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name text NOT NULL CHECK(name ~ '[^[:space:]]'), name_key text NOT NULL UNIQUE CHECK(name_key ~ '[^[:space:]]'),
created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by text NOT NULL CHECK(updated_by ~ '[^[:space:]]'), source_updated_at timestamptz, source_updated_by text,
 last_import_run_id uuid REFERENCES import_audit.import_runs ON UPDATE RESTRICT ON DELETE RESTRICT
);
CREATE INDEX genres_import_run_idx ON library.genres(last_import_run_id);
CREATE TABLE library.books(
id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 stable_id text NOT NULL UNIQUE CHECK(stable_id ~ '[^[:space:]]' AND position('::' IN stable_id)=0), title text NOT NULL CHECK(title ~ '[^[:space:]]'),
 series_id bigint REFERENCES library.series ON UPDATE RESTRICT ON DELETE RESTRICT,series_label_raw text,
 series_volume numeric CHECK(series_volume>0 AND series_volume NOT IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)),
 platform text NOT NULL CHECK(platform IN ('Audible','Kindle','Physical','Unknown')),
 status text NOT NULL CHECK(status IN ('read','wishlist','unread','reading','reread','paused','abandoned')),
 cover_url text CHECK(cover_url ~ '^https?://[^[:space:]]+$'),word_count integer CHECK(word_count>0),next_rank smallint CHECK(next_rank>0),next_slot text CHECK(next_slot IN ('Primary','Secondary')),why_next text,
 community_rating numeric CHECK(community_rating BETWEEN 0 AND 5 AND scale(community_rating)<=2 AND community_rating NOT IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)),
 ratings_count bigint CHECK(ratings_count>=0),rating_source text,rating_updated date CHECK(isfinite(rating_updated)),
 finished_from date,finished_to date,finished_precision text NOT NULL DEFAULT 'unknown' CHECK(finished_precision IN ('unknown','day','month','year','range')),
 finished_date_raw text,finished_year_raw text,added_at date CHECK(isfinite(added_at)),
 row_version bigint NOT NULL DEFAULT 1 CHECK(row_version>0),archived_at timestamptz CHECK(isfinite(archived_at)),
 CONSTRAINT book_series_volume CHECK(series_volume IS NULL OR series_id IS NOT NULL),
 CONSTRAINT completion_bounds CHECK((finished_precision='unknown' AND finished_from IS NULL AND finished_to IS NULL) OR (finished_precision<>'unknown' AND finished_from IS NOT NULL AND finished_to IS NOT NULL AND isfinite(finished_from) AND isfinite(finished_to) AND finished_from<=finished_to)),
 CONSTRAINT completion_day CHECK(finished_precision<>'day' OR finished_from=finished_to),
 CONSTRAINT completion_range CHECK(finished_precision<>'range' OR finished_from<finished_to),
 CONSTRAINT completion_month CHECK(finished_precision<>'month' OR (extract(day FROM finished_from)=1 AND finished_to=(finished_from+interval '1 month'-interval '1 day')::date)),
 CONSTRAINT completion_year CHECK(finished_precision<>'year' OR (extract(month FROM finished_from)=1 AND extract(day FROM finished_from)=1 AND finished_to=(finished_from+interval '1 year'-interval '1 day')::date)),
created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by text NOT NULL CHECK(updated_by ~ '[^[:space:]]'), source_updated_at timestamptz, source_updated_by text,
 last_import_run_id uuid REFERENCES import_audit.import_runs ON UPDATE RESTRICT ON DELETE RESTRICT
);
CREATE INDEX books_import_run_idx ON library.books(last_import_run_id);
CREATE TABLE library.book_feedback(
book_id bigint PRIMARY KEY REFERENCES library.books ON UPDATE RESTRICT ON DELETE RESTRICT,
 rating numeric CHECK(rating BETWEEN 0 AND 5 AND scale(rating)<=1 AND rating NOT IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)),opinion text,opinion_raw text,notes text,
 row_version bigint NOT NULL DEFAULT 1 CHECK(row_version>0),
created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by text NOT NULL CHECK(updated_by ~ '[^[:space:]]'), source_updated_at timestamptz, source_updated_by text,
 last_import_run_id uuid REFERENCES import_audit.import_runs ON UPDATE RESTRICT ON DELETE RESTRICT
);
CREATE INDEX book_feedback_import_run_idx ON library.book_feedback(last_import_run_id);
CREATE TABLE library.book_assessments(
book_id bigint PRIMARY KEY REFERENCES library.books ON UPDATE RESTRICT ON DELETE RESTRICT,
 pros text,cons text,personal_relevance numeric CHECK(personal_relevance BETWEEN 0 AND 10 AND scale(personal_relevance)<=2 AND personal_relevance NOT IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)),relevance_reason text,relevance_updated date CHECK(isfinite(relevance_updated)),
 review_state text NOT NULL DEFAULT 'unreviewed' CHECK(review_state IN ('unreviewed','accepted','rejected')),reviewed_by text,reviewed_at timestamptz,
 row_version bigint NOT NULL DEFAULT 1 CHECK(row_version>0),
 CONSTRAINT assessment_review CHECK((review_state='unreviewed' AND reviewed_by IS NULL AND reviewed_at IS NULL) OR (review_state<>'unreviewed' AND reviewed_by IS NOT NULL AND reviewed_by ~ '[^[:space:]]' AND reviewed_at IS NOT NULL AND isfinite(reviewed_at))),
created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by text NOT NULL CHECK(updated_by ~ '[^[:space:]]'), source_updated_at timestamptz, source_updated_by text,
 last_import_run_id uuid REFERENCES import_audit.import_runs ON UPDATE RESTRICT ON DELETE RESTRICT
);
CREATE INDEX book_assessments_import_run_idx ON library.book_assessments(last_import_run_id);

CREATE TABLE library.author_aliases(alias_key text PRIMARY KEY CHECK(alias_key ~ '[^[:space:]]'),alias text NOT NULL CHECK(alias ~ '[^[:space:]]'),author_id bigint NOT NULL REFERENCES library.authors ON UPDATE RESTRICT ON DELETE RESTRICT,resolution_note text NOT NULL CHECK(resolution_note ~ '[^[:space:]]'));
CREATE INDEX author_aliases_author_idx ON library.author_aliases(author_id);
CREATE TABLE library.book_authors(book_id bigint NOT NULL REFERENCES library.books ON UPDATE RESTRICT ON DELETE RESTRICT,author_id bigint NOT NULL REFERENCES library.authors ON UPDATE RESTRICT ON DELETE RESTRICT,position integer NOT NULL CHECK(position>0),PRIMARY KEY(book_id,author_id),UNIQUE(book_id,position));
CREATE INDEX book_authors_author_idx ON library.book_authors(author_id);
CREATE TABLE library.book_genres(book_id bigint NOT NULL REFERENCES library.books ON UPDATE RESTRICT ON DELETE RESTRICT,genre_id bigint NOT NULL REFERENCES library.genres ON UPDATE RESTRICT ON DELETE RESTRICT,PRIMARY KEY(book_id,genre_id));
CREATE INDEX book_genres_genre_idx ON library.book_genres(genre_id);
CREATE INDEX books_series_idx ON library.books(series_id);
CREATE TABLE library.book_field_provenance(
 book_id bigint NOT NULL REFERENCES library.books ON UPDATE RESTRICT ON DELETE RESTRICT,
 field_name text NOT NULL CHECK(field_name IN ('books.title','books.series_id','books.series_volume','books.platform','books.status','books.cover_url','books.word_count','books.next_rank','books.next_slot','books.why_next','books.community_rating','books.ratings_count','books.rating_source','books.rating_updated','books.finished_from','books.finished_to','books.finished_precision','books.finished_date_raw','books.finished_year_raw','books.added_at','books.series_label_raw','books.authors','books.genres','book_feedback.rating','book_feedback.opinion','book_feedback.opinion_raw','book_feedback.notes','book_assessments.pros','book_assessments.cons','book_assessments.personal_relevance','book_assessments.relevance_reason','book_assessments.relevance_updated')),
 origin text NOT NULL CHECK(origin IN ('user','ai','external','unknown')),actor text,provider text,model text,prompt_version text,source_reference text,produced_at timestamptz,reviewed_by text,reviewed_at timestamptz,
 import_run_id uuid REFERENCES import_audit.import_runs ON UPDATE RESTRICT ON DELETE RESTRICT,
 value_sha256 text NOT NULL CHECK(value_sha256 ~ '^[0-9a-f]{64}$'),hash_version text NOT NULL CHECK(hash_version='pg-jsonb-text-v1'),PRIMARY KEY(book_id,field_name)
);
CREATE INDEX book_field_provenance_run_idx ON library.book_field_provenance(import_run_id);
CREATE FUNCTION library.value_hash(qualified_field text,logical_type text,normalized_value jsonb) RETURNS text
 LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,pg_temp
 AS $$ SELECT encode(sha256(convert_to(jsonb_build_object('field',qualified_field,'type',logical_type,'value',normalized_value)::text,'UTF8')),'hex') $$;
GRANT SELECT ON library.authors,library.author_aliases,library.series,library.genres,library.books,library.book_feedback,library.book_assessments,library.book_authors,library.book_genres,library.book_field_provenance TO library_private_reader;
GRANT SELECT,INSERT,UPDATE ON library.authors,library.author_aliases,library.series,library.genres,library.books,library.book_feedback,library.book_assessments,library.book_authors,library.book_genres,library.book_field_provenance TO library_importer;
GRANT USAGE,SELECT ON SEQUENCE library.authors_id_seq,library.series_id_seq,library.genres_id_seq,library.books_id_seq TO library_importer;
GRANT EXECUTE ON FUNCTION library.value_hash(text,text,jsonb) TO library_importer,library_private_reader;
