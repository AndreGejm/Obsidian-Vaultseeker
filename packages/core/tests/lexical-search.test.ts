import { describe, expect, it } from "vitest";
import { buildLexicalIndex, buildVaultSnapshot, chunkVaultInputs, searchLexicalIndex } from "../src/index";
import type { NoteRecordInput } from "../src/index";

const noteInputs: NoteRecordInput[] = [
  {
    path: "Literature/Mimisbrunnr Retrieval.md",
    basename: "Mimisbrunnr Retrieval",
    content: [
      "# Mimisbrunnr Retrieval",
      "",
      "Governed memory retrieval keeps agent context bounded.",
      "",
      "## Search Notes",
      "",
      "Lexical search should explain matched fields."
    ].join("\n"),
    stat: { ctime: 1, mtime: 2, size: 130 },
    metadata: {
      frontmatter: {
        title: "Mímisbrunnr Retrieval",
        aliases: ["Memory Retrieval"],
        tags: ["ai/memory", "search"]
      },
      tags: ["#ai/memory", "#search"],
      links: [],
      headings: [
        { level: 1, heading: "Mimisbrunnr Retrieval", position: { line: 0, column: 1 } },
        { level: 2, heading: "Search Notes", position: { line: 4, column: 1 } }
      ]
    }
  },
  {
    path: "Garden/Reading Workflow.md",
    basename: "Reading Workflow",
    content: [
      "# Reading Workflow",
      "",
      "A quiet inbox routine helps review literature notes.",
      "",
      "## Tags",
      "",
      "Use stable tags before proposing links."
    ].join("\n"),
    stat: { ctime: 3, mtime: 4, size: 120 },
    metadata: {
      frontmatter: {
        tags: ["workflow/reading"]
      },
      tags: ["#workflow/reading"],
      links: [{ raw: "[[Mimisbrunnr Retrieval]]", target: "Mimisbrunnr Retrieval" }],
      headings: [
        { level: 1, heading: "Reading Workflow", position: { line: 0, column: 1 } },
        { level: 2, heading: "Tags", position: { line: 4, column: 1 } }
      ]
    }
  }
];

describe("buildLexicalIndex", () => {
  it("indexes note titles, aliases, headings, tags, and chunk body text", () => {
    const snapshot = buildVaultSnapshot(noteInputs);
    const chunks = chunkVaultInputs(noteInputs);
    const index = buildLexicalIndex(snapshot, chunks);

    expect(index.find((record) => record.term === "mimisbrunnr")?.refs).toEqual(
      expect.arrayContaining([
        { notePath: "Literature/Mimisbrunnr Retrieval.md", field: "title" },
        { notePath: "Literature/Mimisbrunnr Retrieval.md", field: "heading" }
      ])
    );
    expect(index.find((record) => record.term === "memory")?.refs).toEqual(
      expect.arrayContaining([
        { notePath: "Literature/Mimisbrunnr Retrieval.md", field: "alias" },
        { notePath: "Literature/Mimisbrunnr Retrieval.md", field: "tag" },
        expect.objectContaining({
          notePath: "Literature/Mimisbrunnr Retrieval.md",
          field: "body"
        })
      ])
    );
  });
});

describe("searchLexicalIndex", () => {
  it("returns explainable ranked note results from lexical index records", () => {
    const snapshot = buildVaultSnapshot(noteInputs);
    const chunks = chunkVaultInputs(noteInputs);
    const index = buildLexicalIndex(snapshot, chunks);

    const results = searchLexicalIndex({
      query: "memory retrieval",
      index,
      notes: snapshot.notes,
      chunks,
      limit: 5
    });

    expect(results[0]).toMatchObject({
      notePath: "Literature/Mimisbrunnr Retrieval.md",
      title: "Mímisbrunnr Retrieval",
      matchedTerms: ["memory", "retrieval"]
    });
    expect(results[0]!.matchedFields).toEqual(
      expect.arrayContaining([
        { term: "memory", field: "alias" },
        { term: "memory", field: "tag" },
        { term: "retrieval", field: "title" }
      ])
    );
    expect(results[0]!.matchedChunks.length).toBeGreaterThan(0);
    expect(results[0]!.score).toBeGreaterThan(results[1]?.score ?? 0);
  });

  it("supports case-insensitive and diacritic-insensitive queries", () => {
    const snapshot = buildVaultSnapshot(noteInputs);
    const chunks = chunkVaultInputs(noteInputs);
    const index = buildLexicalIndex(snapshot, chunks);

    const results = searchLexicalIndex({
      query: "MIMISBRUNNR",
      index,
      notes: snapshot.notes,
      chunks
    });

    expect(results.map((result) => result.notePath)).toEqual(["Literature/Mimisbrunnr Retrieval.md"]);
  });

  it("matches nested tag queries and exposes tag provenance", () => {
    const snapshot = buildVaultSnapshot(noteInputs);
    const chunks = chunkVaultInputs(noteInputs);
    const index = buildLexicalIndex(snapshot, chunks);

    const results = searchLexicalIndex({
      query: "#workflow/reading",
      index,
      notes: snapshot.notes,
      chunks
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      notePath: "Garden/Reading Workflow.md",
      matchedFields: expect.arrayContaining([{ term: "workflow/reading", field: "tag" }])
    });
  });

  it("returns no results for empty or unindexed queries", () => {
    const snapshot = buildVaultSnapshot(noteInputs);
    const chunks = chunkVaultInputs(noteInputs);
    const index = buildLexicalIndex(snapshot, chunks);

    expect(searchLexicalIndex({ query: "", index, notes: snapshot.notes, chunks })).toEqual([]);
    expect(searchLexicalIndex({ query: "nonexistent", index, notes: snapshot.notes, chunks })).toEqual([]);
  });
});
