import { createHash } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { getMigrations } from 'better-auth/db/migration';
import { makeSignature } from 'better-auth/crypto';
import { createTestDatabase } from './harness';
import { createProductAuth } from '../../../apps/web/server/core/auth';
import { productAuthResponse } from '../../../apps/web/server/core/auth-response';
import { oauthDiscoveryResponse } from '../../../apps/web/server/core/oauth-discovery';
import { resolveMcpPrincipal } from '../../../apps/web/server/core/oauth';
const origin = 'https://library.example.test';
const secret = 'synthetic-mcp-secret-at-least-thirty-two-characters';
let db: Awaited<ReturnType<typeof createTestDatabase>>;
let auth: ReturnType<typeof createProductAuth>;
let cookie: string;
let clientId: string;
beforeAll(async () => {
  db = await createTestDatabase();
  auth = createProductAuth(db.appRuntime, {
    origin,
    secret,
    googleClientId: 'synthetic',
    googleClientSecret: 'synthetic',
    databaseUrl: '',
    mcpOAuthEnabled: true,
  });
  await db.owner.query(
    `INSERT INTO auth."user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES('oauth-user','Reader','oauth@example.test',true,now(),now())`,
  );
  await db.owner.query(
    `INSERT INTO auth.session(id,token,"userId","expiresAt","createdAt","updatedAt") VALUES('oauth-session','oauth-session','oauth-user',now()+interval '1 hour',now(),now())`,
  );
  cookie =
    '__Secure-better-auth.session_token=' +
    encodeURIComponent('oauth-session.' + (await makeSignature('oauth-session', secret)));
});
afterAll(async () => {
  await db?.dispose();
});
async function oauth(path: string, body?: unknown, sessionCookie?: string) {
  return productAuthResponse(
    new Request(origin + '/api/auth' + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        origin,
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(sessionCookie ? { cookie: sessionCookie } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
    auth,
  );
}
it('exposes standard OAuth metadata without offline access', async () => {
  const response = await oauth('/.well-known/oauth-authorization-server');
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    authorization_endpoint: origin + '/api/auth/oauth2/authorize',
    code_challenge_methods_supported: ['S256'],
    scopes_supported: ['library:read', 'library:write'],
  });
  expect(response.headers.get('cache-control')).toContain('no-store');
});
it('serves RFC 8414 and protected-resource discovery at standard paths', async () => {
  for (const path of [
    '/.well-known/oauth-authorization-server',
    '/.well-known/oauth-authorization-server/api/auth',
  ]) {
    const response = await oauthDiscoveryResponse(new Request(origin + path), auth);
    expect(response.status).toBe(200);
    expect((await response.json()).issuer).toBe(origin + '/api/auth');
  }
  const metadata = await oauthDiscoveryResponse(
    new Request(origin + '/.well-known/oauth-protected-resource/mcp'),
    auth,
  );
  expect(await metadata.json()).toMatchObject({
    resource: origin + '/mcp',
    authorization_servers: [origin + '/api/auth'],
  });
  expect(
    (await oauthDiscoveryResponse(new Request(origin + '/.well-known/unknown'), auth)).status,
  ).toBe(404);
  expect(
    (
      await oauthDiscoveryResponse(
        new Request(origin + '/.well-known/oauth-authorization-server', { method: 'POST' }),
        auth,
      )
    ).status,
  ).toBe(405);
});
it('matches all pinned OAuth tables without runtime DDL and keeps producers out', async () => {
  const plan = await getMigrations(auth.options);
  expect(plan.toBeCreated).toEqual([]);
  expect(plan.toBeAdded).toEqual([]);
  expect(plan.toBeAddedIndexes).toEqual([]);
  expect(plan.schemaProblems).toEqual([]);
  await expect(db.aiProducer.query('SELECT * FROM auth."oauthAccessToken"')).rejects.toMatchObject({
    code: '42501',
  });
});
it('registers a public PKCE client and never permits offline scope', async () => {
  const response = await oauth('/oauth2/register', {
    client_name: 'Synthetic MCP client',
    redirect_uris: ['https://client.example.test/callback'],
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code'],
    response_types: ['code'],
    scope: 'library:read library:write',
  });
  expect(response.status).toBe(201);
  const registered = await response.json();
  clientId = registered.client_id;
  expect(clientId).toBeTypeOf('string');
  expect(
    (
      await oauth('/oauth2/register', {
        redirect_uris: ['https://client.example.test/callback'],
        scope: 'offline_access',
      })
    ).status,
  ).toBe(400);
});
it('rejects an unregistered redirect without redirecting to it', async () => {
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: 'https://unregistered.example.test/callback',
    response_type: 'code',
    scope: 'library:read',
  });
  const response = await oauth('/oauth2/authorize?' + query, undefined, cookie);
  expect(response.headers.get('location')).not.toContain('unregistered.example.test');
  expect(response.headers.get('location')).toContain('error=invalid_redirect');
});
it('preserves signed OAuth context in Google sign-in while keeping ordinary callbacks fixed', async () => {
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: 'https://client.example.test/callback',
    response_type: 'code',
    scope: 'library:read',
    resource: origin + '/mcp',
    state: 'synthetic-login',
    code_challenge: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ',
    code_challenge_method: 'S256',
  });
  const response = await oauth('/oauth2/authorize?' + query);
  const loginUrl = new URL(response.headers.get('location')!, origin);
  expect(loginUrl.pathname).toBe('/oauth/login');
  const signed = loginUrl.search.slice(1);
  const signIn = await oauth('/sign-in/social', {
    provider: 'google',
    oauth_query: signed,
    callbackURL: 'https://unregistered.example.test',
    scopes: ['drive'],
  });
  expect(signIn.status).toBe(200);
  const google = new URL((await signIn.json()).url);
  expect(google.origin).toBe('https://accounts.google.com');
  expect(google.searchParams.get('scope')).not.toContain('drive');
  const tampered = signed.replace('library%3Aread', 'library%3Awrite');
  expect(
    (await oauth('/sign-in/social', { provider: 'google', oauth_query: tampered })).status,
  ).toBe(400);
  expect(
    (await oauth('/sign-in/social', { provider: 'google', oauth_query: 'client_id=forged' }))
      .status,
  ).toBe(400);
});
let bearer: string;
it('requires consent and S256, exchanges an authorization code and resolves a live principal', async () => {
  const verifier = 'synthetic-pkce-verifier-long-enough-to-meet-standard';
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: 'https://client.example.test/callback',
    response_type: 'code',
    scope: 'library:read library:write',
    resource: origin + '/mcp',
    state: 'synthetic-state',
  });
  const noPkce = await oauth('/oauth2/authorize?' + query, undefined, cookie);
  expect(noPkce.headers.get('location')).toContain('error=invalid_request');
  query.set('code_challenge', createHash('sha256').update(verifier).digest('base64url'));
  query.set('code_challenge_method', 'plain');
  expect(
    (await oauth('/oauth2/authorize?' + query, undefined, cookie)).headers.get('location'),
  ).toContain('error=invalid_request');
  query.set('code_challenge_method', 'S256');
  const authorized = await oauth('/oauth2/authorize?' + query, undefined, cookie);
  const consentUrl = new URL(authorized.headers.get('location')!, origin);
  expect(consentUrl.pathname).toBe('/oauth/consent');
  const consent = await oauth(
    '/oauth2/consent',
    { accept: true, oauth_query: consentUrl.search.slice(1) },
    cookie,
  );
  expect(consent.status).toBe(200);
  const destination = new URL((await consent.json()).url);
  expect(destination.origin).toBe('https://client.example.test');
  expect(destination.searchParams.get('state')).toBe('synthetic-state');
  const tokenBody = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    code: destination.searchParams.get('code')!,
    redirect_uri: 'https://client.example.test/callback',
    code_verifier: verifier,
    resource: origin + '/mcp',
  });
  const tokenRequest = () =>
    new Request(origin + '/api/auth/oauth2/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: tokenBody,
    });
  const token = await productAuthResponse(tokenRequest(), auth);
  expect(token.status).toBe(200);
  bearer = (await token.json()).access_token;
  expect(
    await resolveMcpPrincipal(
      new Request(origin + '/mcp', { headers: { authorization: 'Bearer ' + bearer } }),
      auth,
      origin,
    ),
  ).toEqual({ userId: 'oauth-user', clientId, scopes: ['library:read', 'library:write'] });
});
it('rejects expired, revoked, foreign-audience, disabled-client and unverified grants on the next request', async () => {
  const resolve = () =>
    resolveMcpPrincipal(
      new Request(origin + '/mcp', { headers: { authorization: 'Bearer ' + bearer } }),
      auth,
      origin,
    );
  for (const [sql, restore] of [
    [
      `UPDATE auth."oauthAccessToken" SET "expiresAt"=now()-interval '1 second'`,
      `UPDATE auth."oauthAccessToken" SET "expiresAt"=now()+interval '1 hour'`,
    ],
    [
      `UPDATE auth."oauthAccessToken" SET revoked=now()`,
      `UPDATE auth."oauthAccessToken" SET revoked=NULL`,
    ],
    [
      `UPDATE auth."oauthAccessToken" SET resources='["https://foreign.example.test/mcp"]'`,
      `UPDATE auth."oauthAccessToken" SET resources='["${origin}/mcp"]'`,
    ],
    [
      `UPDATE auth.session SET "expiresAt"=now()-interval '1 second'`,
      `UPDATE auth.session SET "expiresAt"=now()+interval '1 hour'`,
    ],
    [`UPDATE auth."oauthClient" SET disabled=true`, `UPDATE auth."oauthClient" SET disabled=false`],
    [`UPDATE auth."user" SET "emailVerified"=false`, `UPDATE auth."user" SET "emailVerified"=true`],
  ]) {
    await db.owner.query(sql!);
    expect(await resolve()).toBeNull();
    await db.owner.query(restore!);
    expect(await resolve(), restore).not.toBeNull();
  }
});
it('never exposes the internal principal endpoint or accepts browser cookies as bearer credentials', async () => {
  expect((await oauth('/mcp-principal', undefined, cookie)).status).toBe(404);
  expect(
    await resolveMcpPrincipal(new Request(origin + '/mcp', { headers: { cookie } }), auth, origin),
  ).toBeNull();
  expect(
    await resolveMcpPrincipal(
      new Request(origin + '/mcp', { headers: { authorization: 'Bearer unknown' } }),
      auth,
      origin,
    ),
  ).toBeNull();
});
it('revokes an opaque bearer through the public-client endpoint immediately', async () => {
  const value = 'synthetic-revocable-access-token';
  const hash = createHash('sha256').update(value).digest('base64url');
  await db.owner.query(
    `INSERT INTO auth."oauthAccessToken"(id,token,"clientId","sessionId","userId",resources,"expiresAt","createdAt",scopes) SELECT 'revocable',$1,"clientId","sessionId","userId",resources,"expiresAt","createdAt",scopes FROM auth."oauthAccessToken" LIMIT 1`,
    [hash],
  );
  const request = new Request(origin + '/mcp', { headers: { authorization: 'Bearer ' + value } });
  expect(await resolveMcpPrincipal(request, auth, origin)).not.toBeNull();
  const revoked = await productAuthResponse(
    new Request(origin + '/api/auth/oauth2/revoke', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        token: value,
        token_type_hint: 'access_token',
      }),
    }),
    auth,
  );
  expect(revoked.status).toBe(200);
  expect(await resolveMcpPrincipal(request, auth, origin)).toBeNull();
});
it('rejects a deleted session even after its token FK becomes null', async () => {
  await db.owner.query(`DELETE FROM auth.session WHERE id='oauth-session'`);
  expect(
    await resolveMcpPrincipal(
      new Request(origin + '/mcp', { headers: { authorization: 'Bearer ' + bearer } }),
      auth,
      origin,
    ),
  ).toBeNull();
});
