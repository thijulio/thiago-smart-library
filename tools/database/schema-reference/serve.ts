import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const files = new Map([
  ['', 'index.html'],
  ['index.html', 'index.html'],
  ['schema.sql', 'schema.sql'],
  ['schema.json', 'schema.json'],
  ['assets/biome.css', 'assets/biome.css'],
  ['assets/reference.css', 'assets/reference.css'],
  ['assets/reference.js', 'assets/reference.js'],
]);
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const prefix = '/thiago-smart-library/';
  const file = url.pathname.startsWith(prefix)
    ? files.get(url.pathname.slice(prefix.length))
    : undefined;
  if (!file) {
    res.writeHead(404);
    res.end();
    return;
  }
  try {
    const data = await readFile('dist/schema-reference/' + file);
    const type = file.endsWith('.css')
      ? 'text/css'
      : file.endsWith('.js')
        ? 'text/javascript'
        : file.endsWith('.json')
          ? 'application/json'
          : file.endsWith('.sql')
            ? 'text/plain'
            : 'text/html';
    res.writeHead(200, { 'Content-Type': type + '; charset=utf-8' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
server.listen(8891, '127.0.0.1');
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => server.close());
