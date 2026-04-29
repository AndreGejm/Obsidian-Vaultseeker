import type {
  ChunkRecord,
  FileVersionRecord,
  IndexHealth,
  StoredVaultIndex,
  VaultseerStore,
  VaultseerStorageBackend
} from "./types";
import { INDEX_SCHEMA_VERSION } from "./types";
import type { NoteRecord, VaultSnapshot } from "../types";
import {
  cloneHealth,
  cloneStoredValue,
  createEmptyStoredVaultIndex,
  createErrorStoredVaultIndex,
  createReadyStoredVaultIndex,
  updateStoredVaultIndexHealth
} from "./store-state";

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

  async replaceNoteIndex(snapshot: VaultSnapshot, indexedAt: string, chunks: ChunkRecord[] = []): Promise<IndexHealth> {
    this.state = createReadyStoredVaultIndex(snapshot, indexedAt, chunks);
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
  return cloneStoredValue(value);
}
