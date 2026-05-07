import { describe, expect, it } from "vitest";
import {
  buildVaultSnapshot,
  buildVectorNamespace,
  chunkVaultInputs,
  InMemoryVaultseerStore,
  type EmbeddingProviderPort,
  type NoteRecordInput,
  type VectorRecord
} from "@vaultseer/core";
import { searchSemanticIndex } from "../src/semantic-search-controller";

const modelProfile = {
  providerId: "ollama",
  modelId: "nomic-embed-text",
  dimensions: 3
};
const modelNamespace = buildVectorNamespace(modelProfile);

const noteInputs: NoteRecordInput[] = [
  {
    path: "Notes/Ragnarok.md",
    basename: "Ragnarok",
    content: "# Ragnarok\n\nMythic ending and renewal.",
    stat: { ctime: 1, mtime: 2, size: 40 },
    metadata: {
      frontmatter: { tags: ["mythology"] },
      tags: ["#mythology"],
      links: [],
      headings: [{ level: 1, heading: "Ragnarok", position: { line: 0, column: 1 } }]
    }
  },
  {
    path: "Notes/Yggdrasil.md",
    basename: "Yggdrasil",
    content: "# Yggdrasil\n\nWorld tree and cosmic structure.",
    stat: { ctime: 3, mtime: 4, size: 44 },
    metadata: {
      frontmatter: { tags: ["cosmology"] },
      tags: ["#cosmology"],
      links: [],
      headings: [{ level: 1, heading: "Yggdrasil", position: { line: 0, column: 1 } }]
    }
  }
];

class FakeQueryEmbeddingProvider implements EmbeddingProviderPort {
  readonly embeddedTexts: string[] = [];

  constructor(private readonly result: number[][] | Error) {}

  async embedTexts(texts: string[]): Promise<number[][]> {
    this.embeddedTexts.push(...texts);
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

async function createVectorStore(): Promise<InMemoryVaultseerStore> {
  const store = new InMemoryVaultseerStore();
  const snapshot = buildVaultSnapshot(noteInputs);
  const chunks = chunkVaultInputs(noteInputs);
  await store.replaceNoteIndex(snapshot, "2026-04-29T23:50:00.000Z", chunks);
  const vectors: VectorRecord[] = [
    {
      chunkId: chunks[0]!.id,
      model: modelNamespace,
      dimensions: 3,
      contentHash: chunks[0]!.normalizedTextHash,
      vector: [1, 0, 0],
      embeddedAt: "2026-04-29T23:55:00.000Z"
    },
    {
      chunkId: chunks[1]!.id,
      model: modelNamespace,
      dimensions: 3,
      contentHash: chunks[1]!.normalizedTextHash,
      vector: [0, 1, 0],
      embeddedAt: "2026-04-29T23:55:00.000Z"
    }
  ];
  await store.replaceVectorRecords(vectors);
  return store;
}

describe("searchSemanticIndex", () => {
  it("returns disabled without calling the provider when semantic search is off", async () => {
    const store = await createVectorStore();
    const provider = new FakeQueryEmbeddingProvider([[1, 0, 0]]);

    const result = await searchSemanticIndex({
      enabled: false,
      store,
      provider,
      modelProfile,
      query: "ragnarok",
      limit: 5
    });

    expect(result).toEqual({
      status: "disabled",
      message: "Semantic search is disabled in settings.",
      results: []
    });
    expect(provider.embeddedTexts).toEqual([]);
  });

  it("embeds the query and returns semantic note results from stored vectors", async () => {
    const store = await createVectorStore();
    const provider = new FakeQueryEmbeddingProvider([[0.9, 0.1, 0]]);

    const result = await searchSemanticIndex({
      enabled: true,
      store,
      provider,
      modelProfile,
      query: "mythic ending",
      limit: 5
    });

    expect(result).toMatchObject({
      status: "ready",
      message: "2 semantic results found.",
      results: [
        {
          notePath: "Notes/Ragnarok.md",
          title: "Ragnarok",
          matchedChunks: [expect.objectContaining({ text: "Mythic ending and renewal." })]
        },
        {
          notePath: "Notes/Yggdrasil.md",
          title: "Yggdrasil"
        }
      ]
    });
    expect(provider.embeddedTexts).toEqual(["mythic ending"]);
  });

  it("reports degraded provider failures without mutating stored vectors", async () => {
    const store = await createVectorStore();
    const beforeVectors = await store.getVectorRecords();
    const provider = new FakeQueryEmbeddingProvider(new Error("Ollama offline"));

    const result = await searchSemanticIndex({
      enabled: true,
      store,
      provider,
      modelProfile,
      query: "mythic ending"
    });

    expect(result).toEqual({
      status: "degraded",
      message: "Semantic search is unavailable. Lexical search still works.",
      results: []
    });
    await expect(store.getVectorRecords()).resolves.toEqual(beforeVectors);
  });

  it("reports degraded provider shape errors", async () => {
    const store = await createVectorStore();
    const provider = new FakeQueryEmbeddingProvider([[1, 0]]);

    await expect(
      searchSemanticIndex({
        enabled: true,
        store,
        provider,
        modelProfile,
        query: "mythic ending"
      })
    ).resolves.toEqual({
      status: "degraded",
      message: "Semantic search is unavailable. Lexical search still works.",
      results: []
    });
  });

  it("does not call the provider for blank queries", async () => {
    const store = await createVectorStore();
    const provider = new FakeQueryEmbeddingProvider([[1, 0, 0]]);

    const result = await searchSemanticIndex({
      enabled: true,
      store,
      provider,
      modelProfile,
      query: " "
    });

    expect(result).toEqual({
      status: "ready",
      message: "Type a topic to run semantic search over embedded chunks.",
      results: []
    });
    expect(provider.embeddedTexts).toEqual([]);
  });
});
