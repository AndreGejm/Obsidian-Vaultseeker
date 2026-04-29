import { describe, expect, it } from "vitest";
import {
  buildLexicalIndex,
  buildVaultSnapshot,
  buildVectorNamespace,
  chunkVaultInputs,
  createEmbeddingJobId,
  InMemoryVaultseerStore
} from "../src/index";
import type { EmbeddingJobRecord, NoteRecordInput, VectorRecord } from "../src/index";

const noteInputs: NoteRecordInput[] = [
  {
    path: "A.md",
    basename: "A",
    content: "# Alpha\n\nAlpha body",
    stat: { ctime: 1, mtime: 2, size: 19 },
    metadata: {
      frontmatter: { tags: ["alpha"] },
      tags: ["#alpha"],
      links: [],
      headings: [{ level: 1, heading: "Alpha", position: { line: 0, column: 1 } }]
    }
  },
  {
    path: "B.md",
    basename: "B",
    content: "# Beta\n\nBeta body",
    stat: { ctime: 3, mtime: 4, size: 17 },
    metadata: {
      frontmatter: { tags: ["beta"] },
      tags: ["#beta"],
      links: [{ raw: "[[A]]", target: "A" }],
      headings: [{ level: 1, heading: "Beta", position: { line: 0, column: 1 } }]
    }
  }
];

