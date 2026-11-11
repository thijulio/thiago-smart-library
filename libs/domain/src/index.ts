export * from './lib/health';
export type { BookCard, BookDetail } from './lib/library-contracts';

export type { BookId, StableBookId, ReadingStatus, Platform } from './lib/database-contracts';

export type {
  Json,
  ImportScope,
  CellEvidence,
  SourceRow,
  SnapshotManifest,
  Issue,
  CandidateField,
  BookCandidate,
  ImportReport,
} from './lib/import-contracts';

export { groupReadingBooks, isReadingResponse } from './lib/reading';
export type { ReadingBook, ReadingResponse, ReadingGroup } from './lib/reading';

export { isStoredResult, isStoredPlan } from './lib/ai-storage';
export type {
  ResultKind,
  StoredState,
  PlanPlatform,
  StaleReason,
  SourceReference,
  RubricScore,
  FormatJudgment,
  ResultPayloads,
  ProducerMetadata,
  RevisionMetadata,
  StoredResult,
  PlanEntry,
  StoredPlan,
} from './lib/ai-storage';

export { enqueueRefresh, claimRefresh, finishRefresh } from './lib/refresh';
export type {
  RefreshTarget,
  RefreshRequest,
  RefreshJob,
  RefreshClaim,
  RefreshOutcome,
} from './lib/refresh';
