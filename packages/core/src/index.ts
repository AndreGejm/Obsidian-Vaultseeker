export { normalizeNoteRecord } from "./vault/normalize";
export { buildVaultSnapshot } from "./vault/snapshot";
export { InMemoryVaultseerStore } from "./storage/in-memory-store";
export { PersistentVaultseerStore } from "./storage/persistent-store";
export { INDEX_SCHEMA_VERSION } from "./storage/types";
export { compareFileVersions } from "./storage/file-version-diff";
export { buildRelationshipGraph } from "./relationships/graph";
export { chunkNoteInput, chunkVaultInputs } from "./chunking/chunk-note";
export { buildLexicalIndex, searchLexicalIndex } from "./search/lexical-search";
export { buildSourceLexicalIndex, searchSourceLexicalIndex } from "./source/source-lexical-search";
export { chunkSourceRecord, chunkSourceRecords } from "./source/chunk-source";
export {
  buildVectorNamespace,
  cancelEmbeddingJobs,
  claimEmbeddingJobs,
  completeEmbeddingJob,
  createEmbeddingJobId,
  failEmbeddingJob,
  planEmbeddingQueue,
  recoverRunningEmbeddingJobs
} from "./semantic/embedding-queue";
export { runEmbeddingWorkerBatch } from "./semantic/embedding-worker";
export { searchSemanticVectors } from "./semantic/semantic-search";
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
export type { SourceChunkingOptions } from "./source/chunk-source";
export type { LexicalMatchedChunk, LexicalMatchedField, LexicalSearchInput, LexicalSearchResult } from "./search/lexical-search";
export type {
  SourceLexicalField,
  SourceLexicalIndexRecord,
  SourceLexicalMatchedChunk,
  SourceLexicalMatchedField,
  SourceLexicalRef,
  SourceLexicalSearchInput,
  SourceLexicalSearchResult
} from "./source/source-lexical-search";
export type {
  EmbeddingJobRecord,
  EmbeddingJobStatus,
  EmbeddingModelProfile,
  EmbeddingQueuePlan,
  EmbeddingQueueTransitionResult,
  ClaimEmbeddingJobsInput,
  ClaimEmbeddingJobsResult,
  CompleteEmbeddingJobInput,
  CancelEmbeddingJobsInput,
  FailEmbeddingJobInput,
  PlanEmbeddingQueueInput,
  RecoverRunningEmbeddingJobsInput
} from "./semantic/embedding-queue";
export type {
  EmbeddingProviderPort,
  EmbeddingWorkerBatchSummary,
  RunEmbeddingWorkerBatchInput
} from "./semantic/embedding-worker";
export type {
  SemanticMatchedChunk,
  SemanticSearchInput,
  SemanticSearchResult
} from "./semantic/semantic-search";
export type {
  SourceAttachmentRecord,
  SourceChunkRecord,
  SourceExtractionDiagnostic,
  SourceExtractionInput,
  SourceExtractionResult,
  SourceExtractorCapability,
  SourceExtractorDependency,
  SourceExtractorFailureMode,
  SourceExtractorIdentity,
  SourceExtractorPort,
  SourceProvenance,
  SourceRecord,
  SourceWorkspaceStatus
} from "./source/types";
