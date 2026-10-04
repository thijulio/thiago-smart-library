import { inflateRawSync } from 'node:zlib';
/** Bounded in-memory ZIP inventory. Never materialize archive paths on disk. */
export function archiveEntries(bytes: Buffer): Map<string, Buffer> {
  let end = -1;
  for (let n = bytes.length - 22; n >= Math.max(0, bytes.length - 65557); n--)
    if (bytes.readUInt32LE(n) === 0x06054b50) {
      end = n;
      break;
    }
  if (end < 0) throw new Error('INVALID_XLSX_ARCHIVE');
  const count = bytes.readUInt16LE(end + 10),
    offset = bytes.readUInt32LE(end + 16);
  if (count > 10000 || count === 65535 || offset === 0xffffffff) throw new Error('ARCHIVE_LIMIT');
  const entries = new Map<string, Buffer>();
  let at = offset,
    total = 0;
  for (let n = 0; n < count; n++) {
    if (at + 46 > bytes.length || bytes.readUInt32LE(at) !== 0x02014b50)
      throw new Error('INVALID_XLSX_ARCHIVE');
    const method = bytes.readUInt16LE(at + 10),
      compressed = bytes.readUInt32LE(at + 20),
      size = bytes.readUInt32LE(at + 24),
      nameLength = bytes.readUInt16LE(at + 28),
      extraLength = bytes.readUInt16LE(at + 30),
      commentLength = bytes.readUInt16LE(at + 32),
      local = bytes.readUInt32LE(at + 42);
    const name = bytes.subarray(at + 46, at + 46 + nameLength).toString('utf8');
    total += size;
    if (
      total > 128 * 1024 * 1024 ||
      size > 64 * 1024 * 1024 ||
      name.split('/').includes('..') ||
      name.startsWith('/') ||
      entries.has(name) ||
      ![0, 8].includes(method) ||
      local + 30 > bytes.length ||
      bytes.readUInt32LE(local) !== 0x04034b50
    )
      throw new Error('ARCHIVE_LIMIT');
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    if (start + compressed > bytes.length) throw new Error('INVALID_XLSX_ARCHIVE');
    const data =
      method === 0
        ? bytes.subarray(start, start + compressed)
        : inflateRawSync(bytes.subarray(start, start + compressed), {
            maxOutputLength: Math.max(size, 1),
          });
    if (data.length !== size) throw new Error('INVALID_XLSX_ARCHIVE');
    entries.set(name, data);
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}
/** XML numeric lexical values are retained evidence, never used as executable expressions. */
export function rawDateSerials(entries: Map<string, Buffer>, sheetId: number): Map<string, string> {
  const xml = entries.get(`xl/worksheets/sheet${sheetId}.xml`)?.toString('utf8') ?? '';
  const values = new Map<string, string>();
  for (const match of xml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
    const address = /\br="([A-Z]+[0-9]+)"/.exec(match[1])?.[1];
    const raw = /<v>([-+0-9.eE]+)<\/v>/.exec(match[2])?.[1];
    if (address && raw) values.set(address, raw);
  }
  return values;
}
