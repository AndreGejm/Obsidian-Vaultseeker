import { describe, expect, it } from "vitest";
import {
  buildVectorNamespace,
  InMemoryVaultseerStore,
  type EmbeddingProviderPort,
  type SourceChunkRecord,
  type SourceRecord,
  type VectorRecord
} from "@vaultseer/core";
import { searchSourceSemanticIndex } from "../src/source-semantic-search-controller";

const modelProfile = {
  providerId: "ollama",
  modelId: "nomic-embed-text",
  dimensions: 3
};
const modelNamespace = buildVectorNamespace(modelProfile);

class FakeEmbeddingProvider implements EmbeddingProviderPort {
  readonly embeddedTexts: string[] = [];

  constructor(private readonly result: number[][] | Error) {}

  async embedTexts(texts: string[]): Promise<number[][]> {
    this.embeddedTexts.push(...texts);
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

describe("searchSourceSemanticIndex", () => {
  it("embeds the query and ranks stored source vectors without mutating notes", async () => {
    const store = await createStore();
    const provider = new FakeEmbeddingProvider([[1, 0, 0]]);

    const result = await searchSourceSemanticIndex({
      enabled: true,
      store,
      provider,
      modelProfile,
      query: "reset behavior",
      limit: 5,
      minScore: 0.1,
      maxChunksPerSource: 2
    });

    expect(result).toMatchObject({
      status: "ready",
      message: "1 source semantic result found.",
      results: [
        {
          sourceId: "source:timer",
          sourcePath: "Sources/Datasheets/timer.pdf",
          filename: "timer.pdf",
          matchedChunks: [
            expect.objectContaining({
              chunkId: "source-chunk:timer-reset",
              text: "Pin 1 controls reset behavior."
            })
          ]
        }
      ]
    });
    expect(provider.embeddedTexts).toEqual(["reset behavior"]);
  });

  it("does not call the provider when disabled or blank", async () => {
    const store = await createStore();
    const provider = new FakeEmbeddingProvider([[1, 0, 0]]);

    await expect(
      searchSourceSemanticIndex({
        enabled: false,
        store,
        provider,
        modelProfile,
        query: "reset"
      })
    ).resolves.toEqual({
      status: "disabled",
      message: "Source semantic search is disabled in settings.",
      results: []
    });

    await expect(
      searchSourceSemanticIndex({
        enabled: true,
        store,
        provider,
        modelProfile,
        query: "   "
      })
    ).resolves.toEqual({
      status: "ready",
      message: "Type a topic to run semantic search over embedded source chunks.",
      results: []
    });
    expect(provider.embeddedTexts).toEqual([]);
  });

  it("returns degraded results when the provider fails", async () => {
    const store = await createStore();
    const provider = new FakeEmbeddingProvider(new Error("provider offline"));

    await expect(
      searchSourceSemanticIndex({
        enabled: true,
        store,
        provider,
        modelProfile,
        query: "reset"
      })
    ).resolves.toEqual({
      status: "degraded",
      message: "Source semantic search is unavailable. Lexical search still works.",
      results: []
    });
  });

  it("does not call the provider when no eligible source vectors exist", async () => {
    const store = new InMemoryVaultseerStore();
    const sources = [source({})];
    const chunks = [sourceChunk({})];
    await store.replaceSourceWorkspace(sources, chunks);
    await store.replaceVectorRecords([
      {
        chunkId: chunks[0]!.id,
        model: "ollama/other-model:3",
        dimensions: 3,
        contentHash: chunks[0]!.normalizedTextHash,
        vector: [1, 0, 0],
        embeddedAt: "2026-05-01T08:00:00.000Z"
      }
    ]);
    const provider = new FakeEmbeddingProvider(new Error("provider should not be called"));

    await expect(
      searchSourceSemanticIndex({
        enabled: true,
        store,
        provider,
        modelProfile,
        query: "reset"
      })
    ).resolves.toEqual({
      status: "ready",
      message: "No source semantic results found.",
      results: []
    });
    expect(provider.embeddedTexts).toEqual([]);
  });
});

async function createStore(): Promise<InMemoryVaultseerStore> {
  const store = new InMemoryVaultseerStore();
  const sources = [source({})];
  const chunks = [sourceChunk({})];
  const vectors: VectorRecord[] = [
    {
      chunkId: chunks[0]!.id,
      model: modelNamespace,
      dimensions: 3,
      contentHash: chunks[0]!.normalizedTextHash,
      vector: [1, 0, 0],
      embeddedAt: "2026-05-01T08:00:00.000Z"
    }
  ];
  await store.replaceSourceWorkspace(sources, chunks);
  await store.replaceVectorRecords(vectors);
  return store;
}

function source(overrides: Partial<SourceRecord>): SourceRecord {
  return {
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
    attachments: [],
    ...overrides
  };
}

function sourceChunk(overrides: Partial<SourceChunkRecord>): SourceChunkRecord {
  return {
    id: "source-chunk:timer-reset",
    sourceId: "source:timer",
    sourcePath: "Sources/Datasheets/timer.pdf",
    sectionPath: ["Timer"],
    normalizedTextHash: "hash-reset",
    ordinal: 0,
    text: "Pin 1 controls reset behavior.",
    provenance: { kind: "unknown" },
    ...overrides
  };
}
