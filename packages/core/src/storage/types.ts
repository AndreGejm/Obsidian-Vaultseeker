import type { NoteRecord, VaultSnapshot } from "../types";
import type { SourceChunkRecord, SourceExtractionJobRecord, SourceRecord } from "../source/types";
import type {
  GuardedVaultWriteOperation,
  VaultWriteApplyResultRecord,
  VaultWriteDecisionRecord
} from "../writes/guarded-write";

export const INDEX_SCHEMA_VERSION = 1;

export type IndexStatus = "empty" | "indexing" | "ready" | "stale" | "degraded" | "error";

export type IndexHealth = {
  schemaVersion: number;
  status: IndexStatus;
  statusMessage: string | null;
  lastIndexedAt: string | null;
  noteCount: number;
  chunkCount: number;
  vectorCount: number;
  suggestionCount: number;
  warnings: string[];
};

export type FileVersionRecord = {
  path: string;
  mtime: number;
  size: number;
  contentHash: string;
};

export type ChunkRecord = {
  id: string;
  notePath: string;
  headingPath: string[];
  normalizedTextHash: string;
  ordinal: number;
  text: string;
};

export type LexicalIndexRecord = {
  term: string;
  refs: Array<{
    notePath: string;
    chunkId?: string;
    field: "title" | "alias" | "heading" | "tag" | "body";
  }>;
};

export type VectorRecord = {
  chunkId: string;
  model: string;
  dimensions: number;
  contentHash: string;
  vector: number[];
  embeddedAt: string;
};

export type EmbeddingJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type EmbeddingJobTargetKind = "note" | "source";

export type EmbeddingJobBase = {
  id: string;
  chunkId: string;
  modelNamespace: string;
  contentHash: string;
  status: EmbeddingJobStatus;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
  lastError: string | null;
  nextAttemptAt: string | null;
};

export type NoteEmbeddingJobRecord = EmbeddingJobBase & {
  targetKind?: "note";
  notePath: string;
};

export type SourceEmbeddingJobRecord = EmbeddingJobBase & {
  targetKind: "source";
  sourceId: string;
  sourcePath: string;
};

export type EmbeddingJobRecord = NoteEmbeddingJobRecord | SourceEmbeddingJobRecord;

export type SuggestionRecord = {
  id: string;
  type: string;
  targetPath: string;
  confidence: number;
  evidence: SuggestionEvidence[];
  createdAt: string;
};

export type SuggestionEvidence =
  | { type: "shared_tags"; value: string[] }
  | { type: "semantic_match"; chunkId: string; score: number }
  | { type: "unlinked_mention"; text: string }
  | { type: "link_overlap"; notePath: string; count: number }
  | { type: "link_suggestion_token_overlap"; notePath: string; tokens: string[] }
  | { type: "assistant_note_rewrite"; reason: string }
  | { type: "note_tag_evidence"; relation: "linked_note" | "backlink_note"; notePath: string; tag: string }
  | { type: "tag_co_occurrence"; fromTag: string; suggestedTag: string; count: number }
  | { type: "tag_frequency"; tag: string; noteCount: number }
  | { type: "source_field"; sourceId: string; field: "title" | "filename"; value: string }
  | { type: "source_section"; sourceId: string; chunkId: string; sectionPath: string[] }
  | { type: "source_excerpt"; sourceId: string; chunkId: string; text: string }
  | {
      type: "source_term_match";
      sourceId: string;
      chunkId: string | null;
      matchedTerms: string[];
      tag?: string;
      notePath?: string;
    }
  | { type: "note_match"; notePath: string; matchedText: string; matchKind: "title" | "alias" };

export type DecisionRecord = {
  suggestionId: string;
  decision: "accepted" | "rejected" | "deferred";
  decidedAt: string;
};

export type StoredVaultIndex = {
  schemaVersion: number;
  notes: NoteRecord[];
  fileVersions: FileVersionRecord[];
  chunks: ChunkRecord[];
  lexicalIndex: LexicalIndexRecord[];
  vectors: VectorRecord[];
  embeddingJobs: EmbeddingJobRecord[];
  sourceRecords: SourceRecord[];
  sourceChunks: SourceChunkRecord[];
  sourceExtractionJobs: SourceExtractionJobRecord[];
  suggestions: SuggestionRecord[];
  decisions: DecisionRecord[];
  writeOperations: GuardedVaultWriteOperation[];
  writeDecisions: VaultWriteDecisionRecord[];
  writeApplyResults: VaultWriteApplyResultRecord[];
  health: IndexHealth;
};

export interface VaultseerStorageBackend {
  load(): Promise<StoredVaultIndex | null>;
  save(value: StoredVaultIndex): Promise<void>;
  clear(): Promise<void>;
}

export interface VaultseerStore {
  beginIndexing(startedAt: string): Promise<IndexHealth>;
  replaceNoteIndex(
    snapshot: VaultSnapshot,
    indexedAt: string,
    chunks?: ChunkRecord[],
    lexicalIndex?: LexicalIndexRecord[]
  ): Promise<IndexHealth>;
  markStale(reason: string): Promise<IndexHealth>;
  markDegraded(reason: string): Promise<IndexHealth>;
  markError(message: string): Promise<IndexHealth>;
  getHealth(): Promise<IndexHealth>;
  getNoteRecords(): Promise<NoteRecord[]>;
  getChunkRecords(): Promise<ChunkRecord[]>;
  getLexicalIndexRecords(): Promise<LexicalIndexRecord[]>;
  replaceVectorRecords(vectors: VectorRecord[]): Promise<IndexHealth>;
  getVectorRecords(): Promise<VectorRecord[]>;
  replaceEmbeddingQueue(jobs: EmbeddingJobRecord[]): Promise<EmbeddingJobRecord[]>;
  getEmbeddingJobRecords(): Promise<EmbeddingJobRecord[]>;
  replaceSourceWorkspace(sources: SourceRecord[], chunks: SourceChunkRecord[]): Promise<SourceRecord[]>;
  getSourceRecords(): Promise<SourceRecord[]>;
  getSourceChunkRecords(): Promise<SourceChunkRecord[]>;
  replaceSourceExtractionQueue(jobs: SourceExtractionJobRecord[]): Promise<SourceExtractionJobRecord[]>;
  getSourceExtractionJobRecords(): Promise<SourceExtractionJobRecord[]>;
  replaceSuggestionRecords(suggestions: SuggestionRecord[]): Promise<IndexHealth>;
  getSuggestionRecords(): Promise<SuggestionRecord[]>;
  recordSuggestionDecision(decision: DecisionRecord): Promise<DecisionRecord[]>;
  getDecisionRecords(): Promise<DecisionRecord[]>;
  replaceVaultWriteOperations(operations: GuardedVaultWriteOperation[]): Promise<GuardedVaultWriteOperation[]>;
  getVaultWriteOperations(): Promise<GuardedVaultWriteOperation[]>;
  recordVaultWriteDecision(decision: VaultWriteDecisionRecord): Promise<VaultWriteDecisionRecord[]>;
  getVaultWriteDecisionRecords(): Promise<VaultWriteDecisionRecord[]>;
  recordVaultWriteApplyResult(result: VaultWriteApplyResultRecord): Promise<VaultWriteApplyResultRecord[]>;
  getVaultWriteApplyResultRecords(): Promise<VaultWriteApplyResultRecord[]>;
  getFileVersions(): Promise<FileVersionRecord[]>;
  clear(): Promise<IndexHealth>;
}
