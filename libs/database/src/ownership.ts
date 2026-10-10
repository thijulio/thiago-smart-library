import type { Pool } from 'pg';
import { withTransaction } from './connection';

/** Offline owner action, never called by signup, HTTP requests, builds or startup. */
export async function bindImportedLibrary(
  pool: Pool,
  userId: string,
): Promise<{ assigned: number }> {
  if (!userId.trim()) throw new Error('VERIFIED_USER_REQUIRED');
  return withTransaction(pool, async (client) => {
    await client.query('LOCK TABLE library.user_libraries,library.library_books IN EXCLUSIVE MODE');
    await client.query('LOCK TABLE library.books IN SHARE MODE');
    const user = await client.query(
      'SELECT id FROM auth."user" WHERE id=$1 AND "emailVerified"=true FOR UPDATE',
      [userId],
    );
    if (!user.rowCount) throw new Error('VERIFIED_USER_REQUIRED');
    const other = await client.query(
      'SELECT 1 FROM library.user_libraries WHERE owner_user_id<>$1',
      [userId],
    );
    if (other.rowCount) throw new Error('LIBRARY_ALREADY_BOUND');
    const library = await client.query(
      'INSERT INTO library.user_libraries(owner_user_id) VALUES($1) ON CONFLICT(owner_user_id) DO UPDATE SET owner_user_id=EXCLUDED.owner_user_id RETURNING id',
      [userId],
    );
    const assigned = await client.query(
      'INSERT INTO library.library_books(book_id,library_id) SELECT id,$1 FROM library.books ON CONFLICT(book_id) DO NOTHING',
      [library.rows[0].id],
    );
    return { assigned: assigned.rowCount ?? 0 };
  });
}
