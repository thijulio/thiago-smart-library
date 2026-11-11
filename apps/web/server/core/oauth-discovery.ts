import { privateJson } from './private-library';
import { productAuthResponse } from './auth-response';
import { mcpResourceMetadata } from './oauth';
import type { createProductAuth } from './auth';
export async function oauthDiscoveryResponse(
  request: Request,
  auth: ReturnType<typeof createProductAuth>,
) {
  if (!auth.options.plugins.some((plugin) => plugin.id === 'oauth-provider'))
    return privateJson({ error: 'Not found' }, 404);
  if (!['GET', 'HEAD'].includes(request.method))
    return new Response(null, {
      status: 405,
      headers: { allow: 'GET, HEAD', 'cache-control': 'no-store' },
    });
  const url = new URL(request.url);
  const origin = String(auth.options.baseURL);
  if (url.pathname === '/.well-known/oauth-protected-resource/mcp') {
    return request.method === 'HEAD'
      ? new Response(null, { headers: { 'cache-control': 'no-store' } })
      : privateJson(mcpResourceMetadata(origin));
  }
  if (
    ![
      '/.well-known/oauth-authorization-server',
      '/.well-known/oauth-authorization-server/api/auth',
    ].includes(url.pathname)
  )
    return privateJson({ error: 'Not found' }, 404);
  const response = await productAuthResponse(
    new Request(origin + '/api/auth/.well-known/oauth-authorization-server', {
      method: request.method,
    }),
    auth,
  );
  return response;
}
