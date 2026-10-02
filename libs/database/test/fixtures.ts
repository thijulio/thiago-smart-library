import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import type { SqlClient } from '../src/connection';
import type { ReadingStatus } from '@smart-library/domain';
export async function insertBookFixture(
  input: SqlClient,
  options: { stableId?: string; title?: string; status?: ReadingStatus } = {},
) {
  const lease = input instanceof Pool ? await input.connect() : undefined;
  const client = lease ?? input;
  await client.query('BEGIN');
  try {
    const b = (
      await client.query(
        "INSERT INTO library.books(stable_id,title,status,platform,updated_by) VALUES($1,$2,$3,'Unknown',session_user) RETURNING id,stable_id,row_version",
        [
          options.stableId ?? randomUUID(),
          options.title ?? 'Example Book',
          options.status ?? 'unread',
        ],
      )
    ).rows[0];
    const a = (
      await client.query(
        "INSERT INTO library.authors(name,name_key,updated_by) VALUES('Example Author',$1,session_user) RETURNING id",
        [randomUUID()],
      )
    ).rows[0];
    await client.query(
      'INSERT INTO library.book_authors(book_id,author_id,position) VALUES($1,$2,1)',
      [b.id, a.id],
    );
    await client.query('COMMIT');
    return {
      id: b.id as string,
      stableId: b.stable_id as string,
      version: b.row_version as string,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    lease?.release();
  }
}
