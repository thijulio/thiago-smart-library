import { expect, it } from 'vitest';
import { publicationAllowed } from './publication';
const good = {
  event: 'push',
  ref: 'refs/heads/main',
  enabled: 'true',
  source: 'a'.repeat(40),
  current: 'a'.repeat(40),
};
it('only allows an enabled current main artifact on push or manual recovery', () => {
  expect(publicationAllowed(good)).toBe(true);
  expect(publicationAllowed({ ...good, event: 'workflow_dispatch' })).toBe(true);
  for (const mutation of [
    { event: 'pull_request' },
    { ref: 'refs/heads/topic' },
    { enabled: '' },
    { enabled: 'false' },
    { current: 'b'.repeat(40) },
    { source: 'not-a-commit' },
  ])
    expect(publicationAllowed({ ...good, ...mutation })).toBe(false);
});
