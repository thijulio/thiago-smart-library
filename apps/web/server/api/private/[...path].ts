import { defineEventHandler, toWebRequest } from 'h3';
import { productRuntime } from '../../utils/runtime';
import { privateJson, privateLibraryResponse } from '../../core/private-library';

export default defineEventHandler(async (event) => {
  const request = toWebRequest(event);
  // Unauthenticated requests do not require configured or reachable database credentials.
  if (!request.headers.get('cookie')) return privateJson({ error: 'Sign in required' }, 401);
  try {
    const { auth, pool } = productRuntime();
    try {
      return await privateLibraryResponse(request, auth, pool);
    } finally {
      await pool.end().catch(() => {});
    }
  } catch {
    return privateJson({ error: 'Library temporarily unavailable' }, 503);
  }
});
