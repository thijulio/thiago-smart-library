import { defineEventHandler, toWebRequest } from 'h3';
import { readRuntimeConfig } from '../core/config';
import { createLibraryService } from '../core/library-service';
import { mcpResponse } from '../core/mcp';
import { resolveMcpPrincipal } from '../core/oauth';
import { productRuntime } from '../utils/runtime';

export default defineEventHandler(async (event) => {
  try {
    const config = readRuntimeConfig(process.env);
    if (!config.mcpOAuthEnabled) throw new Error();
    const { pool, auth } = productRuntime();
    try {
      return await mcpResponse(toWebRequest(event), {
        origin: config.origin,
        service: createLibraryService(pool),
        resolvePrincipal: (request) => resolveMcpPrincipal(request, auth, config.origin),
      });
    } finally {
      await pool.end().catch(() => {});
    }
  } catch {
    return Response.json(
      { error: 'MCP temporarily unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
});
