import { expect, it } from 'vitest';
import { hostedPool } from './connection';
it('hosted pools always request channel binding and keep it out of the URL', async () => {
  const pool = hostedPool(
    'postgresql://owner:secret@ep-x.eu-central-1.aws.neon.tech/smart_library?sslmode=verify-full&channel_binding=require',
  );
  const options = pool.options as typeof pool.options & { enableChannelBinding?: boolean };
  expect(options.enableChannelBinding).toBe(true);
  expect(options.connectionString).toBe(
    'postgresql://owner:secret@ep-x.eu-central-1.aws.neon.tech/smart_library?sslmode=verify-full',
  );
  await pool.end();
});
