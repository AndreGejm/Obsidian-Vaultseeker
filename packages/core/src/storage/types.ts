import type { NoteRecord, VaultSnapshot } from "../types";

export const INDEX_SCHEMA_VERSION = 1;

export type IndexStatus = "empty" | "ready" | "error";

export type IndexHealth = {
  schemaVersion: number;
  status: IndexStatus;
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
  suggestions: SuggestionRecord[];
  decisions: DecisionRecord[];
  health: IndexHealth;
};

export interface VaultseerStore {
  replaceNoteIndex(snapshot: VaultSnapshot, indexedAt: string): Promise<IndexHealth>;
  getHealth(): Promise<IndexHealth>;
  getNoteRecords(): Promise<NoteRecord[]>;
  getFileVersions(): Promise<FileVersionRecord[]>;
  clear(): Promise<IndexHealth>;
}

