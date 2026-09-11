import { describe, expect, it } from 'vitest';
import { isHealthResponse } from './health';

describe('isHealthResponse', () => {
  it('accepts the public health contract', () =>
    expect(isHealthResponse({ status: 'ok' })).toBe(true));
  it('rejects malformed health payloads', () =>
    expect(isHealthResponse({ status: 'down' })).toBe(false));
});
