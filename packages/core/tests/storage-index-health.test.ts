import { describe, expect, it } from "vitest";
import { buildVaultSnapshot, InMemoryVaultseerStore } from "../src/index";
import type { NoteRecordInput } from "../src/index";

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
  },
  {
    path: "B.md",
    basename: "B",
    content: "Beta body",
    stat: { ctime: 3, mtime: 4, size: 20 },
    metadata: {
      frontmatter: { tags: ["beta"] },
      tags: ["#beta"],
      links: [{ raw: "[[A]]", target: "A" }],
      headings: []
    }
  }
];

describe("InMemoryVaultseerStore", () => {
  it("starts with empty health and no stored entities", async () => {
    const store = new InMemoryVaultseerStore();

    await expect(store.getHealth()).resolves.toEqual({
      schemaVersion: 1,
      status: "empty",
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

    const health = await store.replaceNoteIndex(snapshot, "2026-04-29T19:00:00.000Z");

    expect(health).toEqual({
      schemaVersion: 1,
      status: "ready",
      lastIndexedAt: "2026-04-29T19:00:00.000Z",
      noteCount: 2,
      chunkCount: 0,
      vectorCount: 0,
      suggestionCount: 0,
      warnings: []
    });
    await expect(store.getNoteRecords()).resolves.toEqual(snapshot.notes);
    await expect(store.getFileVersions()).resolves.toEqual([
      {
        path: "A.md",
        mtime: 2,
        size: 10,
        contentHash: snapshot.notesByPath["A.md"]!.contentHash
      },
      {
        path: "B.md",
        mtime: 4,
        size: 20,
        contentHash: snapshot.notesByPath["B.md"]!.contentHash
      }
    ]);
  });

  it("clears every stored entity and returns empty health", async () => {
    const store = new InMemoryVaultseerStore();
    await store.replaceNoteIndex(buildVaultSnapshot(noteInputs), "2026-04-29T19:00:00.000Z");

    const health = await store.clear();

    expect(health.status).toBe("empty");
    expect(health.noteCount).toBe(0);
    await expect(store.getNoteRecords()).resolves.toEqual([]);
    await expect(store.getFileVersions()).resolves.toEqual([]);
  });
});

