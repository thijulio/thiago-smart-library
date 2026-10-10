import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import { createTestDatabase } from './harness';
import { insertBookFixture } from './fixtures';
import { createProductAuth } from '../../../apps/web/server/core/auth';
import { privateLibraryResponse } from '../../../apps/web/server/core/private-library';
import { productAuthResponse } from '../../../apps/web/server/core/auth-response';
import { makeSignature } from 'better-auth/crypto';
import { getMigrations } from 'better-auth/db/migration';
import { betterAuth } from 'better-auth';
async function signedCookie(token: string) {
  return (
    '__Secure-better-auth.session_token=' +
    encodeURIComponent(token + '.' + (await makeSignature(token, secret)))
  );
}

let db: Awaited<ReturnType<typeof createTestDatabase>>;
let auth: ReturnType<typeof createProductAuth>;
const secret = 'synthetic-private-auth-secret-with-thirty-two-characters';
const origin = 'https://library.example.test';
beforeAll(async () => {
  db = await createTestDatabase();
  auth = createProductAuth(db.appRuntime, {
    origin,
    secret,
    googleClientId: 'synthetic',
    googleClientSecret: 'synthetic',
    databaseUrl: '',
  });
  await db.owner.query(
    `INSERT INTO auth."user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES('user-a','A','a@example.test',true,now(),now()),('user-b','B','b@example.test',true,now(),now()),('unverified','Unverified','unverified@example.test',false,now(),now())`,
  );
  const a = await insertBookFixture(db.owner, { stableId: 'book-a', title: 'A private title' });
  const b = await insertBookFixture(db.owner, { stableId: 'book-b', title: 'B private title' });
  await db.owner.query(
    `INSERT INTO library.user_libraries(owner_user_id) VALUES('user-a'),('user-b')`,
  );
  await db.owner.query(
    `INSERT INTO library.library_books(book_id,library_id) SELECT $1,id FROM library.user_libraries WHERE owner_user_id='user-a'`,
    [a.id],
  );
  await db.owner.query(
    `INSERT INTO library.library_books(book_id,library_id) SELECT $1,id FROM library.user_libraries WHERE owner_user_id='user-b'`,
    [b.id],
  );
  for (const [token, user, expires] of [
    ['token-a', 'user-a', '1 hour'],
    ['token-b', 'user-b', '1 hour'],
    ['expired', 'user-a', '-1 hour'],
    ['unverified', 'unverified', '1 hour'],
  ]) {
    await db.owner.query(
      `INSERT INTO auth.session(id,token,"userId","expiresAt","createdAt","updatedAt") VALUES($1,$1,$2,now()+$3::interval,now(),now())`,
      [token, user, expires],
    );
  }
});
afterAll(async () => {
  await db?.dispose();
});
async function request(path: string, token?: string) {
  const cookie = token ? await signedCookie(token) : '';
  return privateLibraryResponse(
    new Request(origin + path, { headers: { cookie } }),
    auth,
    db.appRuntime,
  );
}
it('rejects anonymous and expired sessions without revealing books', async () => {
  for (const token of [undefined, 'expired', 'invalid']) {
    const response = await request('/api/private/books', token);
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain('private title');
    expect(response.headers.get('cache-control')).toContain('no-store');
  }
});
it('matches the pinned Better Auth storage contract without runtime DDL', async () => {
  const plan = await getMigrations(auth.options);
  expect(plan.toBeCreated).toEqual([]);
  expect(plan.toBeAdded).toEqual([]);
  expect(plan.schemaProblems).toEqual([]);
});
it('uses the server session user ID despite client ownership parameters', async () => {
  const response = await request('/api/private/books?userId=user-b&libraryId=foreign', 'token-a');
  expect(response.status).toBe(200);
  expect((await response.json()).books).toMatchObject([
    { stableId: 'book-a', title: 'A private title' },
  ]);
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect((await request('/api/private/books/book-b', 'token-a')).status).toBe(404);
  expect((await request('/api/private/books/book-a', 'token-a')).status).toBe(200);
});
it('rejects a revoked session on the next request', async () => {
  expect((await request('/api/private/books', 'token-b')).status).toBe(200);
  await db.owner.query(`DELETE FROM auth.session WHERE token='token-b'`);
  expect((await request('/api/private/books', 'token-b')).status).toBe(401);
});
it('rejects an unverified account even with a persisted session', async () => {
  expect((await request('/api/private/books', 'unverified')).status).toBe(403);
});
it('does not automatically claim any books for a new verified user', async () => {
  const context = await auth.$context;
  const user = await context.internalAdapter.createUser(
    { name: 'New user', email: 'new@example.test', emailVerified: true },
    { method: 'oauth', oauth: { providerId: 'google' } },
  );
  const session = await context.internalAdapter.createSession(user.id);
  expect(session).toBeTruthy();
  const response = await request('/api/private/books', session!.token);
  expect(await response.json()).toEqual({ books: [] });
  await expect(
    context.internalAdapter.createUser(
      { name: 'No verification', email: 'no@example.test', emailVerified: false },
      { method: 'oauth', oauth: { providerId: 'google' } },
    ),
  ).rejects.toThrow();
});
it('pins Google sign-in to identity scopes and rejects other providers', async () => {
  const response = await productAuthResponse(
    new Request(origin + '/api/auth/sign-in/social', {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: 'google',
        scopes: ['https://www.googleapis.com/auth/drive'],
        callbackURL: 'https://foreign.example.test',
      }),
    }),
    auth,
  );
  expect(response.status).toBe(200);
  const redirect = new URL((await response.json()).url);
  expect(new Set(redirect.searchParams.get('scope')!.split(' '))).toEqual(
    new Set(['openid', 'email', 'profile']),
  );
  expect(redirect.searchParams.get('include_granted_scopes')).not.toBe('true');
  expect(redirect.searchParams.get('redirect_uri')).toBe(origin + '/api/auth/callback/google');
  const invalid = await productAuthResponse(
    new Request(origin + '/api/auth/sign-in/social', {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'unknown' }),
    }),
    auth,
  );
  expect(invalid.status).toBe(400);
});
it('blocks unimplemented auth routes before Google scope expansion can occur', async () => {
  const cookie = await signedCookie('token-a');
  const response = await productAuthResponse(
    new Request(origin + '/api/auth/link-social', {
      method: 'POST',
      headers: { cookie, origin, 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: 'google',
        scopes: ['https://www.googleapis.com/auth/drive'],
        callbackURL: '/library',
      }),
    }),
    auth,
  );
  expect(response.status).toBe(404);
});
it('does not log raw driver errors inside the upstream auth router', async () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  const failingAuth = betterAuth({
    ...auth.options,
    databaseHooks: {
      ...auth.options.databaseHooks,
      verification: {
        create: {
          before: async () => {
            throw new Error('synthetic-private-password@private-host');
          },
        },
      },
    },
  });
  try {
    const response = await productAuthResponse(
      new Request(origin + '/api/auth/sign-in/social', {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 'google' }),
      }),
      failingAuth,
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('synthetic-private-password');
    expect(errors.mock.calls.flat().join(' ')).not.toContain('synthetic-private-password');
  } finally {
    errors.mockRestore();
  }
});
it('reports a failed logout when persisted revocation fails, then invalidates replay on success', async () => {
  await db.owner.query(
    `INSERT INTO auth.session(id,token,"userId","expiresAt","createdAt","updatedAt") VALUES('logout-probe','logout-probe','user-a',now()+interval '1 hour',now(),now())`,
  );
  const cookie = await signedCookie('logout-probe');
  const logout = () =>
    productAuthResponse(
      new Request(origin + '/api/auth/sign-out', {
        method: 'POST',
        headers: { cookie, origin, 'content-type': 'application/json' },
        body: '{}',
      }),
      auth,
    );
  await db.owner.query('REVOKE DELETE ON auth.session FROM library_app_runtime');
  try {
    const failed = await logout();
    expect(failed.status).toBe(503);
    expect(failed.headers.has('set-cookie')).toBe(false);
    expect((await request('/api/private/books', 'logout-probe')).status).toBe(200);
  } finally {
    await db.owner.query('GRANT DELETE ON auth.session TO library_app_runtime');
  }
  const success = await logout();
  expect(success.status).toBe(200);
  expect(success.headers.get('set-cookie')).toContain('Max-Age=0');
  expect((await request('/api/private/books', 'logout-probe')).status).toBe(401);
});
it('sanitizes database failures without returning connection or library details', async () => {
  const broken = {
    async query() {
      throw new Error('postgresql://private-password@private-host private title');
    },
  };
  const response = await privateLibraryResponse(
    new Request(origin + '/api/private/books', {
      headers: { cookie: await signedCookie('token-a') },
    }),
    auth,
    broken,
  );
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: 'Library temporarily unavailable' });
});
