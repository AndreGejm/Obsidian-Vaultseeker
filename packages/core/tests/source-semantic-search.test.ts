import { describe, expect, it } from "vitest";
import { searchSourceSemanticVectors, type SourceChunkRecord, type SourceRecord, type VectorRecord } from "../src";

const modelNamespace = "ollama/nomic-embed-text:3";

const sources: SourceRecord[] = [
  source({
    id: "source:timer",
    sourcePath: "Sources/Datasheets/timer.pdf",
    filename: "timer.pdf",
    contentHash: "source-hash-timer"
  }),
  source({
    id: "source:paper",
    sourcePath: "Sources/Papers/memory-retrieval.pdf",
    filename: "memory-retrieval.pdf",
    contentHash: "source-hash-paper"
  }),
  source({
    id: "source:failed",
    status: "failed",
    sourcePath: "Sources/Failed/broken.pdf",
    filename: "broken.pdf"
  })
];

const chunks: SourceChunkRecord[] = [
  sourceChunk({
    id: "source-chunk:timer-reset",
    sourceId: "source:timer",
    sourcePath: "Sources/Datasheets/timer.pdf",
    sectionPath: ["Timer Datasheet", "Pins"],
    normalizedTextHash: "hash-reset",
    text: "Pin 1 controls reset behavior."
  }),
  sourceChunk({
    id: "source-chunk:paper-retrieval",
    sourceId: "source:paper",
    sourcePath: "Sources/Papers/memory-retrieval.pdf",
    sectionPath: ["Mimisbrunnr Retrieval"],
    normalizedTextHash: "hash-retrieval",
    text: "Governed memory retrieval keeps agent context bounded."
  }),
  sourceChunk({
    id: "source-chunk:failed",
    sourceId: "source:failed",
    sourcePath: "Sources/Failed/broken.pdf",
    normalizedTextHash: "hash-failed",
    text: "Failed source text should not be ranked."
  }),
  sourceChunk({
    id: "source-chunk:stale",
    sourceId: "source:timer",
    sourcePath: "Sources/Datasheets/timer.pdf",
    normalizedTextHash: "hash-current",
    text: "Current source chunk text."
  })
];

