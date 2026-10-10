import { privateJson } from './private-library';

interface AuthBoundary {
  handler(request: Request): Promise<Response>;
  options: { baseURL?: unknown };
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
    if (
      !['/api/auth/sign-in/social', '/api/auth/callback/google', '/api/auth/sign-out'].includes(
        path,
      )
    ) {
      return privateJson({ error: 'Not found' }, 404);
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
      let body: { provider?: unknown };
      try {
        body = await request.json();
      } catch {
        return privateJson({ error: 'Invalid sign-in request' }, 400);
      }
      if (body?.provider !== 'google')
        return privateJson({ error: 'Sign-in provider unavailable' }, 400);
      const headers = new Headers(request.headers);
      headers.delete('content-length');
      request = new Request(request.url, {
        method: 'POST',
        headers,
        signal: request.signal,
        body: JSON.stringify({
          provider: 'google',
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
