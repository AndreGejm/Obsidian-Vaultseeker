import type { NoteRecord, VaultSnapshot } from "../types";
import {
  INDEX_SCHEMA_VERSION,
  type ChunkRecord,
  type EmbeddingJobRecord,
  type FileVersionRecord,
  type IndexHealth,
  type IndexStatus,
  type LexicalIndexRecord,
  type StoredVaultIndex,
  type DecisionRecord,
  type SuggestionRecord,
  type VectorRecord
} from "./types";
import type { SourceChunkRecord, SourceRecord } from "../source/types";
import type { SourceExtractionJobRecord } from "../source/types";
import type { GuardedVaultWriteOperation, VaultWriteDecisionRecord } from "../writes/guarded-write";

export function createEmptyStoredVaultIndex(): StoredVaultIndex {
  return {
    schemaVersion: INDEX_SCHEMA_VERSION,
    notes: [],
    fileVersions: [],
    chunks: [],
    lexicalIndex: [],
    vectors: [],
    embeddingJobs: [],
    sourceRecords: [],
    sourceChunks: [],
    sourceExtractionJobs: [],
    suggestions: [],
    decisions: [],
    writeOperations: [],
    writeDecisions: [],
    health: {
      schemaVersion: INDEX_SCHEMA_VERSION,
      status: "empty",
      statusMessage: null,
      lastIndexedAt: null,
      noteCount: 0,
      chunkCount: 0,
      vectorCount: 0,
      suggestionCount: 0,
      warnings: []
    }
  };
}

export function createReadyStoredVaultIndex(
  snapshot: VaultSnapshot,
  indexedAt: string,
  chunkRecords: ChunkRecord[] = [],
  lexicalIndexRecords: LexicalIndexRecord[] = [],
  vectorRecords: VectorRecord[] = [],
  embeddingJobRecords: EmbeddingJobRecord[] = [],
  sourceRecords: SourceRecord[] = [],
  sourceChunkRecords: SourceChunkRecord[] = [],
  sourceExtractionJobRecords: SourceExtractionJobRecord[] = [],
  suggestionRecords: SuggestionRecord[] = [],
  decisionRecords: DecisionRecord[] = [],
  writeOperationRecords: GuardedVaultWriteOperation[] = [],
  writeDecisionRecords: VaultWriteDecisionRecord[] = []
): StoredVaultIndex {
  const notes = cloneStoredValue(snapshot.notes);
  const chunks = cloneStoredValue(chunkRecords);
  const lexicalIndex = cloneStoredValue(lexicalIndexRecords);
  const vectors = cloneStoredValue(vectorRecords);
  const suggestions = cloneStoredValue(suggestionRecords);

  return {
    schemaVersion: INDEX_SCHEMA_VERSION,
    notes,
    fileVersions: createFileVersions(notes),
    chunks,
    lexicalIndex,
    vectors,
    embeddingJobs: cloneStoredValue(embeddingJobRecords),
    sourceRecords: cloneStoredValue(sourceRecords),
    sourceChunks: cloneStoredValue(sourceChunkRecords),
    sourceExtractionJobs: cloneStoredValue(sourceExtractionJobRecords),
    suggestions,
    decisions: cloneStoredValue(decisionRecords),
    writeOperations: cloneStoredValue(writeOperationRecords),
    writeDecisions: cloneStoredValue(writeDecisionRecords),
    health: {
      schemaVersion: INDEX_SCHEMA_VERSION,
      status: "ready",
      statusMessage: null,
      lastIndexedAt: indexedAt,
      noteCount: notes.length,
      chunkCount: chunks.length,
      vectorCount: vectors.length,
      suggestionCount: suggestions.length,
      warnings: []
    }
  };
}

export function createErrorStoredVaultIndex(message: string): StoredVaultIndex {
  return updateStoredVaultIndexHealth(createEmptyStoredVaultIndex(), "error", message, { appendWarning: true });
}

export function updateStoredVaultIndexVectors(state: StoredVaultIndex, vectors: VectorRecord[]): StoredVaultIndex {
  const storedVectors = cloneStoredValue(vectors);

  return {
    ...state,
    vectors: storedVectors,
    health: {
      ...state.health,
      vectorCount: storedVectors.length
    }
  };
}

export function updateStoredVaultIndexEmbeddingJobs(
  state: StoredVaultIndex,
  embeddingJobs: EmbeddingJobRecord[]
): StoredVaultIndex {
  return {
    ...state,
    embeddingJobs: cloneStoredValue(embeddingJobs)
  };
}

export function updateStoredVaultIndexSourceWorkspace(
  state: StoredVaultIndex,
  sourceRecords: SourceRecord[],
  sourceChunkRecords: SourceChunkRecord[]
): StoredVaultIndex {
  return {
    ...state,
    sourceRecords: cloneStoredValue(sourceRecords),
    sourceChunks: cloneStoredValue(sourceChunkRecords)
  };
}

export function updateStoredVaultIndexSourceExtractionJobs(
  state: StoredVaultIndex,
  sourceExtractionJobs: SourceExtractionJobRecord[]
): StoredVaultIndex {
  return {
    ...state,
    sourceExtractionJobs: cloneStoredValue(sourceExtractionJobs)
  };
}

export function updateStoredVaultIndexSuggestions(
  state: StoredVaultIndex,
  suggestions: SuggestionRecord[]
): StoredVaultIndex {
  const storedSuggestions = cloneStoredValue(suggestions);

  return {
    ...state,
    suggestions: storedSuggestions,
    health: {
      ...state.health,
      suggestionCount: storedSuggestions.length
    }
  };
}

export function updateStoredVaultIndexDecisions(
  state: StoredVaultIndex,
  decisions: DecisionRecord[]
): StoredVaultIndex {
  return {
    ...state,
    decisions: cloneStoredValue(decisions)
  };
}

export function updateStoredVaultIndexWriteOperations(
  state: StoredVaultIndex,
  writeOperations: GuardedVaultWriteOperation[]
): StoredVaultIndex {
  return {
    ...state,
    writeOperations: cloneStoredValue(writeOperations)
  };
}

export function updateStoredVaultIndexWriteDecisions(
  state: StoredVaultIndex,
  writeDecisions: VaultWriteDecisionRecord[]
): StoredVaultIndex {
  return {
    ...state,
    writeDecisions: cloneStoredValue(writeDecisions)
  };
}

export function updateStoredVaultIndexHealth(
  state: StoredVaultIndex,
  status: IndexStatus,
  statusMessage: string | null,
  options: { appendWarning?: boolean } = {}
): StoredVaultIndex {
  const warnings =
    options.appendWarning && statusMessage ? appendWarning(state.health.warnings, statusMessage) : state.health.warnings;

  return {
    ...state,
    health: {
      ...state.health,
      status,
      statusMessage,
      warnings
    }
  };
}

export function cloneStoredValue<T>(value: T): T {
  return structuredClone(value);
}

export function createFileVersions(notes: NoteRecord[]): FileVersionRecord[] {
  return notes
    .map((note) => ({
      path: note.path,
      mtime: note.stat.mtime,
      size: note.stat.size,
      contentHash: note.contentHash
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

export function cloneHealth(state: StoredVaultIndex): IndexHealth {
  return cloneStoredValue(state.health);
}

function appendWarning(warnings: string[], warning: string): string[] {
  if (warnings.includes(warning)) return warnings;
  return [...warnings, warning];
}
