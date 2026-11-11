import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { makeSignature } from 'better-auth/crypto';
import { createTestDatabase } from './harness';
import { createProductAuth } from '../../../apps/web/server/core/auth';
import { createLibraryService } from '../../../apps/web/server/core/library-service';
import { changeResponse } from '../../../apps/web/server/core/change-response';
let db: Awaited<ReturnType<typeof createTestDatabase>>;
const origin = 'https://library.example.test';
const secret = 'synthetic-shared-api-secret-with-thirty-two-characters';
let auth: ReturnType<typeof createProductAuth>;
let cookie: string;
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
    `INSERT INTO auth."user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES('api-user','Synthetic','api@example.test',true,now(),now())`,
  );
  await db.owner.query(
    `INSERT INTO auth.session(id,token,"userId","expiresAt","createdAt","updatedAt") VALUES('api-session','api-session','api-user',now()+interval '1 hour',now(),now())`,
  );
  await db.owner.query(
    `WITH lib AS (INSERT INTO library.user_libraries(owner_user_id) VALUES('api-user') RETURNING id) INSERT INTO library.native_write_permissions(library_id,enabled,approved_by,approved_at) SELECT id,true,'synthetic-offline',now() FROM lib`,
  );
  cookie =
    '__Secure-better-auth.session_token=' +
    encodeURIComponent('api-session.' + (await makeSignature('api-session', secret)));
});
afterAll(async () => {
  await db?.dispose();
});
function request(path: string, body?: unknown) {
  return new Request(origin + '/api/private/' + path, {
    method: body ? 'POST' : 'GET',
    headers: { cookie, origin, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
it('persists the exact browser-approved MCP proposal once, then verifies through the shared API', async () => {
  const service = createLibraryService(db.appRuntime);
  const change = {
    type: 'create',
    title: 'Synthetic API capture',
    authors: ['Synthetic author'],
    platform: 'Kindle',
    status: 'wishlist',
  } as const;
  const proposal = await service.prepare(
    'api-user',
    randomUUID(),
    { ...change, authors: [...change.authors] },
    'mcp',
  );
  await expect(
    service.commit('api-user', randomUUID(), proposal.id, proposal.digest),
  ).rejects.toMatchObject({ code: 'CONFIRMATION_REQUIRED' });
  const read = await changeResponse(request('changes/' + proposal.id), auth, service, origin);
  expect(read.status).toBe(200);
  expect((await read.json()).proposal).toEqual(proposal);
  const requestId = randomUUID();
  const approved = await changeResponse(
    request('changes/' + proposal.id + '/confirm', { requestId, digest: proposal.digest }),
    auth,
    service,
    origin,
  );
  expect(approved.status).toBe(200);
  const { receipt } = await approved.json();
  expect(receipt.changed).toBe(true);
  expect(await service.commit('api-user', randomUUID(), proposal.id, proposal.digest)).toEqual(
    receipt,
  );
  expect(await service.getBook('api-user', receipt.stableId)).toMatchObject({
    version: receipt.version,
    feedbackVersion: receipt.feedbackVersion,
    native: true,
    writable: true,
  });
  const editable = await changeResponse(
    request('editable-books/' + receipt.stableId),
    auth,
    service,
    origin,
  );
  expect((await editable.json()).book).toMatchObject({
    title: change.title,
    native: true,
    writable: true,
    version: receipt.version,
  });
  expect(
    (
      await db.owner.query('SELECT count(*) FROM library.books WHERE stable_id=$1', [
        receipt.stableId,
      ])
    ).rows[0].count,
  ).toBe('1');
});
