import { afterEach, expect, it } from 'vitest';
import { withReferenceDatabase } from './provision';

const beforeUrl = process.env.DATABASE_URL;
const beforeAdmin = process.env.DB_TEST_ADMIN_URL;
afterEach(() => {
  if (beforeUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = beforeUrl;
  if (beforeAdmin === undefined) delete process.env.DB_TEST_ADMIN_URL;
  else process.env.DB_TEST_ADMIN_URL = beforeAdmin;
});
it('rejects inherited runtime credentials before allocation', async () => {
  process.env.DATABASE_URL = 'postgresql://synthetic@blocked.example/blocked';
  await expect(withReferenceDatabase(async () => {})).rejects.toThrow('INHERITED_DATABASE_URL');
});
it('rejects a hosted admin URL before opening a connection', async () => {
  delete process.env.DATABASE_URL;
  process.env.DB_TEST_ADMIN_URL = 'postgresql://synthetic@blocked.neon.tech/blocked';
  await expect(withReferenceDatabase(async () => {})).rejects.toThrow('UNSAFE_DATABASE_TARGET');
});
