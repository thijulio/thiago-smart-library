import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import test from 'node:test';
test('consumer policy is local and declares no write authority', () => {
  const policy = JSON.parse(readFileSync('.agent-toolbox/project.json', 'utf8'));
  assert.equal(policy.projectId, 'thiago-smart-library');
  assert.equal(policy.capabilities.write, false);
  assert.equal(policy.capabilities.publication, false);
});

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
  } finally {
    rmSync(fixture, { force: true });
  }
});
