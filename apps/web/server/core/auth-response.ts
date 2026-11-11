import { privateJson } from './private-library';
import { verifyOAuthQueryParams } from '@better-auth/oauth-provider';

interface AuthBoundary {
  handler(request: Request): Promise<Response>;
  options: { baseURL?: unknown; secret?: string; plugins?: { id: string }[] };
  api: {
    getSession(input: {
      headers: Headers;
      query: { disableCookieCache: true };
    }): Promise<{ session: { token: string } } | null>;
  };
  $context: Promise<{ internalAdapter: { deleteSession(token: string): Promise<void> } }>;
}

/** Product login boundary: clients cannot expand OAuth scopes or choose callbacks. */
export async function productAuthResponse(request: Request, auth: AuthBoundary): Promise<Response> {
  try {
    const path = new URL(request.url).pathname;
    const oauthEnabled =
      auth.options.plugins?.some((plugin) => plugin.id === 'oauth-provider') === true;
    const oauthPaths = [
      '/api/auth/oauth2/authorize',
      '/api/auth/oauth2/token',
      '/api/auth/oauth2/register',
      '/api/auth/oauth2/revoke',
      '/api/auth/oauth2/introspect',
      '/api/auth/oauth2/consent',
      '/api/auth/.well-known/oauth-authorization-server',
    ];
    if (
      !(oauthEnabled && oauthPaths.includes(path)) &&
      !['/api/auth/sign-in/social', '/api/auth/callback/google', '/api/auth/sign-out'].includes(
        path,
      )
    ) {
      return privateJson({ error: 'Not found' }, 404);
    }
    // Bound actual streamed bytes before either local JSON parsing or provider parsing.
    if (request.method === 'POST' && request.body) {
      const reader = request.body.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        length += part.value.byteLength;
        if (length > 32768) {
          await reader.cancel().catch(() => {});
          return privateJson({ error: 'Authorization request too large' }, 413);
        }
        chunks.push(part.value);
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const headers = new Headers(request.headers);
      headers.delete('content-length');
      request = new Request(request.url, {
        method: 'POST',
        headers,
        signal: request.signal,
        body: bytes,
      });
    }
    if (request.method === 'POST' && path === '/api/auth/sign-out') {
      // Upstream sign-out swallows deletion errors. Confirm revocation first and
      // leave cookies intact if persistence fails, so the UI cannot claim success.
      if (request.headers.get('origin') !== auth.options.baseURL)
        return privateJson({ error: 'Invalid origin' }, 403);
      const session = await auth.api.getSession({
        headers: request.headers,
        query: { disableCookieCache: true },
      });
      if (session) await (await auth.$context).internalAdapter.deleteSession(session.session.token);
    }
    if (request.method === 'POST' && new URL(request.url).pathname === '/api/auth/sign-in/social') {
      let body: { provider?: unknown; oauth_query?: unknown };
      try {
        body = await request.json();
      } catch {
        return privateJson({ error: 'Invalid sign-in request' }, 400);
      }
      if (body?.provider !== 'google')
        return privateJson({ error: 'Sign-in provider unavailable' }, 400);
      let oauthQuery: string | undefined;
      if (body.oauth_query !== undefined) {
        if (
          !oauthEnabled ||
          typeof body.oauth_query !== 'string' ||
          body.oauth_query.length > 12000 ||
          !auth.options.secret ||
          !(await verifyOAuthQueryParams(body.oauth_query, auth.options.secret))
        )
          return privateJson({ error: 'Invalid authorization request' }, 400);
        oauthQuery = body.oauth_query;
      }
      const headers = new Headers(request.headers);
      headers.delete('content-length');
      request = new Request(request.url, {
        method: 'POST',
        headers,
        signal: request.signal,
        body: JSON.stringify({
          provider: 'google',
          ...(oauthQuery ? { oauth_query: oauthQuery } : {}),
          callbackURL: '/library',
          errorCallbackURL: '/?signin=error',
        }),
      });
    }
    const response = await auth.handler(request);
    if (response.status >= 500)
      return privateJson({ error: 'Sign-in temporarily unavailable' }, 503);
    response.headers.set('cache-control', 'private, no-store, max-age=0');
    response.headers.append('vary', 'Cookie');
    return response;
  } catch {
    return privateJson({ error: 'Sign-in temporarily unavailable' }, 503);
  }
}
