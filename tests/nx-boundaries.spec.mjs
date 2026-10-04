import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import test from 'node:test';
test('Nx rejects a temporary web-to-api import', () => {
  const fixture = 'apps/web/src/__boundary_fixture__.ts';
  writeFileSync(fixture, "import '../../../api/src/functions/health';\n");
  try {
    let error;
    try {
      execFileSync('node', ['node_modules/eslint/bin/eslint.js', fixture], { encoding: 'utf8' });
    } catch (caught) {
      error = caught;
    }
    assert.equal(error?.status, 1);
    assert.match(`${error?.stdout ?? ''}${error?.stderr ?? ''}`, /@nx\/enforce-module-boundaries/);
  } finally {
    rmSync(fixture, { force: true });
  }
});
