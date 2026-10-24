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
