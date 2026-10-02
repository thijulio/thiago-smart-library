import { it, expect } from 'vitest';
import { validateHttpUrl } from './owner';
it.each([
  'javascript:alert(1)',
  'data:text/plain,example',
  'https://',
  'https://user:pass@example.test',
  'https://exa mple.test',
])('rejects malformed or credential URLs before SQL: %s', (url) =>
  expect(() => validateHttpUrl(url)).toThrow('INVALID_URL'),
);
it('accepts an HTTP(S) URL without fetching', () =>
  expect(validateHttpUrl('https://example.test/cover.png')).toBe('https://example.test/cover.png'));
