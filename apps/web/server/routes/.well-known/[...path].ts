import { defineEventHandler, toWebRequest } from 'h3';
import { productRuntime } from '../../utils/runtime';
import { privateJson } from '../../core/private-library';
import { oauthDiscoveryResponse } from '../../core/oauth-discovery';
export default defineEventHandler(async (event) => {
  try {
    const { auth, pool } = productRuntime();
    try {
      return await oauthDiscoveryResponse(toWebRequest(event), auth);
    } finally {
      await pool.end().catch(() => {});
    }
  } catch {
    return privateJson({ error: 'Authorization temporarily unavailable' }, 503);
  }
});
