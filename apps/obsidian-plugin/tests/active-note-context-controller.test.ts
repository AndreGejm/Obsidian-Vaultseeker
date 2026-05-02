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
  });
});
