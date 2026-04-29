import type { NoteRecord, VaultSnapshot } from "../types";
import {
  INDEX_SCHEMA_VERSION,
  type ChunkRecord,
  type FileVersionRecord,
  type IndexHealth,
  type IndexStatus,
  type LexicalIndexRecord,
  type StoredVaultIndex
} from "./types";

export function createEmptyStoredVaultIndex(): StoredVaultIndex {
  return {
    schemaVersion: INDEX_SCHEMA_VERSION,
    notes: [],
    fileVersions: [],
    chunks: [],
    lexicalIndex: [],
    vectors: [],
    suggestions: [],
    decisions: [],
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
  lexicalIndexRecords: LexicalIndexRecord[] = []
): StoredVaultIndex {
  const notes = cloneStoredValue(snapshot.notes);
  const chunks = cloneStoredValue(chunkRecords);
  const lexicalIndex = cloneStoredValue(lexicalIndexRecords);

  return {
    schemaVersion: INDEX_SCHEMA_VERSION,
    notes,
    fileVersions: createFileVersions(notes),
    chunks,
    lexicalIndex,
    vectors: [],
    suggestions: [],
    decisions: [],
    health: {
      schemaVersion: INDEX_SCHEMA_VERSION,
      status: "ready",
      statusMessage: null,
      lastIndexedAt: indexedAt,
      noteCount: notes.length,
      chunkCount: chunks.length,
      vectorCount: 0,
      suggestionCount: 0,
      warnings: []
    }
  };
}

export function createErrorStoredVaultIndex(message: string): StoredVaultIndex {
  return updateStoredVaultIndexHealth(createEmptyStoredVaultIndex(), "error", message, { appendWarning: true });
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
