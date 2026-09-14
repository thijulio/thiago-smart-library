import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchHealth } from './health-client';

describe('fetchHealth', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('returns a valid health response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'ok' }), { status: 200 })),
    );
    await expect(fetchHealth()).resolves.toEqual({ status: 'ok' });
  });
  it('rejects malformed responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'no' }), { status: 200 })),
    );
    await expect(fetchHealth()).rejects.toThrow('malformed');
  });
  it('passes an abort signal through', async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')));
    await expect(fetchHealth(controller.signal)).rejects.toThrow('Aborted');
  });
});
