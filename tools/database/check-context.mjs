import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parsers } from 'prettier/plugins/markdown';

const required = [
  'AGENTS.md',
  'README.md',
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

function within(root, target) {
  const path = relative(root, target);
  return !isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`);
}
function walk(node, visit) {
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}
function headingText(node) {
  return node.value ?? (node.children ?? []).map(headingText).join('');
}
function anchors(ast) {
  const result = new Set();
  walk(ast, (node) => {
    if (node.type !== 'heading') return;
    const base = headingText(node)
      .toLowerCase()
      .replace(/[\p{P}\p{S}]/gu, (character) =>
        character === '-' || character === '_' ? character : '',
      )
      .replace(/ /g, '-');
    let slug = base;
    for (let suffix = 1; result.has(slug); suffix++) slug = `${base}-${suffix}`;
    result.add(slug);
  });
  return result;
}

// Existing Prettier supplies the Markdown AST; no HTTP requests or new dependencies.
export async function checkContext(directory) {
  const root = await realpath(directory);
  const errors = [];
  const report = (file, line, message) => errors.push(`${file}:${line}: ${message}`);
  const files = new Set(['AGENTS.md', 'README.md']);
  async function collect(path) {
    const physical = await realpath(path);
    if (!within(root, physical)) {
      report(relative(root, path), 1, 'symlink escapes repository');
      return;
    }
    for (const entry of (await readdir(path, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name, 'en'),
    )) {
      const child = resolve(path, entry.name);
      if (entry.isDirectory()) await collect(child);
      else if (entry.isSymbolicLink()) {
        report(relative(root, child), 1, 'symlink is not a portable context input');
      } else if (entry.isFile() && entry.name.endsWith('.md')) files.add(relative(root, child));
    }
  }
  for (const file of required) {
    try {
      const target = resolve(root, file);
      if (!within(root, await realpath(target)) || !(await stat(target)).isFile()) {
        report(file, 1, 'required input is not a repository file');
      }
    } catch {
      report(file, 1, 'missing required file');
    }
  }
  try {
    await collect(resolve(root, 'docs/database'));
  } catch {
    report('docs/database', 1, 'missing context directory');
  }

  const documents = new Map();
  async function document(file) {
    if (documents.has(file)) return documents.get(file);
    const target = resolve(root, file);
    if (!within(root, await realpath(target))) throw new Error('symlink escapes repository');
    const ast = await parsers.markdown.parse(await readFile(target, 'utf8'));
    const doc = { ast, anchors: anchors(ast) };
    documents.set(file, doc);
    return doc;
  }
  const edges = new Map();
  let checkedLinks = 0;
  for (const file of [...files].sort()) {
    let doc;
    try {
      doc = await document(file);
    } catch {
      continue;
    } // Missing required files already have precise diagnostics.
    const definitions = new Map();
    walk(doc.ast, (node) => {
      if (node.type === 'definition') definitions.set(node.identifier.toLowerCase(), node);
    });
    const links = [];
    walk(doc.ast, (node) => {
      if (node.type === 'link' || node.type === 'image') links.push(node);
      if (node.type === 'linkReference' || node.type === 'imageReference') {
        const definition = definitions.get(node.identifier.toLowerCase());
        if (definition) links.push({ ...node, url: definition.url });
      }
    });
    edges.set(file, new Set());
    for (const link of links) {
      const line = link.position.start.line;
      const url = link.url;
      if (/^(https?:|mailto:)/i.test(url)) continue;
      checkedLinks++;
      try {
        const [encodedPath, ...fragmentParts] = url.split('#');
        const path = decodeURIComponent(encodedPath);
        const anchor = decodeURIComponent(fragmentParts.join('#'));
        const target = path ? resolve(dirname(resolve(root, file)), path) : resolve(root, file);
        if (isAbsolute(path) || /^[a-z][a-z\d+.-]*:/i.test(path) || !within(root, target)) {
          report(file, line, `link escapes repository: ${url}`);
          continue;
        }
        let physical;
        try {
          physical = await realpath(target);
        } catch {
          report(file, line, `missing link target ${url}`);
          continue;
        }
        if (!within(root, physical)) {
          report(file, line, `symlink escapes repository: ${url}`);
          continue;
        }
        const destination = relative(root, target);
        // Images cannot provide task routing.
        if (link.type === 'link' || link.type === 'linkReference') edges.get(file).add(destination);
        if (
          anchor &&
          (!destination.endsWith('.md') || !(await document(destination)).anchors.has(anchor))
        ) {
          report(file, line, `missing anchor #${anchor} in ${destination}`);
        }
      } catch {
        report(file, line, `invalid local link ${url}`);
      }
    }
  }
  for (const entry of ['AGENTS.md', 'README.md']) {
    for (const destination of ['docs/database/README.md', 'docs/database/status.md']) {
      if (!edges.get(entry)?.has(destination))
        report(entry, 1, `missing routing to ${destination}`);
    }
    const reachable = new Set(edges.get(entry));
    for (const destination of [...reachable]) {
      for (const next of edges.get(destination) ?? []) reachable.add(next);
    }
    for (const destination of [
      'docs/database/spec.md',
      'docs/database/plans/execution-contracts.md',
    ]) {
      if (!reachable.has(destination))
        report(entry, 1, `${destination} is not reachable within two links`);
    }
  }
  return { checkedLinks, errors };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { checkedLinks, errors } = await checkContext(process.cwd());
    if (errors.length) {
      for (const error of errors) process.stderr.write(`${error}\n`);
      process.exitCode = 1;
    } else
      process.stdout.write(`Checked ${checkedLinks} local links; database context is reachable.\n`);
  } catch {
    process.stderr.write('README.md:1: unable to read repository context\n');
    process.exitCode = 1;
  }
}
