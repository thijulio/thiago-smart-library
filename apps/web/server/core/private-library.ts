import { isStoredResult, isStoredPlan } from '@smart-library/domain';
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
    const resultMatch = /^\/api\/private\/ai-results\/([^/]+)\/([^/]+)$/.exec(path);
    if (resultMatch) {
      const kind = decodePrivateSegment(resultMatch[1]!);
      const stableId = decodePrivateSegment(resultMatch[2]!);
      if (
        !['enrichment', 'taste', 'format'].includes(kind ?? '') ||
        !stableId ||
        stableId.length > 500
      )
        return privateJson({ error: 'Book not found' }, 404);
      let value: unknown;
      try {
        const result = await pool.query('SELECT library.ai_result_for_user($1,$2,$3) AS result', [
          session.user.id,
          stableId,
          kind!,
        ]);
        value = result.rows[0]?.result;
      } catch (error) {
        if (
          error !== null &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === 'P0002'
        )
          return privateJson({ error: 'Book not found' }, 404);
        throw error;
      }
      return privateJson({
        result:
          isStoredResult(value) && value.kind === kind && value.bookStableId === stableId
            ? value
            : { kind, bookStableId: stableId, state: 'unavailable' },
      });
    }
    const planMatch = /^\/api\/private\/reading-plans\/([^/]+)$/.exec(path);
    if (planMatch) {
      const platform = decodePrivateSegment(planMatch[1]!);
      if (platform !== 'Kindle' && platform !== 'Audible')
        return privateJson({ error: 'Not found' }, 404);
      const result = await pool.query('SELECT library.reading_plan_for_user($1,$2) AS plan', [
        session.user.id,
        platform,
      ]);
      const value = result.rows[0]?.plan;
      return privateJson({
        plan:
          isStoredPlan(value) && value.platform === platform
            ? value
            : { platform, state: 'unavailable' },
      });
    }
    if (path === '/api/private/reading') {
      const result = await pool.query('SELECT library.reading_for_user($1) AS books', [
        session.user.id,
      ]);
      if (!Array.isArray(result.rows[0]?.books)) throw new Error('MISSING_READING_RESULT');
      return privateJson({ books: result.rows[0].books, queueState: 'available' });
    }
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

function decodePrivateSegment(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
