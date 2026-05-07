import { describe, expect, it } from "vitest";
import type { SourceChunkRecord, SourceRecord } from "@vaultseer/core";
import { buildSourceSearchModalQueryState } from "../src/source-search-modal-query";
import type { SourceSemanticSearchControllerResult } from "../src/source-semantic-search-controller";

const sources: SourceRecord[] = [
  {
    id: "source:timer",
    status: "extracted",
    sourcePath: "Sources/Datasheets/timer.pdf",
    filename: "timer.pdf",
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
    extractedMarkdown: "# Timer\n\nPin 1 controls reset behavior.",
    diagnostics: [],
    attachments: []
  }
];

const chunks: SourceChunkRecord[] = [
  {
    id: "source-chunk:timer-reset",
    sourceId: "source:timer",
    sourcePath: "Sources/Datasheets/timer.pdf",
    sectionPath: ["Timer"],
    normalizedTextHash: "hash-reset",
    ordinal: 0,
    text: "Pin 1 controls reset behavior.",
    provenance: { kind: "unknown" }
  }
];

describe("buildSourceSearchModalQueryState", () => {
  it("runs semantic source search only after lexical source search is usable", async () => {
    const semanticSearch = async (): Promise<SourceSemanticSearchControllerResult> => ({
      status: "ready",
      message: "No source semantic results found.",
      results: []
    });

    const state = await buildSourceSearchModalQueryState({
      query: "reset",
      sources,
      chunks,
      semanticSearch
    });

    expect(state).toMatchObject({
      status: "ready",
      message: "1 source result found.",
      results: [expect.objectContaining({ sourceId: "source:timer", source: "lexical" })]
    });
  });

  it("keeps lexical source results when semantic source search throws", async () => {
    const state = await buildSourceSearchModalQueryState({
      query: "reset",
      sources,
      chunks,
      semanticSearch: async () => {
        throw new Error("provider offline");
      }
    });

    expect(state.message).toBe("1 source result found. Source semantic search is unavailable. Lexical search still works.");
    expect(state.message).not.toContain("provider offline");
    expect(state.results).toHaveLength(1);
  });

  it("does not run semantic source search when no extracted source workspace is searchable", async () => {
    let semanticCalls = 0;

    const state = await buildSourceSearchModalQueryState({
      query: "reset",
      sources: [
        {
          ...sources[0]!,
          status: "failed",
          diagnostics: [
            {
              level: "error",
              message: "Extraction failed."
            }
          ]
        }
      ],
      chunks: [],
      semanticSearch: async () => {
        semanticCalls += 1;
        return {
          status: "ready",
          message: "No source semantic results found.",
          results: []
        };
      }
    });

    expect(state).toEqual({
      status: "ready",
      message: "No source workspaces are stored yet.",
      results: []
    });
    expect(semanticCalls).toBe(0);
  });
});
