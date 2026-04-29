import { describe, expect, it } from "vitest";
import { InMemoryVaultseerStore } from "@vaultseer/core";
import { checkReadOnlyIndexStaleness, clearReadOnlyIndex, rebuildReadOnlyIndex } from "../src/index-controller";
import type { NoteRecordInput } from "@vaultseer/core";

const inputs: NoteRecordInput[] = [
  {
    path: "A.md",
    basename: "A",
    content: "# Alpha\n\nAlpha",
    stat: { ctime: 1, mtime: 2, size: 14 },
    metadata: {
      frontmatter: { tags: ["alpha"] },
      tags: ["#alpha"],
      links: [],
      headings: [{ level: 1, heading: "Alpha", position: { line: 0, column: 1 } }]
    }
  },
  {
    path: "Archive/B.md",
    basename: "B",
    content: "# Beta\n\nBeta",
    stat: { ctime: 3, mtime: 4, size: 12 },
    metadata: {
      frontmatter: { tags: ["beta"] },
      tags: ["#beta"],
      links: [],
      headings: [{ level: 1, heading: "Beta", position: { line: 0, column: 1 } }]
    }
  }
];

describe("index-controller", () => {
  it("rebuilds the read-only index into the provided store while honoring excluded folders", async () => {
    const store = new InMemoryVaultseerStore();

    const health = await rebuildReadOnlyIndex({
      readNoteInputs: async () => inputs,
      store,
      excludedFolders: ["Archive"],
      now: () => "2026-04-29T20:00:00.000Z"
    });

    expect(health.status).toBe("ready");
    expect(health.noteCount).toBe(1);
    expect(health.chunkCount).toBe(1);
    await expect(store.getNoteRecords()).resolves.toMatchObject([{ path: "A.md" }]);
    await expect(store.getChunkRecords()).resolves.toMatchObject([{ notePath: "A.md", text: "Alpha" }]);
  });

  it("clears the read-only index through the provided store", async () => {
    const store = new InMemoryVaultseerStore();
    await rebuildReadOnlyIndex({
      readNoteInputs: async () => inputs,
      store,
      excludedFolders: [],
      now: () => "2026-04-29T20:00:00.000Z"
    });

    const health = await clearReadOnlyIndex(store);

    expect(health.status).toBe("empty");
    await expect(store.getNoteRecords()).resolves.toEqual([]);
  });

  it("marks the mirror as error when a rebuild fails without dropping the previous index", async () => {
    const store = new InMemoryVaultseerStore();
    await rebuildReadOnlyIndex({
      readNoteInputs: async () => inputs,
      store,
      excludedFolders: ["Archive"],
      now: () => "2026-04-29T20:00:00.000Z"
    });

    await expect(
      rebuildReadOnlyIndex({
        readNoteInputs: async () => {
          throw new Error("metadata cache unavailable");
        },
        store,
        excludedFolders: [],
        now: () => "2026-04-29T20:05:00.000Z"
      })
    ).rejects.toThrow("metadata cache unavailable");

    await expect(store.getHealth()).resolves.toMatchObject({
      status: "error",
      statusMessage: "Rebuild failed: metadata cache unavailable",
      noteCount: 1
    });
    await expect(store.getNoteRecords()).resolves.toMatchObject([{ path: "A.md" }]);
  });

  it("marks the mirror stale when current file versions differ from the stored index", async () => {
    const store = new InMemoryVaultseerStore();
    await rebuildReadOnlyIndex({
      readNoteInputs: async () => inputs,
      store,
      excludedFolders: ["Archive"],
      now: () => "2026-04-29T20:00:00.000Z"
    });

    await expect(
      checkReadOnlyIndexStaleness({
        readNoteInputs: async () => [
          {
            ...inputs[0]!,
            content: "# Alpha\n\nAlpha changed",
            stat: { ctime: 1, mtime: 6, size: 22 }
          },
          {
            path: "C.md",
            basename: "C",
            content: "Gamma",
            stat: { ctime: 7, mtime: 8, size: 30 },
            metadata: { frontmatter: { tags: ["gamma"] }, tags: ["#gamma"], links: [], headings: [] }
          },
          inputs[1]!
        ],
        store,
        excludedFolders: ["Archive"]
      })
    ).resolves.toMatchObject({
      status: "stale",
      statusMessage: "Vault changed since last index: 1 added, 1 modified.",
      noteCount: 1
    });

    await expect(store.getNoteRecords()).resolves.toMatchObject([{ path: "A.md" }]);
  });
});
