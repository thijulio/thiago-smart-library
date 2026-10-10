import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import type { SchemaReference, SchemaObject } from './model';
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}
export function anchor(id: string): string {
  return 'object-' + createHash('sha256').update(id).digest('hex').slice(0, 24);
}
function objectCard(o: SchemaObject): string {
  const columns = o.columns?.length
    ? '<div class="table-scroll"><table><caption>Columns</caption><thead><tr><th scope="col">Name</th><th scope="col">Type</th><th scope="col">Nullable</th><th scope="col">Default / generation</th><th scope="col">Comment / privileges</th></tr></thead><tbody>' +
      o.columns
        .map(
          (c) =>
            '<tr><th scope="row">' +
            escapeHtml(c.name) +
            '</th><td>' +
            escapeHtml(c.type) +
            '</td><td>' +
            (c.nullable ? 'Yes' : 'No') +
            '</td><td>' +
            escapeHtml(c.default) +
            ' ' +
            escapeHtml(c.identity) +
            ' ' +
            escapeHtml(c.generated) +
            '</td><td>' +
            escapeHtml(c.comment) +
            ' ' +
            escapeHtml(c.privileges.join(', ')) +
            '</td></tr>',
        )
        .join('') +
      '</tbody></table></div>'
    : '';
  return (
    '<section class="object-card" id="' +
    anchor(o.id) +
    '" data-object-id="' +
    escapeHtml(o.id) +
    '"><h3>' +
    escapeHtml(o.schema + '.' + o.name) +
    '</h3><p class="eyebrow">' +
    escapeHtml(o.kind) +
    '</p>' +
    columns +
    (o.definition
      ? '<h4>Definition</h4><pre><code>' + escapeHtml(o.definition) + '</code></pre>'
      : '') +
    '<h4>Catalog details</h4><pre>' +
    escapeHtml(JSON.stringify(o.details, null, 2)) +
    '</pre><h4>Project permissions</h4><p>' +
    escapeHtml(o.privileges.join('; ') || 'No project-role grants recorded') +
    '</p></section>'
  );
}
function diagram(model: SchemaReference): string {
  const tables = model.objects.filter((o) => o.kind === 'table' || o.kind === 'partitioned table');
  const positions = new Map(
    tables.map((o) => [
      o.id,
      {
        x: model.schemas.indexOf(o.schema) * 250 + 12,
        y: tables.filter((t) => t.schema === o.schema).indexOf(o) * 68 + 55,
      },
    ]),
  );
  const height = Math.max(
    150,
    ...model.schemas.map((s) => tables.filter((o) => o.schema === s).length * 68 + 80),
  );
  const edges = model.relationships
    .map((r) => {
      const from = positions.get(r.from),
        to = positions.get(r.to);
      return from && to
        ? '<path data-relationship-id="' +
            escapeHtml(r.id) +
            '" d="M ' +
            (from.x + 110) +
            ' ' +
            (from.y + 42) +
            ' L ' +
            (to.x + 110) +
            ' ' +
            to.y +
            '" marker-end="url(#arrow)"><title>' +
            escapeHtml(r.fromColumns.join(', ') + ' → ' + r.toColumns.join(', ')) +
            '</title></path>'
        : '';
    })
    .join('');
  const nodes = tables
    .map((o) => {
      const p = positions.get(o.id)!;
      return (
        '<a href="#' +
        anchor(o.id) +
        '"><rect x="' +
        p.x +
        '" y="' +
        p.y +
        '" width="225" height="42" rx="8"/><text x="' +
        (p.x + 10) +
        '" y="' +
        (p.y + 26) +
        '">' +
        escapeHtml(o.name) +
        '</text></a>'
      );
    })
    .join('');
  const headings = model.schemas
    .map(
      (s, i) =>
        '<text class="schema-label" x="' + (i * 250 + 12) + '" y="28">' + escapeHtml(s) + '</text>',
    )
    .join('');
  return (
    '<div class="diagram-scroll"><svg role="img" aria-labelledby="diagram-title diagram-description" viewBox="0 0 ' +
    model.schemas.length * 250 +
    ' ' +
    height +
    '"><title id="diagram-title">Project table relationships</title><desc id="diagram-description">Foreign key relationships grouped by schema. A complete linked text table follows.</desc><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z"/></marker></defs>' +
    headings +
    edges +
    nodes +
    '</svg></div>'
  );
}
const css = `
body{margin:0;background:var(--surface-page);color:var(--text-strong);font-family:var(--font-ui,system-ui)}
header,main,footer{max-width:1440px;margin:auto;padding:var(--space-6,24px)}
h1,h2,h3{overflow-wrap:anywhere}a{color:var(--text-strong)}a:focus-visible,input:focus-visible{outline:3px solid var(--focus);outline-offset:4px}
.eyebrow{font-size:.85rem;text-transform:uppercase;letter-spacing:.1em}.muted{color:var(--text-muted)}
.layout{display:grid;grid-template-columns:260px minmax(0,1fr);gap:var(--space-6,24px)}
nav{align-self:start;position:sticky;top:16px;max-height:90vh;overflow:auto}nav ul{list-style:none;padding:0}nav li{padding:6px 0;overflow-wrap:anywhere}
.object-card{background:var(--surface-raised);border:1px solid var(--border);border-radius:12px;padding:var(--space-6,24px);margin:20px 0;scroll-margin-top:16px}
.table-scroll,.diagram-scroll{overflow:auto}table{border-collapse:collapse;width:100%}caption{text-align:left;font-weight:bold;margin-bottom:12px}th,td{text-align:left;vertical-align:top;border-bottom:1px solid var(--border);padding:10px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:.85rem}
input{width:100%;box-sizing:border-box;padding:12px;margin:10px 0;background:var(--surface-raised);color:var(--text-strong);border:1px solid var(--border);border-radius:8px}
svg{min-width:1100px;width:100%;height:auto}svg rect{fill:var(--surface-raised);stroke:var(--border)}svg text{fill:var(--text-strong);font-size:13px}svg path{stroke:var(--text-muted);stroke-width:1;fill:none}svg marker path{fill:var(--text-muted)}.schema-label{font-weight:bold}
.skip-link{position:absolute;left:-10000px}.skip-link:focus{left:12px;top:12px;background:var(--surface-raised);padding:12px}
[hidden]{display:none!important}@media(max-width:760px){.layout{display:block}nav{position:static;max-height:250px}header,main,footer{padding:16px}.object-card{padding:16px}}
`;
const js = `
const input=document.getElementById('object-search');
const cards=Array.from(document.querySelectorAll('[data-object-id]'));
input.addEventListener('input',()=>{
 const q=input.value.trim().toLowerCase(); let count=0;
 for(const card of cards){card.hidden=!card.textContent.toLowerCase().includes(q);if(!card.hidden)count++;}
 for(const link of document.querySelectorAll('[data-nav-id]')){const card=document.getElementById(link.hash.slice(1));link.parentElement.hidden=card.hidden;}
 document.getElementById('search-results').textContent=count+' objects shown';
});
`;
export async function renderReference(
  model: SchemaReference,
  schemaSql: string,
  roadmap: string,
): Promise<Record<string, string | Uint8Array>> {
  const biome = await readFile(
    createRequire(import.meta.url).resolve('@thijulio/biome-css/biome.css'),
  );
  const nav = model.objects
    .map(
      (o) =>
        '<li><a data-nav-id="' +
        escapeHtml(o.id) +
        '" href="#' +
        anchor(o.id) +
        '">' +
        escapeHtml(o.schema + '.' + o.name) +
        ' <small>' +
        escapeHtml(o.kind) +
        '</small></a></li>',
    )
    .join('');
  const relations = model.relationships
    .map(
      (r) =>
        '<tr><td><a href="#' +
        anchor(r.from) +
        '">' +
        escapeHtml(r.from) +
        '</a></td><td>' +
        escapeHtml(r.fromColumns.join(', ')) +
        '</td><td><a href="#' +
        anchor(r.to) +
        '">' +
        escapeHtml(r.to) +
        '</a></td><td>' +
        escapeHtml(r.toColumns.join(', ')) +
        '</td></tr>',
    )
    .join('');
  const migrations = model.migrations
    .map((m) => '<li>' + escapeHtml(m.name) + ' <code>' + escapeHtml(m.checksum) + '</code></li>')
    .join('');
  const html =
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src &#39;self&#39;; style-src &#39;self&#39; https://fonts.googleapis.com; font-src &#39;self&#39; https://fonts.gstatic.com; script-src &#39;self&#39;; object-src &#39;none&#39;"><title>Smart Library · Schema reference</title><link rel="stylesheet" href="./assets/biome.css"><link rel="stylesheet" href="./assets/reference.css"><script src="./assets/reference.js" defer></script></head><body><a class="skip-link" href="#reference">Skip to schema</a><header><p class="eyebrow">Smart Library · Database reference</p><h1>Your library, structurally.</h1><p>This is the repository schema at commit <code>' +
    escapeHtml(model.sourceCommit) +
    '</code>.</p><p class="muted">Generated from migrations on disposable PostgreSQL ' +
    escapeHtml(model.postgresVersion) +
    '. Production migration status is tracked separately. Structural metadata only.</p><a href="./schema.sql" download>Download schema-only SQL</a> · <a href="./schema.json" download>Download catalog manifest</a></header><main><h2>Relationships</h2>' +
    diagram(model) +
    '<div class="table-scroll"><table><caption>Foreign keys — linked text alternative</caption><thead><tr><th>From</th><th>Columns</th><th>To</th><th>Referenced columns</th></tr></thead><tbody>' +
    relations +
    '</tbody></table></div><h2 id="reference">Schema objects</h2><label for="object-search">Search schema objects and definitions</label><input id="object-search" type="search" placeholder="Try books, owner or auth"><p id="search-results" role="status">' +
    model.objects.length +
    ' objects shown</p><div class="layout"><nav aria-label="Schema objects"><ul>' +
    nav +
    '</ul></nav><div>' +
    model.objects.map(objectCard).join('') +
    '</div></div><section><h2>Migrations and checksums</h2><ol>' +
    migrations +
    '</ol></section><section><h2>Roadmap mapping · planned work</h2><p>This explanation distinguishes implemented storage from proposed extensions.</p><pre>' +
    escapeHtml(roadmap) +
    '</pre></section></main><footer>Built from the repository. No production database connection.</footer></body></html>';
  return {
    'index.html': html,
    'schema.sql': schemaSql,
    'schema.json': JSON.stringify(model, null, 2) + '\n',
    'assets/biome.css': biome,
    'assets/reference.css': css,
    'assets/reference.js': js,
  };
}
