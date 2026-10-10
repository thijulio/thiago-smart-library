import { defineEventHandler, toWebRequest } from 'h3';
import { productRuntime } from '../../utils/runtime';
import { privateJson } from '../../core/private-library';
import { productAuthResponse } from '../../core/auth-response';

export default defineEventHandler(async (event) => {
  try {
    const { auth, pool } = productRuntime();
    try {
      return await productAuthResponse(toWebRequest(event), auth);
    } finally {
      await pool.end().catch(() => {});
    }
  } catch {
    return privateJson({ error: 'Sign-in temporarily unavailable' }, 503);
  }
});
