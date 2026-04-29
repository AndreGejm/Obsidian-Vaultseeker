import type { NoteRecord, VaultSnapshot } from "../types";

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

export type EmbeddingJobRecord = {
  id: string;
  chunkId: string;
  notePath: string;
  modelNamespace: string;
  contentHash: string;
  status: EmbeddingJobStatus;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
  lastError: string | null;
};

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
  | { type: "link_overlap"; notePath: string; count: number };

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
  suggestions: SuggestionRecord[];
  decisions: DecisionRecord[];
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
  getFileVersions(): Promise<FileVersionRecord[]>;
  clear(): Promise<IndexHealth>;
}
