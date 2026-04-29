import { describe, expect, it } from "vitest";
import { buildVaultSnapshot, PersistentVaultseerStore } from "../src/index";
import type { NoteRecordInput, StoredVaultIndex, VaultseerStorageBackend } from "../src/index";

const noteInputs: NoteRecordInput[] = [
  {
    path: "A.md",
    basename: "A",
    content: "Alpha body",
    stat: { ctime: 1, mtime: 2, size: 10 },
    metadata: {
      frontmatter: { tags: ["alpha"] },
      tags: ["#alpha"],
      links: [],
      headings: []
    }
  }
];

class MemoryBackend implements VaultseerStorageBackend {
  value: StoredVaultIndex | null = null;

  async load(): Promise<StoredVaultIndex | null> {
    return this.value ? structuredClone(this.value) : null;
  }

  async save(value: StoredVaultIndex): Promise<void> {
    this.value = structuredClone(value);
  }

  async clear(): Promise<void> {
    this.value = null;
  }
}

describe("PersistentVaultseerStore", () => {
  it("persists a rebuilt note index and reloads it from the backend", async () => {
    const backend = new MemoryBackend();
    const snapshot = buildVaultSnapshot(noteInputs);
    const store = await PersistentVaultseerStore.create(backend);

    await store.replaceNoteIndex(snapshot, "2026-04-29T21:00:00.000Z");
    const reloaded = await PersistentVaultseerStore.create(backend);

    await expect(reloaded.getHealth()).resolves.toEqual({
      schemaVersion: 1,
      status: "ready",
      statusMessage: null,
      lastIndexedAt: "2026-04-29T21:00:00.000Z",
      noteCount: 1,
      chunkCount: 0,
      vectorCount: 0,
      suggestionCount: 0,
      warnings: []
    });
    await expect(reloaded.getNoteRecords()).resolves.toEqual(snapshot.notes);
    await expect(reloaded.getFileVersions()).resolves.toEqual([
      {
        path: "A.md",
        mtime: 2,
        size: 10,
        contentHash: snapshot.notesByPath["A.md"]!.contentHash
      }
    ]);
  });

  it("persists clear as an empty mirror", async () => {
    const backend = new MemoryBackend();
    const store = await PersistentVaultseerStore.create(backend);
    await store.replaceNoteIndex(buildVaultSnapshot(noteInputs), "2026-04-29T21:00:00.000Z");

    await store.clear();
    const reloaded = await PersistentVaultseerStore.create(backend);

    await expect(reloaded.getHealth()).resolves.toMatchObject({
      status: "empty",
      statusMessage: null,
      noteCount: 0
    });
    await expect(reloaded.getNoteRecords()).resolves.toEqual([]);
  });

  it("fails closed when persisted schema version is unsupported", async () => {
    const backend = new MemoryBackend();
    const store = await PersistentVaultseerStore.create(backend);
    await store.replaceNoteIndex(buildVaultSnapshot(noteInputs), "2026-04-29T21:00:00.000Z");
    backend.value = {
      ...backend.value!,
      schemaVersion: 999,
      health: {
        ...backend.value!.health,
        schemaVersion: 999
      }
    };

    const reloaded = await PersistentVaultseerStore.create(backend);

    await expect(reloaded.getHealth()).resolves.toMatchObject({
      schemaVersion: 1,
      status: "error",
      statusMessage: "Unsupported index schema version: 999.",
      noteCount: 0,
      warnings: ["Unsupported index schema version: 999."]
    });
    await expect(reloaded.getNoteRecords()).resolves.toEqual([]);
  });
});
