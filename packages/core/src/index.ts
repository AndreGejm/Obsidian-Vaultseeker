export { normalizeNoteRecord } from "./vault/normalize";
export { buildVaultSnapshot } from "./vault/snapshot";
export { InMemoryVaultseerStore } from "./storage/in-memory-store";
export { PersistentVaultseerStore } from "./storage/persistent-store";
export { INDEX_SCHEMA_VERSION } from "./storage/types";
export { compareFileVersions } from "./storage/file-version-diff";
export { buildRelationshipGraph } from "./relationships/graph";
export { detectNoteQualityIssues } from "./suggestions/note-quality";
export { suggestLinksForNote } from "./suggestions/link-suggestions";
export { suggestTagsForNote } from "./suggestions/tag-suggestions";
export {
  createSourceNoteProposalSuggestionRecords,
  mergeSuggestionRecords,
  upsertDecisionRecord
} from "./suggestions/suggestion-records";
export {
  createVaultWriteDecisionRecord,
  evaluateVaultWritePrecondition,
  mergeVaultWriteOperations,
  upsertVaultWriteDecisionRecord,
  planSourceNoteCreationOperation
} from "./writes/guarded-write";
export { chunkNoteInput, chunkVaultInputs } from "./chunking/chunk-note";
export { buildLexicalIndex, searchLexicalIndex } from "./search/lexical-search";
export { buildSourceLexicalIndex, searchSourceLexicalIndex } from "./source/source-lexical-search";
export { searchSourceSemanticVectors } from "./source/source-semantic-search";
export { proposeSourceNote } from "./source/source-note-proposal";
export { chunkSourceRecord, chunkSourceRecords } from "./source/chunk-source";
export { BuiltInTextSourceExtractor, isBuiltInTextSourceExtension } from "./source/text-source-extractor";
export {
  cancelSourceExtractionJobs,
  claimSourceExtractionJobs,
  completeSourceExtractionJob,
  createSourceExtractionJobId,
  failSourceExtractionJob,
  planSourceExtractionQueue,
  recoverRunningSourceExtractionJobs
} from "./source/source-extraction-queue";
export { runSourceExtractionWorkerBatch } from "./source/source-extraction-worker";
export { hashString } from "./chunking/text-chunking";
export {
  buildVectorNamespace,
  cancelEmbeddingJobs,
  claimEmbeddingJobs,
  completeEmbeddingJob,
  createEmbeddingJobId,
  failEmbeddingJob,
  getEmbeddingJobTargetKind,
  planEmbeddingQueue,
  planSourceEmbeddingQueue,
  recoverRunningEmbeddingJobs
} from "./semantic/embedding-queue";
export { runEmbeddingWorkerBatch, runSourceEmbeddingWorkerBatch } from "./semantic/embedding-worker";
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
  NoteEmbeddingJobRecord,
  SourceEmbeddingJobRecord,
  StoredVaultIndex,
  SuggestionEvidence,
  SuggestionRecord,
  VaultseerStore,
  VaultseerStorageBackend,
  VectorRecord
} from "./storage/types";
export type { FileVersionDiff } from "./storage/file-version-diff";
export type { RelationshipGraph, ResolvedLink, TagCoOccurrence, TagStat } from "./relationships/types";
export type {
  DetectNoteQualityIssuesInput,
  NoteQualityIssue,
  NoteQualityIssueEvidence,
  NoteQualityIssueKind,
  NoteQualityIssueSeverity
} from "./suggestions/note-quality";
export type { LinkSuggestion, LinkSuggestionEvidence, SuggestLinksForNoteInput } from "./suggestions/link-suggestions";
export type { SuggestTagsForNoteInput, TagSuggestion, TagSuggestionEvidence } from "./suggestions/tag-suggestions";
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
  SourceSemanticMatchedChunk,
  SourceSemanticSearchInput,
  SourceSemanticSearchResult
} from "./source/source-semantic-search";
export type {
  ProposeSourceNoteInput,
  SourceNoteProposal,
  SourceNoteProposalEvidence,
  SourceNoteProposalHeading,
  SourceNoteProposalLink,
  SourceNoteProposalRelatedNote,
  SourceNoteProposalTag
} from "./source/source-note-proposal";
export type {
  EmbeddingJobRecord,
  EmbeddingJobStatus,
  EmbeddingJobTargetKind,
  EmbeddingModelProfile,
  EmbeddingQueuePlan,
  EmbeddingQueueTransitionResult,
  ClaimEmbeddingJobsInput,
  ClaimEmbeddingJobsResult,
  CompleteEmbeddingJobInput,
  CancelEmbeddingJobsInput,
  FailEmbeddingJobInput,
  PlanEmbeddingQueueInput,
  PlanSourceEmbeddingQueueInput,
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
  SourceExtractionCandidate,
  SourceExtractionDiagnostic,
  SourceExtractionInput,
  SourceExtractionJobRecord,
  SourceExtractionJobStatus,
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
export type {
  CreateVaultWriteDecisionRecordInput,
  GuardedVaultWriteOperation,
  PlanSourceNoteCreationOperationInput,
  SourceNoteCreationOperation,
  VaultWriteApplyResult,
  VaultWriteApproval,
  VaultWriteCurrentSnapshot,
  VaultWriteDecision,
  VaultWriteDecisionRecord,
  VaultWriteDryRunResult,
  VaultWriteOperationType,
  VaultWritePort,
  VaultWritePreconditionReason,
  VaultWritePreconditionResult,
  VaultWritePreview
} from "./writes/guarded-write";
export type {
  CancelSourceExtractionJobsInput,
  ClaimSourceExtractionJobsInput,
  ClaimSourceExtractionJobsResult,
  CompleteSourceExtractionJobInput,
  FailSourceExtractionJobInput,
  PlanSourceExtractionQueueInput,
  RecoverRunningSourceExtractionJobsInput,
  SourceExtractionQueuePlan,
  SourceExtractionQueueTransitionResult
} from "./source/source-extraction-queue";
export type {
  RunSourceExtractionWorkerBatchInput,
  SourceExtractionWorkerBatchSummary
} from "./source/source-extraction-worker";