describe("searchSourceSemanticVectors", () => {
  it("returns ranked source workspaces with matched source chunk evidence", () => {
    const results = searchSourceSemanticVectors({
      queryVector: [1, 0, 0],
      modelNamespace,
      sources,
      chunks,
      vectors: [
        vector({ chunkId: "source-chunk:paper-retrieval", contentHash: "hash-retrieval", vector: [0.2, 0.8, 0] }),
        vector({ chunkId: "source-chunk:timer-reset", contentHash: "hash-reset", vector: [0.9, 0.1, 0] })
      ],
      limit: 5
    });

    expect(results.map((result) => result.sourcePath)).toEqual([
      "Sources/Datasheets/timer.pdf",
      "Sources/Papers/memory-retrieval.pdf"
    ]);
    expect(results[0]).toMatchObject({
      sourceId: "source:timer",
      filename: "timer.pdf",
      matchedChunks: [
        {
          chunkId: "source-chunk:timer-reset",
          sectionPath: ["Timer Datasheet", "Pins"],
          text: "Pin 1 controls reset behavior.",
          provenance: { kind: "unknown" }
        }
      ]
    });
    expect(results[0]!.score).toBeGreaterThan(results[1]!.score);
  });

  it("ignores failed sources, wrong namespace, wrong dimensions, stale hashes, missing chunks, and zero vectors", () => {
    const results = searchSourceSemanticVectors({
      queryVector: [1, 0, 0],
      modelNamespace,
      sources,
      chunks,
      vectors: [
        vector({ chunkId: "source-chunk:timer-reset", model: "ollama/other-model:3", contentHash: "hash-reset", vector: [1, 0, 0] }),
        vector({ chunkId: "source-chunk:paper-retrieval", dimensions: 2, contentHash: "hash-retrieval", vector: [1, 0] }),
        vector({ chunkId: "source-chunk:stale", contentHash: "old-hash", vector: [1, 0, 0] }),
        vector({ chunkId: "source-chunk:missing", contentHash: "hash-missing", vector: [1, 0, 0] }),
        vector({ chunkId: "source-chunk:failed", contentHash: "hash-failed", vector: [1, 0, 0] }),
        vector({ chunkId: "source-chunk:timer-reset", contentHash: "hash-reset", vector: [0, 0, 0] }),
        vector({ chunkId: "source-chunk:timer-reset", contentHash: "hash-reset", vector: [0.5, 0.5, 0] })
      ],
      limit: 5
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      sourceId: "source:timer",
      matchedChunks: [expect.objectContaining({ chunkId: "source-chunk:timer-reset" })]
    });
  });

  it("applies minimum score, per-source chunk limits, and deterministic result limits", () => {
    const results = searchSourceSemanticVectors({
      queryVector: [1, 0, 0],
      modelNamespace,
      sources,
      chunks: [
        ...chunks,
        sourceChunk({
          id: "source-chunk:timer-supply",
          sourceId: "source:timer",
          sourcePath: "Sources/Datasheets/timer.pdf",
          sectionPath: ["Timer Datasheet", "Electrical"],
          normalizedTextHash: "hash-supply",
          text: "Supply voltage ranges from 4.5V to 16V."
        })
      ],
      vectors: [
        vector({ chunkId: "source-chunk:paper-retrieval", contentHash: "hash-retrieval", vector: [0.6, 0.8, 0] }),
        vector({ chunkId: "source-chunk:timer-reset", contentHash: "hash-reset", vector: [1, 0, 0] }),
        vector({ chunkId: "source-chunk:timer-supply", contentHash: "hash-supply", vector: [0.95, 0.05, 0] })
      ],
      minScore: 0.8,
      maxChunksPerSource: 1,
      limit: 1
    });

    expect(results).toEqual([
      expect.objectContaining({
        sourceId: "source:timer",
        score: 1,
        matchedChunks: [expect.objectContaining({ chunkId: "source-chunk:timer-reset" })]
      })
    ]);
  });

  it("returns no results for empty or invalid query vectors", () => {
    expect(searchSourceSemanticVectors({ queryVector: [], modelNamespace, sources, chunks, vectors: [] })).toEqual([]);
    expect(searchSourceSemanticVectors({ queryVector: [0, 0, 0], modelNamespace, sources, chunks, vectors: [] })).toEqual([]);
    expect(searchSourceSemanticVectors({ queryVector: [1, Number.NaN, 0], modelNamespace, sources, chunks, vectors: [] })).toEqual([]);
  });
});

function source(overrides: Partial<SourceRecord>): SourceRecord {
  return {
    id: "source:id",
    status: "extracted",
    sourcePath: "Sources/source.pdf",
    filename: "source.pdf",
    extension: ".pdf",
    sizeBytes: 100,
    contentHash: "source-hash",
    importedAt: "2026-04-30T09:00:00.000Z",
    extractor: {
      id: "marker",
      name: "Marker",
      version: "1.0.0"
    },
    extractionOptions: {},
    extractedMarkdown: "# Source\n\nExtracted source text.",
    diagnostics: [],
    attachments: [],
    ...overrides
  };
}

function sourceChunk(overrides: Partial<SourceChunkRecord>): SourceChunkRecord {
  return {
    id: "source-chunk:id",
    sourceId: "source:id",
    sourcePath: "Sources/source.pdf",
    sectionPath: ["Source"],
    normalizedTextHash: "hash",
    ordinal: 0,
    text: "Extracted source text.",
    provenance: { kind: "unknown" },
    ...overrides
  };
}

function vector(overrides: Partial<VectorRecord>): VectorRecord {
  return {
    chunkId: "source-chunk:id",
    model: modelNamespace,
    dimensions: 3,
    contentHash: "hash",
    vector: [1, 0, 0],
    embeddedAt: "2026-04-30T09:30:00.000Z",
    ...overrides
  };
}
