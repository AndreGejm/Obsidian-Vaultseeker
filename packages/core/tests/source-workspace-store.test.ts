import { describe, expect, it } from "vitest";
import { buildVaultSnapshot, InMemoryVaultseerStore, PersistentVaultseerStore } from "../src/index";
import type {
  NoteRecordInput,
  SourceChunkRecord,
  SourceRecord,
  StoredVaultIndex,
  VaultseerStorageBackend
} from "../src/index";

const sourceRecord: SourceRecord = {
  id: "source:datasheet:abc123",
  status: "extracted",
  sourcePath: "Sources/Datasheets/timer.pdf",
  filename: "timer.pdf",
  extension: ".pdf",
  sizeBytes: 2048,
  contentHash: "sha256:abc123",
  importedAt: "2026-04-30T08:00:00.000Z",
  extractor: {
    id: "marker",
    name: "Marker",
    version: "1.0.0"
  },
  extractionOptions: {
    preserveImages: true
  },
  extractedMarkdown: "# Timer Datasheet\n\nPin 1 controls reset.",
  diagnostics: [],
  attachments: []
};

const sourceChunk: SourceChunkRecord = {
  id: "source-chunk:datasheet:reset-pin",
  sourceId: "source:datasheet:abc123",
  sourcePath: "Sources/Datasheets/timer.pdf",
  sectionPath: ["Timer Datasheet"],
  normalizedTextHash: "reset-pin-hash",
  ordinal: 0,
  text: "Pin 1 controls reset.",
  provenance: {
    kind: "page",
    page: 1
  }
};

const noteInputs: NoteRecordInput[] = [
  {
    path: "Notes/Timer.md",
    basename: "Timer",
    content: "# Timer\n\nA note created after source extraction.",
    stat: { ctime: 1, mtime: 2, size: 47 },
    metadata: {
      frontmatter: { tags: ["electronics"] },
      tags: ["#electronics"],
      links: [],
      headings: [{ level: 1, heading: "Timer", position: { line: 0, column: 1 } }]
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

describe("source workspace storage", () => {
  it("persists source records and source chunks separately from vault notes", async () => {
    const backend = new MemoryBackend();
    const store = await PersistentVaultseerStore.create(backend);

    await expect(store.replaceSourceWorkspace([sourceRecord], [sourceChunk])).resolves.toEqual([sourceRecord]);
    const reloaded = await PersistentVaultseerStore.create(backend);

    await expect(reloaded.getSourceRecords()).resolves.toEqual([sourceRecord]);
    await expect(reloaded.getSourceChunkRecords()).resolves.toEqual([sourceChunk]);
    await expect(reloaded.getNoteRecords()).resolves.toEqual([]);
  });

  it("clears source workspaces with the local index state", async () => {
    const store = new InMemoryVaultseerStore();
    await store.replaceSourceWorkspace([sourceRecord], [sourceChunk]);

    await store.clear();

    await expect(store.getSourceRecords()).resolves.toEqual([]);
    await expect(store.getSourceChunkRecords()).resolves.toEqual([]);
  });

  it("keeps source workspaces when rebuilding the vault note mirror", async () => {
    const store = new InMemoryVaultseerStore();
    await store.replaceSourceWorkspace([sourceRecord], [sourceChunk]);

    await store.replaceNoteIndex(buildVaultSnapshot(noteInputs), "2026-04-30T08:05:00.000Z");

    await expect(store.getSourceRecords()).resolves.toEqual([sourceRecord]);
    await expect(store.getSourceChunkRecords()).resolves.toEqual([sourceChunk]);
  });
});
