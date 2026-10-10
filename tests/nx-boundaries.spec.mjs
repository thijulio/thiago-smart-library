import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import test from 'node:test';
test('browser imports cannot reach server-only modules or database libraries', () => {
  const fixture = 'apps/web/app/__boundary_fixture__.ts';
  writeFileSync(
    fixture,
    "import '../server/core/auth';\nimport '@smart-library/database';\nimport '@neondatabase/serverless';\n",
  );
  try {
    let error;
    try {
      execFileSync('node', ['node_modules/eslint/bin/eslint.js', fixture], { encoding: 'utf8' });
    } catch (caught) {
      error = caught;
    }
    assert.equal(error?.status, 1);
    assert.match(`${error?.stdout ?? ''}${error?.stderr ?? ''}`, /no-restricted-imports/);
    assert.match(`${error?.stdout ?? ''}${error?.stderr ?? ''}`, /@nx\/enforce-module-boundaries/);
  } finally {
    rmSync(fixture, { force: true });
  }
});
