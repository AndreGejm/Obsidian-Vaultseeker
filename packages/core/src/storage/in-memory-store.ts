import type { FileVersionRecord, IndexHealth, StoredVaultIndex, VaultseerStore } from "./types";
import { INDEX_SCHEMA_VERSION } from "./types";
import type { NoteRecord, VaultSnapshot } from "../types";

export class InMemoryVaultseerStore implements VaultseerStore {
  private state: StoredVaultIndex = createEmptyState();

  async replaceNoteIndex(snapshot: VaultSnapshot, indexedAt: string): Promise<IndexHealth> {
    const notes = clone(snapshot.notes);
    const fileVersions = createFileVersions(notes);

    this.state = {
      schemaVersion: INDEX_SCHEMA_VERSION,
      notes,
      fileVersions,
      chunks: [],
      lexicalIndex: [],
      vectors: [],
      suggestions: [],
      decisions: [],
      health: {
        schemaVersion: INDEX_SCHEMA_VERSION,
        status: "ready",
        lastIndexedAt: indexedAt,
        noteCount: notes.length,
        chunkCount: 0,
        vectorCount: 0,
        suggestionCount: 0,
        warnings: []
      }
    };

    return clone(this.state.health);
  }

  async getHealth(): Promise<IndexHealth> {
    return clone(this.state.health);
  }

  async getNoteRecords(): Promise<NoteRecord[]> {
    return clone(this.state.notes);
  }

  async getFileVersions(): Promise<FileVersionRecord[]> {
    return clone(this.state.fileVersions);
  }

  async clear(): Promise<IndexHealth> {
    this.state = createEmptyState();
    return clone(this.state.health);
  }
}

function createEmptyState(): StoredVaultIndex {
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
      lastIndexedAt: null,
      noteCount: 0,
      chunkCount: 0,
      vectorCount: 0,
      suggestionCount: 0,
      warnings: []
    }
  };
}

function createFileVersions(notes: NoteRecord[]): FileVersionRecord[] {
  return notes
    .map((note) => ({
      path: note.path,
      mtime: note.stat.mtime,
      size: note.stat.size,
      contentHash: note.contentHash
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

