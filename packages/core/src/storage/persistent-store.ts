import type {
  ChunkRecord,
  DecisionRecord,
  EmbeddingJobRecord,
  FileVersionRecord,
  IndexHealth,
  LexicalIndexRecord,
  StoredVaultIndex,
  SuggestionRecord,
  VaultseerStore,
  VaultseerStorageBackend,
  VectorRecord
} from "./types";
import { INDEX_SCHEMA_VERSION } from "./types";
import type { GuardedVaultWriteOperation, VaultWriteDecisionRecord } from "../writes/guarded-write";
import type { NoteRecord, VaultSnapshot } from "../types";
import {
  cloneHealth,
  cloneStoredValue,
  createEmptyStoredVaultIndex,
  createErrorStoredVaultIndex,
  createReadyStoredVaultIndex,
  updateStoredVaultIndexEmbeddingJobs,
  updateStoredVaultIndexHealth,
  updateStoredVaultIndexDecisions,
  updateStoredVaultIndexSourceExtractionJobs,
  updateStoredVaultIndexSourceWorkspace,
  updateStoredVaultIndexSuggestions,
  updateStoredVaultIndexVectors,
  updateStoredVaultIndexWriteApplyResults,
  updateStoredVaultIndexWriteDecisions,
  updateStoredVaultIndexWriteOperations
} from "./store-state";
import type { SourceChunkRecord, SourceExtractionJobRecord, SourceRecord } from "../source/types";
import { upsertDecisionRecord } from "../suggestions/suggestion-records";
import {
  upsertVaultWriteApplyResultRecord,
  upsertVaultWriteDecisionRecord,
  type VaultWriteApplyResultRecord
} from "../writes/guarded-write";

export class PersistentVaultseerStore implements VaultseerStore {
  private constructor(
    private readonly backend: VaultseerStorageBackend,
    private state: StoredVaultIndex
  ) {}

  static async create(backend: VaultseerStorageBackend): Promise<PersistentVaultseerStore> {
    const persisted = await backend.load();
    const state = hydrateStoredVaultIndex(persisted);
    return new PersistentVaultseerStore(backend, state);
  }

  async beginIndexing(_startedAt: string): Promise<IndexHealth> {
    this.state = updateStoredVaultIndexHealth(this.state, "indexing", "Index rebuild started.");
    await this.persist();
    return cloneHealth(this.state);
  }

  async replaceNoteIndex(
    snapshot: VaultSnapshot,
    indexedAt: string,
    chunks: ChunkRecord[] = [],
    lexicalIndex: LexicalIndexRecord[] = []
  ): Promise<IndexHealth> {
    this.state = createReadyStoredVaultIndex(
      snapshot,
      indexedAt,
      chunks,
      lexicalIndex,
      [],
      [],
      this.state.sourceRecords,
      this.state.sourceChunks,
      this.state.sourceExtractionJobs,
      this.state.suggestions,
      this.state.decisions,
      this.state.writeOperations,
      this.state.writeDecisions,
      this.state.writeApplyResults
    );
    await this.persist();
    return cloneHealth(this.state);
  }

  async markStale(reason: string): Promise<IndexHealth> {
    this.state = updateStoredVaultIndexHealth(this.state, "stale", reason);
    await this.persist();
    return cloneHealth(this.state);
  }

  async markDegraded(reason: string): Promise<IndexHealth> {
    this.state = updateStoredVaultIndexHealth(this.state, "degraded", reason, { appendWarning: true });
    await this.persist();
    return cloneHealth(this.state);
  }

  async markError(message: string): Promise<IndexHealth> {
    this.state = updateStoredVaultIndexHealth(this.state, "error", message, { appendWarning: true });
    await this.persist();
    return cloneHealth(this.state);
  }

  async getHealth(): Promise<IndexHealth> {
    return cloneHealth(this.state);
  }

  async getNoteRecords(): Promise<NoteRecord[]> {
    return cloneStoredValue(this.state.notes);
  }

  async getChunkRecords(): Promise<ChunkRecord[]> {
    return cloneStoredValue(this.state.chunks);
  }

  async getLexicalIndexRecords(): Promise<LexicalIndexRecord[]> {
    return cloneStoredValue(this.state.lexicalIndex);
  }

  async replaceVectorRecords(vectors: VectorRecord[]): Promise<IndexHealth> {
    this.state = updateStoredVaultIndexVectors(this.state, vectors);
    await this.persist();
    return cloneHealth(this.state);
  }

  async getVectorRecords(): Promise<VectorRecord[]> {
    return cloneStoredValue(this.state.vectors);
  }

  async replaceEmbeddingQueue(jobs: EmbeddingJobRecord[]): Promise<EmbeddingJobRecord[]> {
    this.state = updateStoredVaultIndexEmbeddingJobs(this.state, jobs);
    await this.persist();
    return cloneStoredValue(this.state.embeddingJobs);
  }

  async getEmbeddingJobRecords(): Promise<EmbeddingJobRecord[]> {
    return cloneStoredValue(this.state.embeddingJobs);
  }

