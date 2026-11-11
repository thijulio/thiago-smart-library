import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { mcpResponse } from './mcp';
import { LibraryServiceError, type LibraryService } from './library-service';

const origin = 'https://library.example';
const requestId = 'fce29940-34bf-4823-9527-9eae29fdfc37';
function fixture(scopes = ['library:read', 'library:write']) {
  const calls: unknown[][] = [];
  const service = Object.fromEntries(
    ['searchBooks', 'getBook', 'listReading', 'prepare', 'getProposal', 'commit'].map((name) => [
      name,
      async (...args: unknown[]) => {
        calls.push([name, ...args]);
        return name === 'prepare' ? { id: requestId, digest: 'a'.repeat(64) } : { result: name };
      },
    ]),
  ) as unknown as LibraryService;
  const fetcher: typeof fetch = async (input, init) =>
    mcpResponse(new Request(input as string, init), {
      origin,
      service,
      resolvePrincipal: async () => ({ userId: 'verified-user', clientId: 'client', scopes }),
    });
  const client = new Client({ name: 'synthetic', version: '1' });
  return {
    calls,
    service,
    client,
    connect: () =>
      client.connect(
        new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), { fetch: fetcher }),
      ),
  };
}

describe('stateless MCP', () => {
  it('initializes with the SDK and exposes exactly six tools without confirmation', async () => {
    const f = fixture();
    await f.connect();
    expect((await f.client.listTools()).tools.map((t) => t.name).sort()).toEqual([
      'commit_change',
      'get_book',
      'get_change',
      'list_reading',
      'prepare_change',
      'search_books',
    ]);
    await f.client.callTool({ name: 'search_books', arguments: { query: 'synthetic' } });
    expect(f.calls).toEqual([['searchBooks', 'verified-user', 'synthetic']]);
    await f.client.close();
  });
  it.each([['library:write'], ['library:read'], []])(
    'requires both scopes for proposals: %j',
    async (...scopeArgs) => {
      const f = fixture(scopeArgs.filter((value): value is string => typeof value === 'string'));
      await f.connect();
      expect(
        (await f.client.callTool({ name: 'get_change', arguments: { id: requestId } })).isError,
      ).toBe(true);
      expect(
        (
          await f.client.callTool({
            name: 'search_books',
            arguments: { query: '', actor: 'foreign' },
          })
        ).isError,
      ).toBe(true);
      expect(f.calls).toEqual([]);
      await f.client.close();
    },
  );
  it('rejects search queries beyond the service limit', async () => {
    const f = fixture();
    await f.connect();
    expect(
      (await f.client.callTool({ name: 'search_books', arguments: { query: 'x'.repeat(201) } }))
        .isError,
    ).toBe(true);
    expect(f.calls).toEqual([]);
    await f.client.close();
  });
  it('prepares a browser review and commits only through the confirmed service operation', async () => {
    const f = fixture();
    await f.connect();
    const change = {
      type: 'create',
      title: 'Synthetic',
      authors: ['Synthetic Author'],
      platform: 'Kindle',
      status: 'unread',
    };
    const prepared = await f.client.callTool({
      name: 'prepare_change',
      arguments: { requestId, change },
    });
    expect(JSON.stringify(prepared)).toContain(`${origin}/library/changes/${requestId}`);
    await f.client.callTool({
      name: 'commit_change',
      arguments: { requestId, id: requestId, digest: 'a'.repeat(64) },
    });
    expect(f.calls).toEqual([
      ['prepare', 'verified-user', requestId, change, 'mcp'],
      ['commit', 'verified-user', requestId, requestId, 'a'.repeat(64)],
    ]);
    const forbidden = await f.client.callTool({
      name: 'confirm_change',
      arguments: { id: requestId },
    });
    expect(forbidden.isError).toBe(true);
    await f.client.close();
  });
  it('rejects invalid changes and sanitizes service errors', async () => {
    const f = fixture();
    await f.connect();
    for (const change of [
      {
        type: 'create',
        title: 'Synthetic',
        authors: ['Same', 'same'],
        platform: 'Kindle',
        status: 'unread',
      },
      {
        type: 'create',
        title: 'Synthetic',
        authors: ['Author'],
        platform: 'Kindle',
        status: 'read',
        finishedDate: '2026-02-30',
      },
      {
        type: 'update',
        stableId: 'synthetic',
        expectedVersion: '1',
        expectedFeedbackVersion: null,
        patch: {},
      },
    ]) {
      expect(
        (await f.client.callTool({ name: 'prepare_change', arguments: { requestId, change } }))
          .isError,
      ).toBe(true);
    }
    expect(f.calls).toEqual([]);
    f.service.getBook = async () => {
      throw new Error('postgres://private:credential@host foreign-book');
    };
    const failed = await f.client.callTool({
      name: 'get_book',
      arguments: { stableId: 'synthetic' },
    });
    expect(failed.isError).toBe(true);
    expect(JSON.stringify(failed)).not.toMatch(/postgres|credential|foreign-book/);
    await f.client.close();
  });
  it('returns safe service codes for recoverable proposal failures', async () => {
    const f = fixture();
    f.service.commit = async () => {
      throw new LibraryServiceError('CONFIRMATION_REQUIRED', 409);
    };
    await f.connect();
    const result = await f.client.callTool({
      name: 'commit_change',
      arguments: { requestId, id: requestId, digest: 'a'.repeat(64) },
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain('CONFIRMATION_REQUIRED');
    expect(JSON.stringify(result)).toContain('409');
    await f.client.close();
  });
  it('bounds the complete request body before protocol parsing', async () => {
    const f = fixture();
    const response = await mcpResponse(
      new Request(`${origin}/mcp`, { method: 'POST', body: ' '.repeat(32769) }),
      {
        origin,
        service: f.service,
        resolvePrincipal: async () => ({
          userId: 'verified-user',
          clientId: 'client',
          scopes: ['library:read'],
        }),
      },
    );
    expect(response.status).toBe(413);
    expect(f.calls).toEqual([]);
  });
  it('rejects malformed transport JSON without revealing internals', async () => {
    const f = fixture();
    const response = await mcpResponse(
      new Request(`${origin}/mcp`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: '{',
      }),
      {
        origin,
        service: f.service,
        resolvePrincipal: async () => ({
          userId: 'verified-user',
          clientId: 'client',
          scopes: ['library:read'],
        }),
      },
    );
    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).not.toMatch(/stack|credential|postgres/);
  });
  it('challenges invalid credentials and blocks foreign origins with no-store', async () => {
    const f = fixture();
    const options = { origin, service: f.service, resolvePrincipal: async () => null };
    const unauthorized = await mcpResponse(new Request(`${origin}/mcp`), options);
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get('www-authenticate')).toContain(
      `${origin}/.well-known/oauth-protected-resource/mcp`,
    );
    expect(unauthorized.headers.get('cache-control')).toBe('no-store');
    const foreign = await mcpResponse(
      new Request(`${origin}/mcp`, { headers: { origin: 'https://foreign.example' } }),
      options,
    );
    expect(foreign.status).toBe(403);
  });
});
