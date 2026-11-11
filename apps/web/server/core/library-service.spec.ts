import { describe, expect, it } from 'vitest';
import { createLibraryService, LibraryServiceError } from './library-service';

const id = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
const change = {
  type: 'create',
  title: 'Synthetic book',
  authors: ['Synthetic author'],
  platform: 'Kindle',
  status: 'wishlist',
} as const;
const proposal = {
  id,
  digest: 'a'.repeat(64),
  change: { ...change, authors: [...change.authors] },
  before: null,
  expiresAt: '2026-11-11T16:00:00.000Z',
  state: 'pending',
  receipt: null,
};
const receipt = {
  proposalId: id,
  stableId: 'new-book',
  version: '1',
  feedbackVersion: null,
  appliedAt: '2026-11-11T15:00:00.000Z',
  changed: true,
};

describe('shared library service', () => {
  it('binds proposals to the supplied trusted actor and validates stored projections', async () => {
    const calls: { sql: string; values: unknown[] }[] = [];
    const service = createLibraryService({
      async query(sql, values) {
        calls.push({ sql, values });
        return { rows: [{ result: proposal }] };
      },
    });
    expect(await service.prepare('verified-user', requestId, proposal.change, 'mcp')).toEqual(
      proposal,
    );
    expect(calls).toEqual([
      {
        sql: 'SELECT library.prepare_book_change($1,$2,$3::jsonb,$4) AS result',
        values: ['verified-user', requestId, JSON.stringify(proposal.change), 'mcp'],
      },
    ]);
  });
  it('rejects forged fields and malformed request identities before storage', async () => {
    let called = false;
    const service = createLibraryService({
      async query() {
        called = true;
        return { rows: [] };
      },
    });
    await expect(
      service.prepare(
        'verified-user',
        requestId,
        { ...proposal.change, actor: 'other-user' } as never,
        'mcp',
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.prepare('verified-user', 'not-a-uuid', proposal.change, 'mcp'),
    ).rejects.toMatchObject({ status: 400 });
    expect(called).toBe(false);
  });
  it('separates browser approval from confirmed MCP commit', async () => {
    const calls: string[] = [];
    const service = createLibraryService({
      async query(sql) {
        calls.push(sql);
        return { rows: [{ result: receipt }] };
      },
    });
    expect(await service.commit('verified-user', requestId, id, proposal.digest)).toEqual(receipt);
    expect(await service.confirmAndCommit('verified-user', requestId, id, proposal.digest)).toEqual(
      receipt,
    );
    expect(calls).toEqual([
      'SELECT library.commit_book_change($1,$2,$3,$4) AS result',
      'SELECT library.confirm_and_commit_book_change($1,$2,$3,$4) AS result',
    ]);
  });
  it('sanitizes unknown database errors and fails closed on invalid stored data', async () => {
    const failed = createLibraryService({
      async query() {
        throw new Error('postgresql://private-credential@host/database');
      },
    });
    try {
      await failed.getProposal('verified-user', id);
      throw Error('expected failure');
    } catch (error) {
      expect(error).toBeInstanceOf(LibraryServiceError);
      expect(String(error)).not.toContain('private-credential');
      expect(error).toMatchObject({ status: 503 });
    }
    const malformed = createLibraryService({
      async query() {
        return { rows: [{ result: { ...proposal, digest: 'invalid' } }] };
      },
    });
    await expect(malformed.getProposal('verified-user', id)).rejects.toMatchObject({ status: 503 });
  });
  it('maps expected conflicts without leaking database detail', async () => {
    const service = createLibraryService({
      async query() {
        throw new Error('VERSION_CONFLICT');
      },
    });
    await expect(
      service.commit('verified-user', requestId, id, proposal.digest),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT', status: 409 });
  });
});
