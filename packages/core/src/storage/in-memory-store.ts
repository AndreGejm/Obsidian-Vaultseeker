import type { FileVersionRecord, IndexHealth, StoredVaultIndex, VaultseerStore } from "./types";
import { INDEX_SCHEMA_VERSION } from "./types";
import type { NoteRecord, VaultSnapshot } from "../types";

export class InMemoryVaultseerStore implements VaultseerStore {
  private state: StoredVaultIndex = createEmptyState();

  async beginIndexing(_startedAt: string): Promise<IndexHealth> {
    this.state = {
      ...this.state,
      health: {
        ...this.state.health,
        status: "indexing",
        statusMessage: "Index rebuild started."
      }
    };

    return clone(this.state.health);
  }

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
        statusMessage: null,
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

  async markStale(reason: string): Promise<IndexHealth> {
    this.state = {
      ...this.state,
      health: {
        ...this.state.health,
        status: "stale",
        statusMessage: reason
      }
    };

    return clone(this.state.health);
  }

  async markDegraded(reason: string): Promise<IndexHealth> {
    this.state = {
      ...this.state,
      health: {
        ...this.state.health,
        status: "degraded",
        statusMessage: reason,
        warnings: appendWarning(this.state.health.warnings, reason)
      }
    };

    return clone(this.state.health);
  }

  async markError(message: string): Promise<IndexHealth> {
    this.state = {
      ...this.state,
      health: {
        ...this.state.health,
        status: "error",
        statusMessage: message,
        warnings: appendWarning(this.state.health.warnings, message)
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

function appendWarning(warnings: string[], warning: string): string[] {
  if (warnings.includes(warning)) return warnings;
  return [...warnings, warning];
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
