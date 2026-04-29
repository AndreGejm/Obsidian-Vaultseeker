import {
  buildVectorNamespace,
  searchSemanticVectors,
  type EmbeddingModelProfile,
  type EmbeddingProviderPort,
  type SemanticSearchInput,
  type SemanticSearchResult,
  type VaultseerStore
} from "@vaultseer/core";

export type SemanticSearchStatus = "disabled" | "ready" | "degraded";

export type SemanticSearchControllerResult = {
  status: SemanticSearchStatus;
  message: string;
  results: SemanticSearchResult[];
};

export type SearchSemanticIndexOptions = {
  enabled: boolean;
  store: VaultseerStore;
  provider: EmbeddingProviderPort;
  modelProfile: EmbeddingModelProfile;
  query: string;
  limit?: number;
  minScore?: number;
  maxChunksPerNote?: number;
};

export async function searchSemanticIndex(options: SearchSemanticIndexOptions): Promise<SemanticSearchControllerResult> {
  if (!options.enabled) {
    return {
      status: "disabled",
      message: "Semantic search is disabled in settings.",
      results: []
    };
  }

  const query = options.query.trim();
  if (!query) {
    return {
      status: "ready",
      message: "Type a topic to run semantic search over embedded chunks.",
      results: []
    };
  }

  try {
    const [notes, chunks, vectors, queryVector] = await Promise.all([
      options.store.getNoteRecords(),
      options.store.getChunkRecords(),
      options.store.getVectorRecords(),
      embedQuery(options.provider, query, options.modelProfile.dimensions)
    ]);
    const modelNamespace = buildVectorNamespace(options.modelProfile);
    const searchInput: SemanticSearchInput = {
      queryVector,
      modelNamespace,
      notes,
      chunks,
      vectors
    };
    if (options.limit !== undefined) searchInput.limit = options.limit;
    if (options.minScore !== undefined) searchInput.minScore = options.minScore;
    if (options.maxChunksPerNote !== undefined) searchInput.maxChunksPerNote = options.maxChunksPerNote;

    const results = searchSemanticVectors(searchInput);

    return {
      status: "ready",
      message: formatReadyMessage(results.length),
      results
    };
  } catch (error) {
    return {
      status: "degraded",
      message: `Semantic search failed: ${getErrorMessage(error)}`,
      results: []
    };
  }
}

async function embedQuery(
  provider: EmbeddingProviderPort,
  query: string,
  expectedDimensions: number
): Promise<number[]> {
  const embeddings = await provider.embedTexts([query]);

  if (embeddings.length !== 1) {
    throw new Error(`Query embedding returned ${embeddings.length} vectors; expected 1.`);
  }

  const queryVector = embeddings[0]!;
  if (queryVector.length !== expectedDimensions) {
    throw new Error(`Query embedding returned ${queryVector.length} dimensions; expected ${expectedDimensions}.`);
  }

  return queryVector;
}

function formatReadyMessage(resultCount: number): string {
  if (resultCount === 0) return "No semantic results found.";
  return `${resultCount} semantic ${resultCount === 1 ? "result" : "results"} found.`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
