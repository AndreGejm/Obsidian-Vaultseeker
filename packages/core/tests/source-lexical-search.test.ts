import { describe, expect, it } from "vitest";
import {
  buildSourceLexicalIndex,
  chunkSourceRecord,
  searchSourceLexicalIndex
} from "../src/index";
import type { SourceRecord } from "../src/index";

function sourceRecord(
  id: string,
  sourcePath: string,
  filename: string,
  markdown: string
): SourceRecord {
  return {
    id,
    status: "extracted",
    sourcePath,
    filename,
    extension: filename.slice(filename.lastIndexOf(".")),
    sizeBytes: markdown.length,
    contentHash: `sha256:${id}`,
    importedAt: "2026-04-30T09:00:00.000Z",
    extractor: {
      id: "marker",
      name: "Marker",
      version: "1.0.0"
    },
    extractionOptions: {},
    extractedMarkdown: markdown,
    diagnostics: [],
    attachments: []
  };
}

const timerSource = sourceRecord(
  "source:timer",
  "Sources/Datasheets/timer.pdf",
  "timer.pdf",
  [
    "# Timer Datasheet",
    "",
    "Pin 1 controls reset behavior.",
    "",
    "## Electrical Characteristics",
    "",
    "Supply voltage ranges from 4.5V to 16V."
  ].join("\n")
);

const literatureSource = sourceRecord(
  "source:paper",
  "Sources/Papers/memory-retrieval.pdf",
  "memory-retrieval.pdf",
  [
    "# Mímisbrunnr Retrieval",
    "",
    "Governed memory retrieval keeps agent context bounded.",
    "",
    "## Evaluation",
    "",
    "Lexical recall remains the fallback when embeddings are unavailable."
  ].join("\n")
);

const sources = [timerSource, literatureSource];
const chunks = sources.flatMap((source) => chunkSourceRecord(source));

describe("buildSourceLexicalIndex", () => {
  it("indexes source filenames, section paths, and extracted chunk text", () => {
    const index = buildSourceLexicalIndex(sources, chunks);

    expect(index.find((record) => record.term === "timer")?.refs).toEqual(
      expect.arrayContaining([
        { sourceId: "source:timer", sourcePath: "Sources/Datasheets/timer.pdf", field: "filename" },
        expect.objectContaining({
          sourceId: "source:timer",
          sourcePath: "Sources/Datasheets/timer.pdf",
          field: "section"
        })
      ])
    );
    expect(index.find((record) => record.term === "reset")?.refs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: "source:timer",
          sourcePath: "Sources/Datasheets/timer.pdf",
          field: "body"
        })
      ])
    );
  });
});

describe("searchSourceLexicalIndex", () => {
  it("returns explainable source results from indexed extracted chunks", () => {
    const index = buildSourceLexicalIndex(sources, chunks);

    const results = searchSourceLexicalIndex({
      query: "reset behavior",
      index,
      sources,
      chunks,
      limit: 5
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      sourceId: "source:timer",
      sourcePath: "Sources/Datasheets/timer.pdf",
      filename: "timer.pdf",
      matchedTerms: ["reset", "behavior"],
      matchedFields: expect.arrayContaining([
        expect.objectContaining({ term: "reset", field: "body" }),
        expect.objectContaining({ term: "behavior", field: "body" })
      ]),
      matchedChunks: [
        expect.objectContaining({
          sectionPath: ["Timer Datasheet"],
          text: "Pin 1 controls reset behavior.",
          matchedTerms: ["reset", "behavior"]
        })
      ]
    });
  });

  it("supports diacritic-insensitive queries over extracted source headings", () => {
    const index = buildSourceLexicalIndex(sources, chunks);

    const results = searchSourceLexicalIndex({
      query: "mimisbrunnr retrieval",
      index,
      sources,
      chunks
    });

    expect(results.map((result) => result.sourcePath)).toEqual(["Sources/Papers/memory-retrieval.pdf"]);
    expect(results[0]!.matchedFields).toEqual(
      expect.arrayContaining([
        { term: "mimisbrunnr", field: "section", chunkId: chunks.find((chunk) => chunk.sourceId === "source:paper")!.id },
        { term: "retrieval", field: "filename" }
      ])
    );
  });

  it("returns no results for empty or unindexed source queries", () => {
    const index = buildSourceLexicalIndex(sources, chunks);

    expect(searchSourceLexicalIndex({ query: "", index, sources, chunks })).toEqual([]);
    expect(searchSourceLexicalIndex({ query: "nonexistent", index, sources, chunks })).toEqual([]);
  });
});
