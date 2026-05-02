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

  it("returns blocked when no note is active", () => {
    const packet = buildActiveNoteContextPacket({
      activePath: null,
      notes: [note],
      chunks: [],
      relatedNotes: [],
      sourceExcerpts: []
    });

    expect(packet.status).toBe("blocked");
    expect(packet.message).toContain("Open a Markdown note");
  });

  it("caps active note chunks", () => {
    const packet = buildActiveNoteContextPacket({
      activePath: "Notes/VHDL.md",
      notes: [note],
      chunks: Array.from({ length: 12 }, (_, index) => ({
        id: `chunk-${index}`,
        notePath: "Notes/VHDL.md",
        headingPath: ["Setup time"],
        normalizedTextHash: `hash-${index}`,
        ordinal: index,
        text: `Chunk ${index}`
      })),
      relatedNotes: [],
      sourceExcerpts: []
    });

    expect(packet.noteChunks).toHaveLength(8);
  });

  it("caps note metadata items", () => {
    const metadataNote: NoteRecord = {
      ...note,
      aliases: Array.from({ length: 40 }, (_, index) => `alias-${index}`),
      tags: Array.from({ length: 40 }, (_, index) => `tag-${index}`),
      headings: Array.from({ length: 40 }, (_, index) => ({
        level: 2,
        heading: `Heading ${index}`,
        path: [`Heading ${index}`],
        position: { line: index + 1 }
      })),
      links: Array.from({ length: 40 }, (_, index) => ({
        raw: `[[Note ${index}]]`,
        target: `Note ${index}`,
        position: { line: index + 1 }
      }))
    };
    const packet = buildActiveNoteContextPacket({
      activePath: "Notes/VHDL.md",
      notes: [metadataNote],
      chunks: [],
      relatedNotes: [],
      sourceExcerpts: []
    });

    expect(packet.note?.aliases).toHaveLength(32);
    expect(packet.note?.tags).toHaveLength(32);
    expect(packet.note?.headings).toHaveLength(32);
    expect(packet.note?.links).toHaveLength(32);
  });

  it("caps related notes and source excerpts", () => {
    const packet = buildActiveNoteContextPacket({
      activePath: "Notes/VHDL.md",
      notes: [note],
      chunks: [],
      relatedNotes: Array.from({ length: 12 }, (_, index) => ({
        path: `Notes/Related-${index}.md`,
        title: `Related ${index}`,
        reason: "test"
      })),
      sourceExcerpts: Array.from({ length: 12 }, (_, index) => ({
        sourceId: `source-${index}`,
        sourcePath: `Sources/${index}/source.md`,
        chunkId: `source-chunk-${index}`,
        text: `source ${index}`,
        evidenceLabel: "source excerpt"
      }))
    });

    expect(packet.relatedNotes).toHaveLength(8);
    expect(packet.sourceExcerpts).toHaveLength(8);
  });

  it("normalizes non-finite character bounds to the default", () => {
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
          text: "x".repeat(1300)
        }
      ],
      relatedNotes: [],
      sourceExcerpts: [],
      maxChunkCharacters: Number.POSITIVE_INFINITY
    });

    expect(packet.noteChunks[0]?.text.length).toBeLessThanOrEqual(1200);
  });

  it("normalizes fractional character bounds without throwing", () => {
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
      sourceExcerpts: [],
      maxChunkCharacters: 2.5
    });

    expect(packet.noteChunks[0]?.text.length).toBeLessThanOrEqual(2);
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
