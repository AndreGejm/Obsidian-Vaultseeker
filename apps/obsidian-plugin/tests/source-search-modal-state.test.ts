import { describe, expect, it } from "vitest";
import type { SourceChunkRecord, SourceRecord, SourceSemanticSearchResult } from "@vaultseer/core";
import { buildSourceSearchModalState } from "../src/source-search-modal-state";
import type { SourceSemanticSearchControllerResult } from "../src/source-semantic-search-controller";

const sources: SourceRecord[] = [
  source({
    id: "source:timer",
    sourcePath: "Sources/Datasheets/timer.pdf",
    filename: "timer.pdf"
  })
];

const chunks: SourceChunkRecord[] = [
  sourceChunk({
    id: "source-chunk:timer-reset",
    sourceId: "source:timer",
    sourcePath: "Sources/Datasheets/timer.pdf",
    text: "Pin 1 controls reset behavior."
  })
];

describe("buildSourceSearchModalState", () => {
  it("returns explainable lexical source results", () => {
    const state = buildSourceSearchModalState({
      query: "reset behavior",
      sources,
      chunks
    });

    expect(state).toEqual({
      status: "ready",
      message: "1 source result found.",
      results: [
        expect.objectContaining({
          sourceId: "source:timer",
          sourcePath: "Sources/Datasheets/timer.pdf",
          filename: "timer.pdf",
          source: "lexical",
          reason: "reset in body; behavior in body",
          excerpt: "Pin 1 controls reset behavior."
        })
      ]
    });
  });

  it("shows an empty-state message before source workspaces exist", () => {
    expect(
      buildSourceSearchModalState({
        query: "",
        sources: [],
        chunks: []
      })
    ).toEqual({
      status: "ready",
      message: "No source workspaces are stored yet.",
      results: []
    });
  });

  it("merges lexical and semantic evidence for the same source", () => {
    const semantic: SourceSemanticSearchControllerResult = {
      status: "ready",
      message: "1 source semantic result found.",
      results: [
        semanticResult({
          score: 0.92
        })
      ]
    };

    const state = buildSourceSearchModalState({
      query: "reset",
      sources,
      chunks,
      semantic
    });

    expect(state.results).toEqual([
      expect.objectContaining({
        sourceId: "source:timer",
        source: "hybrid",
        score: 1,
        reason: "reset in body; semantic match 0.92 in Timer"
      })
    ]);
  });

  it("keeps lexical results visible when semantic search degrades", () => {
    const semantic: SourceSemanticSearchControllerResult = {
      status: "degraded",
      message: "Source semantic search failed: provider offline",
      results: []
    };

    const state = buildSourceSearchModalState({
      query: "reset",
      sources,
      chunks,
      semantic
    });

    expect(state.message).toBe("1 source result found. Source semantic search failed: provider offline");
    expect(state.results).toHaveLength(1);
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
    importedAt: "2026-05-01T07:00:00.000Z",
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
    sectionPath: ["Timer"],
    normalizedTextHash: "hash",
    ordinal: 0,
    text: "Extracted source text.",
    provenance: { kind: "unknown" },
    ...overrides
  };
}

function semanticResult(overrides: Partial<SourceSemanticSearchResult>): SourceSemanticSearchResult {
  return {
    sourceId: "source:timer",
    sourcePath: "Sources/Datasheets/timer.pdf",
    filename: "timer.pdf",
    score: 0.9,
    matchedChunks: [
      {
        chunkId: "source-chunk:timer-reset",
        sectionPath: ["Timer"],
        text: "Pin 1 controls reset behavior.",
        provenance: { kind: "unknown" },
        score: 0.92
      }
    ],
    ...overrides
  };
}
