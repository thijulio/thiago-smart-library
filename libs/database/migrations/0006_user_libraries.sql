-- Additive product auth/ownership contract. Prior imported records remain unassigned.
RESET ROLE;
DO $role$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='library_app_runtime') THEN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='library_app_runtime' AND
    (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls))
    OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname='library_app_runtime'))
  THEN RAISE EXCEPTION 'UNSAFE_EXISTING_ROLE'; END IF;
 ELSE
  CREATE ROLE library_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
 END IF;
END $role$;
CREATE SCHEMA auth AUTHORIZATION library_owner;
SET LOCAL ROLE library_owner;
REVOKE ALL ON SCHEMA auth FROM PUBLIC;

-- Better Auth 1.7.7 core storage, qualified in the adapter with schemaName: auth.
CREATE TABLE auth."user" (
 id text PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE,
 "emailVerified" boolean NOT NULL DEFAULT false, image text,
 "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE auth.session (
 id text PRIMARY KEY, "expiresAt" timestamptz NOT NULL, token text NOT NULL UNIQUE,
 "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL,
 "ipAddress" text, "userAgent" text,
 "userId" text NOT NULL REFERENCES auth."user"(id) ON DELETE CASCADE
);
CREATE INDEX session_user_id_idx ON auth.session("userId");
CREATE TABLE auth.account (
 id text PRIMARY KEY, "accountId" text NOT NULL, "providerId" text NOT NULL,
 "userId" text NOT NULL REFERENCES auth."user"(id) ON DELETE CASCADE,
 "accessToken" text, "refreshToken" text, "idToken" text,
 "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz,
 scope text, password text, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL,
 UNIQUE("providerId","accountId")
);
CREATE INDEX account_user_id_idx ON auth.account("userId");
CREATE TABLE auth.verification (
 id text PRIMARY KEY, identifier text NOT NULL, value text NOT NULL,
 "expiresAt" timestamptz NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX verification_identifier_idx ON auth.verification(identifier);

CREATE TABLE library.user_libraries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_user_id text NOT NULL UNIQUE REFERENCES auth."user"(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE library.library_books (
 book_id bigint PRIMARY KEY REFERENCES library.books(id) ON DELETE RESTRICT,
 library_id uuid NOT NULL REFERENCES library.user_libraries(id) ON DELETE RESTRICT
);
CREATE INDEX library_books_library_idx ON library.library_books(library_id);

CREATE VIEW library.user_book_cards AS
 SELECT ul.owner_user_id, b.id AS book_id, b.stable_id,
 jsonb_build_object(
  'stableId',b.stable_id,'title',b.title,'status',b.status,'platform',b.platform,
  'coverUrl',b.cover_url,'seriesName',s.name,'seriesVolume',b.series_volume,
  'rating',f.rating,'finishedFrom',b.finished_from,'finishedTo',b.finished_to,
  'finishedPrecision',b.finished_precision,
  'authors',COALESCE((SELECT jsonb_agg(a.name ORDER BY ba.position) FROM library.book_authors ba JOIN library.authors a ON a.id=ba.author_id WHERE ba.book_id=b.id),'[]'::jsonb),
  'genres',COALESCE((SELECT jsonb_agg(g.name ORDER BY g.name) FROM library.book_genres bg JOIN library.genres g ON g.id=bg.genre_id WHERE bg.book_id=b.id),'[]'::jsonb)
 ) AS card
 FROM library.books b JOIN library.library_books lb ON lb.book_id=b.id
 JOIN library.user_libraries ul ON ul.id=lb.library_id
 LEFT JOIN library.series s ON s.id=b.series_id
 LEFT JOIN library.book_feedback f ON f.book_id=b.id
 WHERE b.archived_at IS NULL;

CREATE FUNCTION library.catalog_for_user(app_user_id text) RETURNS jsonb
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp
 AS $$ SELECT COALESCE(jsonb_agg(c.card ORDER BY c.card->>'title',c.stable_id),'[]'::jsonb)
 FROM library.user_book_cards c WHERE c.owner_user_id=app_user_id $$;
CREATE FUNCTION library.book_for_user(app_user_id text,book_stable_id text) RETURNS jsonb
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp
 AS $$ SELECT c.card || jsonb_build_object('wordCount',b.word_count,'opinion',f.opinion,'notes',f.notes,'whyNext',b.why_next)
 FROM library.user_book_cards c JOIN library.books b ON b.id=c.book_id
 LEFT JOIN library.book_feedback f ON f.book_id=c.book_id
 WHERE c.owner_user_id=app_user_id AND c.stable_id=book_stable_id $$;

REVOKE ALL ON ALL TABLES IN SCHEMA auth FROM PUBLIC;
GRANT USAGE ON SCHEMA auth,library TO library_app_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA auth TO library_app_runtime;
GRANT EXECUTE ON FUNCTION library.catalog_for_user(text),library.book_for_user(text,text) TO library_app_runtime;
