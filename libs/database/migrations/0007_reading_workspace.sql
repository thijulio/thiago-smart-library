-- Read-only projection of existing current reading and explicit source-owned choices.
SET LOCAL ROLE library_owner;
CREATE FUNCTION library.reading_for_user(app_user_id text) RETURNS jsonb
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp
 AS $$
 SELECT COALESCE(jsonb_agg(
   c.card || jsonb_build_object('nextRank',b.next_rank,'nextSlot',b.next_slot,'whyNext',b.why_next)
   ORDER BY c.card->>'title',c.stable_id
 ),'[]'::jsonb)
 FROM library.user_book_cards c JOIN library.books b ON b.id=c.book_id
 WHERE c.owner_user_id=app_user_id
   AND (b.status IN ('reading','reread')
     OR (b.status IN ('unread','wishlist') AND b.next_rank IS NOT NULL))
 $$;
REVOKE ALL ON FUNCTION library.reading_for_user(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION library.reading_for_user(text) TO library_app_runtime;
