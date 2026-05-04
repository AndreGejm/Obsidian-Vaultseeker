import { describe, expect, it } from "vitest";
import {
  buildLexicalIndex,
  buildVaultSnapshot,
  chunkVaultInputs,
  InMemoryVaultseerStore,
  type NoteRecordInput
} from "@vaultseer/core";
import { buildActiveNoteContextFromStore } from "../src/active-note-context-controller";

describe("buildActiveNoteContextFromStore", () => {
  it("loads note and chunk records from the store", async () => {
    const store = new InMemoryVaultseerStore();
    const inputs: NoteRecordInput[] = [
      {
        path: "Notes/VHDL.md",
        basename: "VHDL",
        content: "VHDL setup time matters.",
        stat: { ctime: 1, mtime: 1, size: 20 },
        metadata: {
          frontmatter: { tags: ["vhdl"] },
          tags: ["#vhdl"],
          links: [],
          headings: []
        }
      }
    ];
    const snapshot = buildVaultSnapshot(inputs);
    const chunks = chunkVaultInputs(inputs);
    await store.replaceNoteIndex(snapshot, "2026-05-02T00:00:00.000Z", chunks, buildLexicalIndex(snapshot, chunks));

    const packet = await buildActiveNoteContextFromStore({
      store,
      activePath: "Notes/VHDL.md"
    });

    expect(packet.status).toBe("ready");
    expect(packet.note?.title).toBe("VHDL");
    expect(packet.noteChunks).toEqual([
      expect.objectContaining({
        text: "VHDL setup time matters."
      })
    ]);
  });

  it("returns blocked when the active note is not indexed", async () => {
    const store = new InMemoryVaultseerStore();

    const packet = await buildActiveNoteContextFromStore({
      store,
      activePath: "Notes/Missing.md"
    });

    expect(packet).toMatchObject({
      status: "blocked",
      message: "The active note is not indexed. Rebuild the Vaultseer index before using note-aware chat.",
      note: null,
      noteChunks: []
    });
  });

  it("uses live Obsidian note content when the active note is not indexed yet", async () => {
    const store = new InMemoryVaultseerStore();

    const packet = await buildActiveNoteContextFromStore({
      store,
      activePath: "Electronics/Resistor Types.md",
      readActiveNoteInput: async (path) => ({
        path,
        basename: "Resistor Types",
        content: "# Resistor Types\n\nA resistor limits current.\n\n## Fixed resistors\n\nMetal film is common.",
        stat: { ctime: 1, mtime: 2, size: 88 },
        metadata: {
          frontmatter: { tags: ["electronics/components"] },
          tags: ["#electronics/components"],
          links: [],
          headings: [
            { level: 1, heading: "Resistor Types", position: { line: 0 } },
            { level: 2, heading: "Fixed resistors", position: { line: 4 } }
          ]
        }
      })
    });

    expect(packet).toMatchObject({
      status: "ready",
      message: "Active note context is ready from the open Obsidian note.",
      note: {
        path: "Electronics/Resistor Types.md",
        title: "Resistor Types",
        tags: ["electronics", "electronics/components"],
        headings: ["Resistor Types", "Fixed resistors"]
      },
      liveNote: {
        source: "active_file",
        text: expect.stringContaining("A resistor limits current."),
        truncated: false
      },
      noteChunks: [
        expect.objectContaining({ text: expect.stringContaining("A resistor limits current.") }),
        expect.objectContaining({ text: expect.stringContaining("Metal film is common.") })
      ]
    });
  });

  it("uses live chunks when the indexed active note has no indexed chunks", async () => {
    const store = new InMemoryVaultseerStore();
    const snapshot = buildVaultSnapshot([
      {
        path: "Electronics/Resistor Types.md",
        basename: "Resistor Types",
        content: "",
        stat: { ctime: 1, mtime: 1, size: 0 },
        metadata: {
          frontmatter: {},
          tags: [],
          links: [],
          headings: []
        }
      }
    ]);
    await store.replaceNoteIndex(snapshot, "2026-05-02T00:00:00.000Z", [], []);

    const packet = await buildActiveNoteContextFromStore({
      store,
      activePath: "Electronics/Resistor Types.md",
      readActiveNoteInput: async (path) => ({
        path,
        basename: "Resistor Types",
        content: "# Resistor Types\n\nUse headings to group fixed, variable, and nonlinear resistor types.",
        stat: { ctime: 1, mtime: 3, size: 81 },
        metadata: {
          frontmatter: {},
          tags: [],
          links: [],
          headings: [{ level: 1, heading: "Resistor Types", position: { line: 0 } }]
        }
      })
    });

    expect(packet.status).toBe("ready");
    expect(packet.noteChunks).toEqual([
      expect.objectContaining({
        chunkId: expect.stringContaining("live-chunk:"),
        text: "Use headings to group fixed, variable, and nonlinear resistor types."
      })
    ]);
  });
});
