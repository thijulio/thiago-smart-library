import type { SchemaReference } from './model';
import { escapeHtml } from './render';
const paths = [
  'index.html',
  'schema.sql',
  'schema.json',
  'assets/biome.css',
  'assets/reference.css',
  'assets/reference.js',
];
export function validateReference(
  model: SchemaReference,
  schemaSql: string,
  files: Record<string, string | Uint8Array>,
): void {
  const ids = new Set(model.objects.map((o) => o.id));
  if (
    !/^[a-f0-9]{40}$/.test(model.sourceCommit) ||
    ids.size !== model.objects.length ||
    model.relationships.some((r) => !ids.has(r.from) || !ids.has(r.to))
  )
    throw new Error('INVALID_SCHEMA_MODEL');
  if (
    Object.keys(files).length !== paths.length ||
    paths.some((p) => !(p in files)) ||
    Object.keys(files).some((p) => !paths.includes(p))
  )
    throw new Error('UNSAFE_SCHEMA_ARTIFACT');
  for (const data of Object.values(files)) {
    const value = typeof data === 'string' ? data : Buffer.from(data).toString('utf8');
    if (
      /postgres(?:ql)?:\/\/|[a-z0-9-]+\.neon\.tech|private_fixture_marker|Type: TABLE DATA|^COPY .+ FROM stdin;/im.test(
        value,
      )
    )
      throw new Error('UNSAFE_SCHEMA_CONTENT');
  }
  if (String(files['schema.sql']) !== schemaSql || !schemaSql.trim())
    throw new Error('INCOMPLETE_SCHEMA_REFERENCE');
  if (String(files['schema.json']) !== JSON.stringify(model, null, 2) + '\n')
    throw new Error('INCOMPLETE_SCHEMA_REFERENCE');
  const html = String(files['index.html']);
  if (
    model.objects.some((o) => !html.includes('data-object-id="' + escapeHtml(o.id) + '"')) ||
    model.relationships.some(
      (r) => !html.includes('data-relationship-id="' + escapeHtml(r.id) + '"'),
    ) ||
    !html.includes(model.sourceCommit)
  )
    throw new Error('INCOMPLETE_SCHEMA_REFERENCE');
}
