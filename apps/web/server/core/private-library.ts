import type { createProductAuth } from './auth';
import { permitsUser } from './config';

export const privateHeaders = {
  'content-type': 'application/json',
  'cache-control': 'private, no-store, max-age=0',
  vary: 'Cookie',
};
export function privateJson(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: privateHeaders });
}
type QueryPool = {
  query(sql: string, values: string[]): Promise<{ rows: Record<string, unknown>[] }>;
};
export async function privateLibraryResponse(
  request: Request,
  auth: ReturnType<typeof createProductAuth>,
  pool: QueryPool,
): Promise<Response> {
  if (request.method !== 'GET')
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...privateHeaders, allow: 'GET' },
    });
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
      query: { disableCookieCache: true },
    });
    if (!session) return privateJson({ error: 'Sign in required' }, 401);
    if (!permitsUser(session.user))
      return privateJson({ error: 'A verified account is required' }, 403);
    const path = new URL(request.url).pathname;
    if (path === '/api/private/session')
      return privateJson({ user: { id: session.user.id, name: session.user.name } });
    if (path === '/api/private/books') {
      const result = await pool.query('SELECT library.catalog_for_user($1) AS books', [
        session.user.id,
      ]);
      if (!result.rows[0]) throw new Error('MISSING_LIBRARY_RESULT');
      return privateJson({ books: result.rows[0].books });
    }
    const match = /^\/api\/private\/books\/([^/]+)$/.exec(path);
    if (match) {
      const stableId = decodeURIComponent(match[1]!);
      if (stableId.length > 500) return privateJson({ error: 'Book not found' }, 404);
      const result = await pool.query('SELECT library.book_for_user($1,$2) AS book', [
        session.user.id,
        stableId,
      ]);
      return result.rows[0]?.book
        ? privateJson({ book: result.rows[0].book })
        : privateJson({ error: 'Book not found' }, 404);
    }
    return privateJson({ error: 'Not found' }, 404);
  } catch {
    return privateJson({ error: 'Library temporarily unavailable' }, 503);
  }
}