describe("InMemoryVaultseerStore", () => {
  it("starts with empty health and no stored entities", async () => {
    const store = new InMemoryVaultseerStore();

    await expect(store.getHealth()).resolves.toEqual({
      schemaVersion: 1,
      status: "empty",
      statusMessage: null,
      lastIndexedAt: null,
      noteCount: 0,
      chunkCount: 0,
      vectorCount: 0,
      suggestionCount: 0,
      warnings: []
    });
    await expect(store.getNoteRecords()).resolves.toEqual([]);
    await expect(store.getFileVersions()).resolves.toEqual([]);
    await expect(store.getVectorRecords()).resolves.toEqual([]);
    await expect(store.getEmbeddingJobRecords()).resolves.toEqual([]);
  });

  it("replaces the note index and records file versions from the snapshot", async () => {
    const store = new InMemoryVaultseerStore();
    const snapshot = buildVaultSnapshot(noteInputs);
    const chunks = chunkVaultInputs(noteInputs);
    const lexicalIndex = buildLexicalIndex(snapshot, chunks);

    const health = await store.replaceNoteIndex(snapshot, "2026-04-29T19:00:00.000Z", chunks, lexicalIndex);

    expect(health).toEqual({
      schemaVersion: 1,
      status: "ready",
      statusMessage: null,
      lastIndexedAt: "2026-04-29T19:00:00.000Z",
      noteCount: 2,
      chunkCount: 2,
      vectorCount: 0,
      suggestionCount: 0,
      warnings: []
    });
    await expect(store.getNoteRecords()).resolves.toEqual(snapshot.notes);
    await expect(store.getChunkRecords()).resolves.toEqual(chunks);
    await expect(store.getLexicalIndexRecords()).resolves.toEqual(lexicalIndex);
    await expect(store.getFileVersions()).resolves.toEqual([
      {
        path: "A.md",
        mtime: 2,
        size: 19,
        contentHash: snapshot.notesByPath["A.md"]!.contentHash
      },
      {
        path: "B.md",
        mtime: 4,
        size: 17,
        contentHash: snapshot.notesByPath["B.md"]!.contentHash
      }
    ]);
  });

  it("clears every stored entity and returns empty health", async () => {
    const store = new InMemoryVaultseerStore();
    await store.replaceNoteIndex(buildVaultSnapshot(noteInputs), "2026-04-29T19:00:00.000Z");

    const health = await store.clear();

    expect(health.status).toBe("empty");
    expect(health.statusMessage).toBeNull();
    expect(health.noteCount).toBe(0);
    expect(health.chunkCount).toBe(0);
    await expect(store.getNoteRecords()).resolves.toEqual([]);
    await expect(store.getChunkRecords()).resolves.toEqual([]);
    await expect(store.getLexicalIndexRecords()).resolves.toEqual([]);
    await expect(store.getFileVersions()).resolves.toEqual([]);
    await expect(store.getVectorRecords()).resolves.toEqual([]);
    await expect(store.getEmbeddingJobRecords()).resolves.toEqual([]);
  });

  it("records indexing, stale, degraded, and error states without dropping the current mirror", async () => {
    const store = new InMemoryVaultseerStore();
    const snapshot = buildVaultSnapshot(noteInputs);
    await store.replaceNoteIndex(snapshot, "2026-04-29T19:00:00.000Z");

    await expect(store.beginIndexing("2026-04-29T19:05:00.000Z")).resolves.toMatchObject({
      status: "indexing",
      statusMessage: "Index rebuild started.",
      lastIndexedAt: "2026-04-29T19:00:00.000Z",
      noteCount: 2
    });

    await expect(store.markStale("A.md changed on disk.")).resolves.toMatchObject({
      status: "stale",
      statusMessage: "A.md changed on disk.",
      noteCount: 2
    });

    await expect(store.markDegraded("Semantic provider unavailable.")).resolves.toMatchObject({
      status: "degraded",
      statusMessage: "Semantic provider unavailable.",
      warnings: ["Semantic provider unavailable."],
      noteCount: 2
    });

    await expect(store.markError("Rebuild failed: metadata cache unavailable.")).resolves.toMatchObject({
      status: "error",
      statusMessage: "Rebuild failed: metadata cache unavailable.",
      warnings: ["Semantic provider unavailable.", "Rebuild failed: metadata cache unavailable."],
      noteCount: 2
    });

    await expect(store.getNoteRecords()).resolves.toEqual(snapshot.notes);
  });

  it("stores vectors and embedding jobs as rebuildable semantic state", async () => {
    const store = new InMemoryVaultseerStore();
    const snapshot = buildVaultSnapshot(noteInputs);
    const chunks = chunkVaultInputs(noteInputs);
    await store.replaceNoteIndex(snapshot, "2026-04-29T19:00:00.000Z", chunks);

    const modelNamespace = buildVectorNamespace({
      providerId: "ollama",
      modelId: "nomic-embed-text",
      dimensions: 768
    });
    const vector: VectorRecord = {
      chunkId: chunks[0]!.id,
      model: modelNamespace,
      dimensions: 768,
      contentHash: chunks[0]!.normalizedTextHash,
      vector: [0.1, 0.2, 0.3],
      embeddedAt: "2026-04-29T19:05:00.000Z"
    };
    const job: EmbeddingJobRecord = {
      id: createEmbeddingJobId(modelNamespace, chunks[1]!.id, chunks[1]!.normalizedTextHash),
      chunkId: chunks[1]!.id,
      notePath: chunks[1]!.notePath,
      modelNamespace,
      contentHash: chunks[1]!.normalizedTextHash,
      status: "queued",
      attemptCount: 0,
      createdAt: "2026-04-29T19:06:00.000Z",
      updatedAt: "2026-04-29T19:06:00.000Z",
      lastError: null,
      nextAttemptAt: null
    };

    await expect(store.replaceVectorRecords([vector])).resolves.toMatchObject({ vectorCount: 1 });
    await expect(store.replaceEmbeddingQueue([job])).resolves.toEqual([job]);
    await expect(store.getVectorRecords()).resolves.toEqual([vector]);
    await expect(store.getEmbeddingJobRecords()).resolves.toEqual([job]);

    await store.replaceNoteIndex(snapshot, "2026-04-29T19:10:00.000Z", chunks);

    await expect(store.getHealth()).resolves.toMatchObject({ status: "ready", vectorCount: 0 });
    await expect(store.getVectorRecords()).resolves.toEqual([]);
    await expect(store.getEmbeddingJobRecords()).resolves.toEqual([]);
  });
});
