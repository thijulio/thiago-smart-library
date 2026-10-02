import { expect, it } from 'vitest';
import { migrationFiles } from './migrate';
it('rejects invalid names, duplicate prefixes and gaps', () => {
  expect(() => migrationFiles(['0001_a.sql', '0001_b.sql'])).toThrow('INVALID_MIGRATION_DIRECTORY');
  expect(() => migrationFiles(['0001_a.sql', '0003_c.sql'])).toThrow('INVALID_MIGRATION_DIRECTORY');
  expect(() => migrationFiles(['anything.sql'])).toThrow('INVALID_MIGRATION_DIRECTORY');
  expect(migrationFiles(['0002_b.sql', '0001_a.sql'])).toEqual(['0001_a.sql', '0002_b.sql']);
});
