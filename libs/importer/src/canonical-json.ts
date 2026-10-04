import { createHash } from 'node:crypto';
import type { Json } from './contracts';
export function canonicalJson(value: Json): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('INVALID_JSON');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype)
    throw new Error('INVALID_JSON');
  return (
    '{' +
    Object.keys(value)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + canonicalJson(value[k]))
      .join(',') +
    '}'
  );
}
export function sha256Utf8(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
export function sha256Bytes(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}
