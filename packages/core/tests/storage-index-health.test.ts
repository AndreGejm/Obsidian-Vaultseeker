import { describe, expect, it } from "vitest";
import { buildLexicalIndex, buildVaultSnapshot, chunkVaultInputs, InMemoryVaultseerStore } from "../src/index";
import type { NoteRecordInput } from "../src/index";

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
});
