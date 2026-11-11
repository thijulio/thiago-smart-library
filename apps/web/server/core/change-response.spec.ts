import { describe, expect, it } from 'vitest';
import { changeResponse } from './change-response';
import { createLibraryService } from './library-service';
const origin = 'https://library.example.test';
const id = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
const proposal = {
  id,
  digest: 'a'.repeat(64),
  change: {
    type: 'create',
    title: 'Synthetic',
    authors: ['Synthetic author'],
    platform: 'Kindle',
    status: 'wishlist',
  },
  before: null,
  expiresAt: '2026-11-11T16:00:00.000Z',
  state: 'pending',
  receipt: null,
};
const receipt = {
  proposalId: id,
  stableId: 'synthetic-new',
  version: '1',
  feedbackVersion: null,
  appliedAt: '2026-11-11T15:00:00.000Z',
  changed: true,
};
function setup(
  user: { id: string; emailVerified: boolean } | null = { id: 'user-a', emailVerified: true },
) {
  const calls: { sql: string; values: unknown[] }[] = [];
  const service = createLibraryService({
    async query(sql, values) {
      calls.push({ sql, values });
      return { rows: [{ result: sql.includes('confirm_and_commit') ? receipt : proposal }] };
    },
  });
  const auth = {
    api: {
      async getSession() {
        return user ? { user } : null;
      },
    },
  };
  return { calls, auth, service };
}
function post(path: string, body: unknown, requestOrigin = origin) {
  return new Request(origin + path, {
    method: 'POST',
    headers: {
      cookie: 'synthetic-session',
      origin: requestOrigin,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}
describe('browser change HTTP boundary', () => {
  it('uses persisted user identity and requires a separate approval action', async () => {
    const s = setup();
    const preview = await changeResponse(
      post('/api/private/changes', { requestId, change: proposal.change }),
      s.auth,
      s.service,
      origin,
    );
    expect(preview.status).toBe(200);
    expect(await preview.json()).toEqual({ proposal });
    expect(s.calls[0]!.values[0]).toBe('user-a');
    const commit = await changeResponse(
      post(`/api/private/changes/${id}/confirm`, { requestId, digest: proposal.digest }),
      s.auth,
      s.service,
      origin,
    );
    expect(commit.status).toBe(200);
    expect(await commit.json()).toEqual({ receipt });
    expect(s.calls[1]!.sql).toContain('confirm_and_commit');
    expect(commit.headers.get('cache-control')).toContain('no-store');
  });
  it('rejects cookie-less bearer requests, expired users and unverified accounts', async () => {
    for (const user of [null, { id: 'unverified', emailVerified: false }]) {
      const s = setup(user);
      const r = await changeResponse(
        post('/api/private/changes', { requestId, change: proposal.change }),
        s.auth,
        s.service,
        origin,
      );
      expect([401, 403]).toContain(r.status);
      expect(s.calls).toEqual([]);
    }
    const s = setup();
    const r = await changeResponse(
      new Request(origin + `/api/private/changes/${id}/confirm`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer synthetic-token',
          origin,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ requestId, digest: proposal.digest }),
      }),
      s.auth,
      s.service,
      origin,
    );
    expect(r.status).toBe(401);
    expect(s.calls).toEqual([]);
  });
  it('rejects forged ownership, invalid origin and oversized payloads without storage', async () => {
    const s = setup();
    expect(
      (
        await changeResponse(
          post('/api/private/changes', { requestId, change: proposal.change, actor: 'user-b' }),
          s.auth,
          s.service,
          origin,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await changeResponse(
          post(
            '/api/private/changes',
            { requestId, change: proposal.change },
            'https://foreign.example.test',
          ),
          s.auth,
          s.service,
          origin,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await changeResponse(
          post('/api/private/changes', {
            requestId,
            change: { ...proposal.change, notes: 'x'.repeat(33000) },
          }),
          s.auth,
          s.service,
          origin,
        )
      ).status,
    ).toBe(413);
    expect(s.calls).toEqual([]);
  });
  it('rejects unsupported routes and methods and returns private proposal reads', async () => {
    const s = setup();
    const r = await changeResponse(
      new Request(origin + `/api/private/changes/${id}`, {
        headers: { cookie: 'synthetic-session' },
      }),
      s.auth,
      s.service,
      origin,
    );
    expect(await r.json()).toEqual({ proposal });
    expect(
      (await changeResponse(post(`/api/private/changes/${id}`, {}), s.auth, s.service, origin))
        .status,
    ).toBe(405);
    expect(
      (
        await changeResponse(
          post('/api/private/changes/unknown/confirm', {}),
          s.auth,
          s.service,
          origin,
        )
      ).status,
    ).toBe(404);
  });
});
