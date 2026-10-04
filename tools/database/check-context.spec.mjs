import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  symlinkSync,
  chmodSync,
  readdirSync,
  readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('./check-context.mjs', import.meta.url));
const required = [
  'docs/database/README.md',
  'docs/database/spec.md',
  'docs/database/status.md',
  'docs/database/context-map.md',
  'docs/database/golden-path-alignment.md',
  'docs/database/reference/prototype-contracts.md',
  ...[
    'README',
    'execution-contracts',
    '00-context',
    '01-schema',
    '02-import',
    '03-enrichment',
    '04-events-rankings',
    '05-application-cutover',
    'handoff-and-acceptance',
  ].map((name) => `docs/database/plans/${name}.md`),
];
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'sl-context-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (path, value) => {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, value);
  };
  for (const path of required) put(path, '# Context\n');
  for (const path of ['AGENTS.md', 'README.md']) {
    put(path, '[Database](docs/database/README.md)\n[Status](docs/database/status.md)\n');
  }
  put(
    'docs/database/README.md',
    '[Spec](spec.md)\n[Pack](plans/README.md)\n[Rules](plans/execution-contracts.md)\n[Status](status.md)\n',
  );
  const run = () => spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
  return { root, put, run };
}

test('valid package exits zero and reports checked local links', (t) => {
  const { run } = fixture(t);
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Checked 8 local links/);
});
test('missing required index fails with a relative location', (t) => {
  const { root, run } = fixture(t);
  rmSync(join(root, 'docs/database/README.md'));
  const result = run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /docs\/database\/README.md:1: missing required file/);
});
test('broken relative file link reports source line', (t) => {
  const { put, run } = fixture(t);
  put('docs/database/spec.md', '# Contract\n\n[Missing](absent.md)\n');
  const result = run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /docs\/database\/spec.md:3: missing link target absent.md/);
});
test('valid Markdown heading anchors include formatting and duplicate suffixes', (t) => {
  const { put, run } = fixture(t);
  put(
    'docs/database/spec.md',
    '# A `contract`!\n# A `contract`!\n[First](#a-contract)\n[Second](#a-contract-1)\n',
  );
  assert.equal(run().status, 0);
});
test('nonexistent anchor fails at its link line', (t) => {
  const { put, run } = fixture(t);
  put('docs/database/spec.md', '# Contract\n[Missing](#absent)\n');
  const result = run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /spec.md:2: missing anchor #absent/);
});
test('HTTPS links are ignored without requiring network access', (t) => {
  const { put, run } = fixture(t);
  put('docs/database/spec.md', '[Remote](https://does-not-exist.invalid/a#missing)\n');
  const result = run();
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Checked 8 local links/);
});
test('fenced and indented code pseudo-links are ignored', (t) => {
  const { put, run } = fixture(t);
  put('docs/database/spec.md', '~~~md\n[Bad](missing.md)\n~~~\n\n    [Bad](missing.md)\n');
  assert.equal(run().status, 0);
});
test('inline code pseudo-links are ignored', (t) => {
  const { put, run } = fixture(t);
  put('docs/database/spec.md', '`[Bad](missing.md)`\n');
  assert.equal(run().status, 0);
});
test('reference-style links are checked at use location', (t) => {
  const { put, run } = fixture(t);
  put('docs/database/spec.md', '[Bad][target]\n\n[target]: absent.md\n');
  const result = run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /spec.md:1: missing link target absent.md/);
});
test('required execution links cannot escape the repository', (t) => {
  const { put, run } = fixture(t);
  put('docs/database/spec.md', '[Private](../../../outside.md)\n');
  const result = run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /link escapes repository/);
});
test('encoded traversal cannot escape the repository', (t) => {
  const { put, run } = fixture(t);
  put('docs/database/spec.md', '[Private](%2E%2E/%2E%2E/%2E%2E/outside.md)\n');
  assert.match(run().stderr, /link escapes repository/);
});
test('symlink target outside repository is rejected before reading it', (t) => {
  const { root, put, run } = fixture(t);
  symlinkSync(tmpdir(), join(root, 'docs/database/external'));
  put('docs/database/spec.md', '[External](external)\n');
  const result = run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /symlink escapes repository/);
});
test('missing required entrypoint routing fails even with documents present', (t) => {
  const { put, run } = fixture(t);
  put('AGENTS.md', '# Guidance\n');
  const result = run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /AGENTS.md:1: missing routing to docs\/database\/README.md/);
});
test('specification must be reachable in at most two links', (t) => {
  const { put, run } = fixture(t);
  put(
    'docs/database/README.md',
    '[Hop](hop.md)\n[Status](status.md)\n[Pack](plans/README.md)\n[Rules](plans/execution-contracts.md)\n',
  );
  put('docs/database/hop.md', '[Spec](spec.md)\n');
  assert.match(run().stderr, /spec.md is not reachable within two links/);
});
test('URL-encoded filename and Unicode heading anchors resolve', (t) => {
  const { put, run } = fixture(t);
  put('docs/database/a file.md', '# Café\n');
  put('docs/database/spec.md', '[Unicode](a%20file.md#caf%C3%A9)\n');
  assert.equal(run().status, 0);
});
test('HTML comments do not create Markdown links', (t) => {
  const { put, run } = fixture(t);
  put('docs/database/spec.md', '<!-- [Bad](missing.md) -->\n');
  assert.equal(run().status, 0);
});
test('checker is bounded to repository routing and database documents', (t) => {
  const { put, run } = fixture(t);
  put('unrelated/private.md', '[Bad](missing.md)\n');
  assert.equal(run().status, 0);
});
test('checker does not write repository files', (t) => {
  const { root, run } = fixture(t);
  const snapshot = (path) =>
    readdirSync(path, { withFileTypes: true }).map((entry) => [
      entry.name,
      entry.isDirectory()
        ? snapshot(join(path, entry.name))
        : readFileSync(join(path, entry.name), 'utf8'),
    ]);
  const before = snapshot(root);
  const result = run();
  assert.equal(result.status, 0);
  assert.deepEqual(snapshot(root), before);
});

test('unreadable specification fails closed with a relative diagnostic', (t) => {
  const { root, run } = fixture(t);
  const path = join(root, 'docs/database/spec.md');
  chmodSync(path, 0);
  const result = run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /docs\/database\/spec.md:1: unable to read Markdown input/);
});

test('exported checker can be imported without a CLI argv path', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `const {checkContext} = await import(${JSON.stringify(pathToFileURL(script).href)}); if(typeof checkContext !== 'function') process.exit(1);`,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
});
