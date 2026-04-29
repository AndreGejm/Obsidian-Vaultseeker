import { describe, expect, it } from "vitest";
import { buildVaultSnapshot, normalizeNoteRecord } from "../src/index";
import type { NoteRecordInput } from "../src/index";

const baseStat = {
  ctime: 100,
  mtime: 200,
  size: 128
};

describe("normalizeNoteRecord", () => {
  it("normalizes frontmatter and inline tags from adapter input", () => {
    const note = normalizeNoteRecord({
      path: "Literature/Ragnarok.md",
      basename: "Ragnarok",
      content: "Ragnarok is related to #myth/norse and #myth.\n",
      stat: baseStat,
      metadata: {
        frontmatter: {
          tags: ["myth/norse", "#source/literature"],
          aliases: ["Doom of the Gods"]
        },
        tags: ["#myth/norse", "source/literature"],
        links: [],
        headings: []
      }
    });

    expect(note.tags).toEqual(["myth", "myth/norse", "source", "source/literature"]);
    expect(note.aliases).toEqual(["Doom of the Gods"]);
  });

  it("preserves adapter-supplied links and headings without parsing authority drift", () => {
    const note = normalizeNoteRecord({
      path: "Permanent/Viking Cosmology.md",
      basename: "Viking Cosmology",
      content: "The adapter already parsed metadata.",
      stat: baseStat,
      metadata: {
        frontmatter: {},
        tags: [],
        links: [
          {
            raw: "[[Ragnarok#Primary Sources]]",
            target: "Ragnarok",
            heading: "Primary Sources",
            displayText: "Ragnarok",
            position: { line: 4, column: 8 }
          }
        ],
        headings: [
          {
            level: 2,
            heading: "Primary Sources",
            position: { line: 10, column: 1 }
          }
        ]
      }
    });

    expect(note.links).toEqual([
      {
        raw: "[[Ragnarok#Primary Sources]]",
        target: "Ragnarok",
        heading: "Primary Sources",
        displayText: "Ragnarok",
        position: { line: 4, column: 8 }
      }
    ]);
    expect(note.headings).toEqual([
      {
        level: 2,
        heading: "Primary Sources",
        path: ["Primary Sources"],
        position: { line: 10, column: 1 }
      }
    ]);
  });
});

describe("buildVaultSnapshot", () => {
  it("builds deterministic note, tag, and link lookup maps", () => {
    const notes: NoteRecordInput[] = [
      {
        path: "B.md",
        basename: "B",
        content: "#beta",
        stat: { ...baseStat, mtime: 300 },
        metadata: {
          frontmatter: { tags: ["beta"] },
          tags: ["#beta"],
          links: [{ raw: "[[A]]", target: "A" }],
          headings: []
        }
      },
      {
        path: "A.md",
        basename: "A",
        content: "#alpha",
        stat: baseStat,
        metadata: {
          frontmatter: { tags: ["alpha"] },
          tags: ["#alpha"],
          links: [],
          headings: []
        }
      }
    ];

    const snapshot = buildVaultSnapshot(notes);

    expect(snapshot.notes.map((note) => note.path)).toEqual(["A.md", "B.md"]);
    expect(snapshot.notesByPath["A.md"]?.tags).toEqual(["alpha"]);
    expect(snapshot.notePathsByTag).toEqual({
      alpha: ["A.md"],
      beta: ["B.md"]
    });
    expect(snapshot.outgoingLinksByPath).toEqual({
      "A.md": [],
      "B.md": ["A"]
    });
  });
});

