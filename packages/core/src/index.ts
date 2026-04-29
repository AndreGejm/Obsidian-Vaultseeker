export { normalizeNoteRecord } from "./vault/normalize";
export { buildVaultSnapshot } from "./vault/snapshot";
export { InMemoryVaultseerStore } from "./storage/in-memory-store";
export { PersistentVaultseerStore } from "./storage/persistent-store";
export { INDEX_SCHEMA_VERSION } from "./storage/types";
export { compareFileVersions } from "./storage/file-version-diff";
export { buildRelationshipGraph } from "./relationships/graph";
export { chunkNoteInput, chunkVaultInputs } from "./chunking/chunk-note";
export { buildLexicalIndex, searchLexicalIndex } from "./search/lexical-search";
export type {
  AdapterMetadata,
  HeadingInput,
  LinkInput,
  NormalizedHeading,
  NoteRecord,
  NoteRecordInput,
  NoteStat,
  SourcePosition,
  VaultSnapshot
} from "./types";
export type {
  ChunkRecord,
  DecisionRecord,
  FileVersionRecord,
  IndexHealth,
  IndexStatus,
  LexicalIndexRecord,
  StoredVaultIndex,
  SuggestionEvidence,
  SuggestionRecord,
  VaultseerStore,
  VaultseerStorageBackend,
  VectorRecord
} from "./storage/types";
export type { FileVersionDiff } from "./storage/file-version-diff";
export type { RelationshipGraph, ResolvedLink, TagCoOccurrence, TagStat } from "./relationships/types";
export type { ChunkingOptions } from "./chunking/chunk-note";
export type { LexicalMatchedChunk, LexicalMatchedField, LexicalSearchInput, LexicalSearchResult } from "./search/lexical-search";
