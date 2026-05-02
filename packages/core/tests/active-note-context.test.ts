import { describe, expect, it } from "vitest";
import { buildActiveNoteContextPacket } from "../src/context/active-note-context";
import type { NoteRecord } from "../src/types";

const note: NoteRecord = {
  path: "Notes/VHDL.md",
  basename: "VHDL",
  title: "VHDL Timing",
  contentHash: "note-hash",
  aliases: ["timing"],
  tags: ["vhdl"],
  frontmatter: { tags: ["vhdl"] },
  headings: [{ level: 2, heading: "Setup time", path: ["Setup time"], position: { line: 4 } }],
  links: [{ raw: "[[Flip Flop]]", target: "Flip Flop", position: { line: 8 } }],
  stat: { size: 100, ctime: 1, mtime: 1 }
};

describe("buildActiveNoteContextPacket", () => {
  it("builds bounded context for the active note", () => {
    const packet = buildActiveNoteContextPacket({
      activePath: "Notes/VHDL.md",
      notes: [note],
      chunks: [
        {
          id: "chunk-1",
          notePath: "Notes/VHDL.md",
          headingPath: ["Setup time"],
          normalizedTextHash: "hash",
          ordinal: 0,
          text: "Setup time must be met before the clock edge."
        }
      ],
      relatedNotes: [],
      sourceExcerpts: [],
      maxChunkCharacters: 80
    });

    expect(packet.status).toBe("ready");
    expect(packet.note?.path).toBe("Notes/VHDL.md");
    expect(packet.note?.tags).toEqual(["vhdl"]);
    expect(packet.noteChunks[0]?.text).toContain("Setup time");
  });

  it("returns blocked when the active note is not indexed", () => {
    const packet = buildActiveNoteContextPacket({
      activePath: "Missing.md",
      notes: [note],
      chunks: [],
      relatedNotes: [],
      sourceExcerpts: []
    });

    expect(packet.status).toBe("blocked");
    expect(packet.message).toContain("not indexed");
  });

  it("keeps truncated note chunks and source excerpts within the requested character bound", () => {
    const maxChunkCharacters = 10;
    const packet = buildActiveNoteContextPacket({
      activePath: "Notes/VHDL.md",
      notes: [note],
      chunks: [
        {
          id: "chunk-1",
          notePath: "Notes/VHDL.md",
          headingPath: ["Setup time"],
          normalizedTextHash: "hash",
          ordinal: 0,
          text: "0123456789abcdef"
        }
      ],
      relatedNotes: [],
      sourceExcerpts: [
        {
          sourceId: "source-1",
          sourcePath: "Sources/VHDL/source.md",
          chunkId: "source-chunk-1",
          text: "source excerpt text exceeds limit",
          evidenceLabel: "source excerpt"
        }
      ],
      maxChunkCharacters
    });

    expect(packet.noteChunks[0]?.text.length).toBeLessThanOrEqual(maxChunkCharacters);
    expect(packet.sourceExcerpts[0]?.text.length).toBeLessThanOrEqual(maxChunkCharacters);
  });

  it("keeps truncated context within tiny character bounds", () => {
    const maxChunkCharacters = 2;
    const packet = buildActiveNoteContextPacket({
      activePath: "Notes/VHDL.md",
      notes: [note],
      chunks: [
        {
          id: "chunk-1",
          notePath: "Notes/VHDL.md",
          headingPath: ["Setup time"],
          normalizedTextHash: "hash",
          ordinal: 0,
          text: "abcdef"
        }
      ],
      relatedNotes: [],
      sourceExcerpts: [
        {
          sourceId: "source-1",
          sourcePath: "Sources/VHDL/source.md",
          chunkId: "source-chunk-1",
          text: "abcdef",
          evidenceLabel: "source excerpt"
        }
      ],
      maxChunkCharacters
    });

    expect(packet.noteChunks[0]?.text.length).toBeLessThanOrEqual(maxChunkCharacters);
    expect(packet.sourceExcerpts[0]?.text.length).toBeLessThanOrEqual(maxChunkCharacters);
  });
});