  async replaceSourceWorkspace(sources: SourceRecord[], chunks: SourceChunkRecord[]): Promise<SourceRecord[]> {
    this.state = updateStoredVaultIndexSourceWorkspace(this.state, sources, chunks);
    await this.persist();
    return cloneStoredValue(this.state.sourceRecords);
  }

  async getSourceRecords(): Promise<SourceRecord[]> {
    return cloneStoredValue(this.state.sourceRecords);
  }

  async getSourceChunkRecords(): Promise<SourceChunkRecord[]> {
    return cloneStoredValue(this.state.sourceChunks);
  }

  async replaceSourceExtractionQueue(jobs: SourceExtractionJobRecord[]): Promise<SourceExtractionJobRecord[]> {
    this.state = updateStoredVaultIndexSourceExtractionJobs(this.state, jobs);
    await this.persist();
    return cloneStoredValue(this.state.sourceExtractionJobs);
  }

  async getSourceExtractionJobRecords(): Promise<SourceExtractionJobRecord[]> {
    return cloneStoredValue(this.state.sourceExtractionJobs);
  }

  async replaceSuggestionRecords(suggestions: SuggestionRecord[]): Promise<IndexHealth> {
    this.state = updateStoredVaultIndexSuggestions(this.state, suggestions);
    await this.persist();
    return cloneHealth(this.state);
  }

  async getSuggestionRecords(): Promise<SuggestionRecord[]> {
    return cloneStoredValue(this.state.suggestions);
  }

  async recordSuggestionDecision(decision: DecisionRecord): Promise<DecisionRecord[]> {
    this.state = updateStoredVaultIndexDecisions(this.state, upsertDecisionRecord(this.state.decisions, decision));
    await this.persist();
    return cloneStoredValue(this.state.decisions);
  }

  async getDecisionRecords(): Promise<DecisionRecord[]> {
    return cloneStoredValue(this.state.decisions);
  }

  async replaceVaultWriteOperations(
    operations: GuardedVaultWriteOperation[]
  ): Promise<GuardedVaultWriteOperation[]> {
    this.state = updateStoredVaultIndexWriteOperations(this.state, operations);
    await this.persist();
    return cloneStoredValue(this.state.writeOperations);
  }

  async getVaultWriteOperations(): Promise<GuardedVaultWriteOperation[]> {
    return cloneStoredValue(this.state.writeOperations);
  }

  async recordVaultWriteDecision(decision: VaultWriteDecisionRecord): Promise<VaultWriteDecisionRecord[]> {
    this.state = updateStoredVaultIndexWriteDecisions(
      this.state,
      upsertVaultWriteDecisionRecord(this.state.writeDecisions, decision)
    );
    await this.persist();
    return cloneStoredValue(this.state.writeDecisions);
  }

  async getVaultWriteDecisionRecords(): Promise<VaultWriteDecisionRecord[]> {
    return cloneStoredValue(this.state.writeDecisions);
  }

  async recordVaultWriteApplyResult(result: VaultWriteApplyResultRecord): Promise<VaultWriteApplyResultRecord[]> {
    this.state = updateStoredVaultIndexWriteApplyResults(
      this.state,
      upsertVaultWriteApplyResultRecord(this.state.writeApplyResults, result)
    );
    await this.persist();
    return cloneStoredValue(this.state.writeApplyResults);
  }

  async getVaultWriteApplyResultRecords(): Promise<VaultWriteApplyResultRecord[]> {
    return cloneStoredValue(this.state.writeApplyResults);
  }

  async getFileVersions(): Promise<FileVersionRecord[]> {
    return cloneStoredValue(this.state.fileVersions);
  }

  async clear(): Promise<IndexHealth> {
    this.state = createEmptyStoredVaultIndex();
    await this.backend.clear();
    return cloneHealth(this.state);
  }

  private async persist(): Promise<void> {
    await this.backend.save(cloneStoredValue(this.state));
  }
}

function hydrateStoredVaultIndex(value: StoredVaultIndex | null): StoredVaultIndex {
  if (!value) return createEmptyStoredVaultIndex();
  if (value.schemaVersion !== INDEX_SCHEMA_VERSION) {
    return createErrorStoredVaultIndex(`Unsupported index schema version: ${value.schemaVersion}.`);
  }
  return {
    ...cloneStoredValue(value),
    vectors: cloneStoredValue(value.vectors ?? []),
    embeddingJobs: cloneStoredValue(value.embeddingJobs ?? []),
    sourceRecords: cloneStoredValue(value.sourceRecords ?? []),
    sourceChunks: cloneStoredValue(value.sourceChunks ?? []),
    sourceExtractionJobs: cloneStoredValue(value.sourceExtractionJobs ?? []),
    suggestions: cloneStoredValue(value.suggestions ?? []),
    decisions: cloneStoredValue(value.decisions ?? []),
    writeOperations: cloneStoredValue(value.writeOperations ?? []),
    writeDecisions: cloneStoredValue(value.writeDecisions ?? []),
    writeApplyResults: cloneStoredValue(value.writeApplyResults ?? [])
  };
}
