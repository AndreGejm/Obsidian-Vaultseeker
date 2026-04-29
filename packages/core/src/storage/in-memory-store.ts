import type { ChunkRecord, FileVersionRecord, IndexHealth, LexicalIndexRecord, StoredVaultIndex, VaultseerStore } from "./types";
import type { NoteRecord, VaultSnapshot } from "../types";
import {
  cloneHealth,
  cloneStoredValue,
  createEmptyStoredVaultIndex,
  createReadyStoredVaultIndex,
  updateStoredVaultIndexHealth
} from "./store-state";

export class InMemoryVaultseerStore implements VaultseerStore {
  private state: StoredVaultIndex = createEmptyStoredVaultIndex();

  async beginIndexing(_startedAt: string): Promise<IndexHealth> {
    this.state = updateStoredVaultIndexHealth(this.state, "indexing", "Index rebuild started.");
    return cloneHealth(this.state);
  }

  async replaceNoteIndex(
    snapshot: VaultSnapshot,
    indexedAt: string,
    chunks: ChunkRecord[] = [],
    lexicalIndex: LexicalIndexRecord[] = []
  ): Promise<IndexHealth> {
    this.state = createReadyStoredVaultIndex(snapshot, indexedAt, chunks, lexicalIndex);
    return cloneHealth(this.state);
  }

  async markStale(reason: string): Promise<IndexHealth> {
    this.state = updateStoredVaultIndexHealth(this.state, "stale", reason);
    return cloneHealth(this.state);
  }

  async markDegraded(reason: string): Promise<IndexHealth> {
    this.state = updateStoredVaultIndexHealth(this.state, "degraded", reason, { appendWarning: true });
    return cloneHealth(this.state);
  }

  async markError(message: string): Promise<IndexHealth> {
    this.state = updateStoredVaultIndexHealth(this.state, "error", message, { appendWarning: true });
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

  async getFileVersions(): Promise<FileVersionRecord[]> {
    return cloneStoredValue(this.state.fileVersions);
  }

  async clear(): Promise<IndexHealth> {
    this.state = createEmptyStoredVaultIndex();
    return cloneHealth(this.state);
  }
}
