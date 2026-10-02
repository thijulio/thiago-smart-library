import { readFile } from 'node:fs/promises';
import { requirePrivate } from './private-files';
export interface Resolution {
  sourceSha256: string;
  entityKey: string;
  field: string;
  expectedHash: string;
  expectedVersion: string;
  hashVersion: 'pg-jsonb-text-v1';
  reviewer: string;
  reviewedAt: string;
  action: 'use_source' | 'keep_database' | 'clear';
}
export const GROUP_FIELDS = [
  'title',
  'platform',
  'status',
  'cover_url',
  'word_count',
  'next_rank',
  'next_slot',
  'why_next',
  'added_at',
  'completion',
  'community',
  'series',
  'authors',
  'genres',
  'rating',
  'opinion',
  'opinion_raw',
  'notes',
  'pros',
  'cons',
  'personal_relevance',
  'relevance_reason',
  'relevance_updated',
] as const;
export async function readResolutions(path?: string): Promise<Resolution[]> {
  if (!path) return [];
  await requirePrivate(path);
  const m = JSON.parse(await readFile(path, 'utf8'));
  if (
    Object.keys(m).sort().join('|') !== 'entries|version' ||
    m.version !== 1 ||
    !Array.isArray(m.entries)
  )
    throw new Error('INVALID_RESOLUTION');
  const keys = [
    'sourceSha256',
    'entityKey',
    'field',
    'expectedHash',
    'expectedVersion',
    'hashVersion',
    'reviewer',
    'reviewedAt',
    'action',
  ]
    .sort()
    .join('|');
  const seen = new Set<string>();
  for (const e of m.entries) {
    if (
      !e ||
      Object.keys(e).sort().join('|') !== keys ||
      typeof e.entityKey !== 'string' ||
      !e.entityKey.trim() ||
      !GROUP_FIELDS.includes(e.field) ||
      !['use_source', 'keep_database', 'clear'].includes(e.action) ||
      !/^\d+$/.test(e.expectedVersion) ||
      e.hashVersion !== 'pg-jsonb-text-v1' ||
      !/^\d{4}-\d\d-\d\dT.*Z$/.test(e.reviewedAt) ||
      !Number.isFinite(Date.parse(e.reviewedAt)) ||
      typeof e.reviewer !== 'string' ||
      !e.reviewer.trim() ||
      !/^[a-f0-9]{64}$/.test(e.sourceSha256) ||
      !/^[a-f0-9]{64}$/.test(e.expectedHash) ||
      seen.has(e.entityKey + '::' + e.field)
    )
      throw new Error('INVALID_RESOLUTION');
    if (e.action === 'clear' && ['title', 'platform', 'status', 'authors'].includes(e.field))
      throw new Error('FORBIDDEN_CLEAR');
    seen.add(e.entityKey + '::' + e.field);
  }
  return m.entries;
}
