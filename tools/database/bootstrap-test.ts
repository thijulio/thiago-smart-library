import { validateLocalTarget } from '../../libs/database/src/target';
import { localPool } from '../../libs/database/src/connection';
import { initializeTestAdmin } from '../../libs/database/src/environment';
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log(
      'Usage: bootstrap-test --target local-test --purpose synthetic-test; explicit DB_TEST_ADMIN_URL required',
    );
    return;
  }
  if (args.join(' ') !== '--target local-test --purpose synthetic-test')
    throw new Error('INVALID_ARGUMENTS');
  const target = validateLocalTarget(process.env.DB_TEST_ADMIN_URL, process.env);
  if (target.database !== 'smart_library_test_admin') throw new Error('UNSAFE_DATABASE_TARGET');
  const pool = localPool(target.url);
  try {
    await initializeTestAdmin(pool);
    console.log('SYNTHETIC_ADMIN_MARKED');
  } finally {
    await pool.end();
  }
}
main().catch(() => {
  console.error('DATABASE_BOOTSTRAP_FAILED');
  process.exitCode = 1;
});
