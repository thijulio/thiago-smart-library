import { canonicalJson } from './canonical-json';
import type { CandidateField, Json } from './contracts';
export interface MergeResult {
  action: 'keep' | 'write' | 'adopt' | 'conflict';
  value?: Json;
}
export function mergeValue(
  baseline: Json | undefined,
  incoming: CandidateField,
  current: Json,
): MergeResult {
  if (incoming.kind !== 'value') return { action: 'keep' };
  const same = (a: Json, b: Json) => canonicalJson(a) === canonicalJson(b);
  const next = incoming.value;
  if (baseline === undefined) {
    if (same(current, next)) return { action: 'adopt' };
    const unset = current === null || (Array.isArray(current) && current.length === 0);
    return unset ? { action: 'write', value: next } : { action: 'conflict' };
  }
  if (same(next, baseline)) return { action: 'keep' };
  if (same(next, current)) return { action: 'adopt' };
  return same(current, baseline) ? { action: 'write', value: next } : { action: 'conflict' };
}
