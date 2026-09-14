import { describe, expect, it } from 'vitest';
import { health } from './functions/health';

describe('health function', () => {
  it('returns public status JSON for GET', async () => {
    const response = await health(new Request('https://example.test/api/health'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'ok' });
  });

  it('returns 405 for unsupported methods', async () => {
    const response = await health(
      new Request('https://example.test/api/health', { method: 'POST' }),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
  });
});
