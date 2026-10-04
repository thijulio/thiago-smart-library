export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type ImportScope = 'core' | 'enrichment' | 'events';
export interface CellEvidence {
  column: number;
  header: string;
  address: string;
  type: string;
  value: Json;
  formula: string | null;
  cachedValue: Json;
  numberFormat: string | null;
}
export interface SourceRow {
  sheet: string;
  row: number;
  cells: CellEvidence[];
}
export interface SnapshotManifest {
  version: 1;
  sourceKey: string;
  sourceSha256: string;
  rowsSha256: string;
  extractedAt: string;
  effectiveAt: string;
  freshnessApprovedBy: string;
  dateSystem: '1900' | '1904';
  extractorVersion: string;
  sheets: { name: string; headers: string[]; populatedRows: number }[];
}
export interface Issue {
  sheet: string;
  row: number;
  field: string;
  code: string;
  severity: 'blocking' | 'warning';
}
export type CandidateField =
  | { kind: 'value'; value: Json }
  | { kind: 'blank' }
  | { kind: 'absent' }
  | { kind: 'invalid'; code: string };
export interface BookCandidate {
  sourceMetadata: Record<string, Json>;
  stableId: string;
  row: SourceRow;
  fields: Record<string, CandidateField>;
  authorKeys: string[];
  genreKeys: string[];
  issues: Issue[];
  dispositions: Record<string, string>;
}
export interface ImportReport {
  runId: string | null;
  scope: ImportScope;
  sourceSha256: string;
  status: 'dry-run' | 'applied' | 'replayed' | 'failed' | 'blocked';
  inserted: number;
  updated: number;
  unchanged: number;
  quarantined: number;
  conflicts: number;
  issues: Issue[];
  pendingScopes: ImportScope[];
  exitCode: number;
}
