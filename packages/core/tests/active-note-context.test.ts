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

  it("caps long metadata and reference strings with the field character bound", () => {
    const longValue = "x".repeat(80);
    const longPath = `Notes/${longValue}.md`;
    const longNote: NoteRecord = {
      ...note,
      path: longPath,
      title: longValue,
      aliases: [longValue],
      tags: [longValue],
      headings: [{ level: 2, heading: longValue, path: [longValue], position: { line: 4 } }],
      links: [{ raw: `[[${longValue}]]`, target: longValue, position: { line: 8 } }]
    };
    const packet = buildActiveNoteContextPacket({
      activePath: longPath,
      notes: [longNote],
      chunks: [
        {
          id: longValue,
          notePath: longPath,
          headingPath: [longValue],
          normalizedTextHash: "hash",
          ordinal: 0,
          text: "body text is governed separately"
        }
      ],
      relatedNotes: [{ path: longPath, title: longValue, reason: longValue }],
      sourceExcerpts: [
        {
          sourceId: longValue,
          sourcePath: `Sources/${longValue}/source.md`,
          chunkId: longValue,
          text: "source text is governed separately",
          evidenceLabel: longValue
        }
      ],
      maxFieldCharacters: 12
    });

    expect(packet.note?.path.length).toBeLessThanOrEqual(12);
    expect(packet.note?.title.length).toBeLessThanOrEqual(12);
    expect(packet.note?.aliases[0]?.length).toBeLessThanOrEqual(12);
    expect(packet.note?.tags[0]?.length).toBeLessThanOrEqual(12);
    expect(packet.note?.headings[0]?.length).toBeLessThanOrEqual(12);
    expect(packet.note?.links[0]?.length).toBeLessThanOrEqual(12);
    expect(packet.noteChunks[0]?.chunkId.length).toBeLessThanOrEqual(12);
    expect(packet.noteChunks[0]?.headingPath[0]?.length).toBeLessThanOrEqual(12);
    expect(packet.relatedNotes[0]?.path.length).toBeLessThanOrEqual(12);
    expect(packet.relatedNotes[0]?.title.length).toBeLessThanOrEqual(12);
    expect(packet.relatedNotes[0]?.reason.length).toBeLessThanOrEqual(12);
    expect(packet.sourceExcerpts[0]?.sourceId.length).toBeLessThanOrEqual(12);
    expect(packet.sourceExcerpts[0]?.sourcePath.length).toBeLessThanOrEqual(12);
    expect(packet.sourceExcerpts[0]?.chunkId.length).toBeLessThanOrEqual(12);
    expect(packet.sourceExcerpts[0]?.evidenceLabel.length).toBeLessThanOrEqual(12);
  });

  it("normalizes non-finite field character bounds to the default", () => {
    const longTitle = "x".repeat(300);
    const packet = buildActiveNoteContextPacket({
      activePath: "Notes/VHDL.md",
      notes: [{ ...note, title: longTitle }],
      chunks: [],
      relatedNotes: [],
      sourceExcerpts: [],
      maxFieldCharacters: Number.POSITIVE_INFINITY
    });

    expect(packet.note?.title.length).toBeLessThanOrEqual(240);
  });

  it("normalizes fractional tiny field character bounds without throwing", () => {
    const packet = buildActiveNoteContextPacket({
      activePath: "Notes/VHDL.md",
      notes: [{ ...note, title: "abcdef" }],
      chunks: [],
      relatedNotes: [],
      sourceExcerpts: [],
      maxFieldCharacters: 2.5
    });

    expect(packet.note?.title.length).toBeLessThanOrEqual(2);
  });

  it("normalizes optional item caps", () => {
    const packet = buildActiveNoteContextPacket({
      activePath: "Notes/VHDL.md",
      notes: [{ ...note, aliases: ["one", "two", "three"] }],
      chunks: Array.from({ length: 12 }, (_, index) => ({
        id: `chunk-${index}`,
        notePath: "Notes/VHDL.md",
        headingPath: ["Setup time"],
        normalizedTextHash: `hash-${index}`,
        ordinal: index,
        text: `Chunk ${index}`
      })),
      relatedNotes: Array.from({ length: 3 }, (_, index) => ({
        path: `Notes/Related-${index}.md`,
        title: `Related ${index}`,
        reason: "test"
      })),
      sourceExcerpts: Array.from({ length: 3 }, (_, index) => ({
        sourceId: `source-${index}`,
        sourcePath: `Sources/${index}/source.md`,
        chunkId: `source-chunk-${index}`,
        text: `source ${index}`,
        evidenceLabel: "source excerpt"
      })),
      maxNoteChunks: Number.POSITIVE_INFINITY,
      maxMetadataItems: 1.5,
      maxRelatedNotes: 0.5,
      maxSourceExcerpts: -1
    });

    expect(packet.noteChunks).toHaveLength(8);
    expect(packet.note?.aliases).toHaveLength(1);
    expect(packet.relatedNotes).toHaveLength(0);
    expect(packet.sourceExcerpts).toHaveLength(0);
  });

  it("caps chunk heading path segments and segment text", () => {
    const packet = buildActiveNoteContextPacket({
      activePath: "Notes/VHDL.md",
      notes: [note],
      chunks: [
        {
          id: "chunk-1",
          notePath: "Notes/VHDL.md",
          headingPath: Array.from({ length: 12 }, (_, index) => `Heading ${index} ${"x".repeat(40)}`),
          normalizedTextHash: "hash",
          ordinal: 0,
          text: "Chunk text"
        }
      ],
      relatedNotes: [],
      sourceExcerpts: [],
      maxFieldCharacters: 12
    });

    expect(packet.noteChunks[0]?.headingPath).toHaveLength(8);
    expect(packet.noteChunks[0]?.headingPath.every((segment) => segment.length <= 12)).toBe(true);
  });

  it("normalizes chunk heading path segment caps", () => {
    const packet = buildActiveNoteContextPacket({
      activePath: "Notes/VHDL.md",
      notes: [note],
      chunks: [
        {
          id: "chunk-1",
          notePath: "Notes/VHDL.md",
          headingPath: ["one", "two", "three"],
          normalizedTextHash: "hash",
          ordinal: 0,
          text: "Chunk text"
        }
      ],
      relatedNotes: [],
      sourceExcerpts: [],
      maxHeadingPathSegments: 1.5
    });

    expect(packet.noteChunks[0]?.headingPath).toHaveLength(1);
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
