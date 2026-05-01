import {
  buildVectorNamespace,
  searchSourceSemanticVectors,
  type EmbeddingModelProfile,
  type EmbeddingProviderPort,
  type SourceSemanticSearchInput,
  type SourceSemanticSearchResult,
  type VaultseerStore
} from "@vaultseer/core";

export type SourceSemanticSearchStatus = "disabled" | "ready" | "degraded";

export type SourceSemanticSearchControllerResult = {
  status: SourceSemanticSearchStatus;
  message: string;
  results: SourceSemanticSearchResult[];
};

export type SearchSourceSemanticIndexOptions = {
  enabled: boolean;
  store: VaultseerStore;
  provider: EmbeddingProviderPort;
  modelProfile: EmbeddingModelProfile;
  query: string;
  limit?: number;
  minScore?: number;
  maxChunksPerSource?: number;
};

export async function searchSourceSemanticIndex(
  options: SearchSourceSemanticIndexOptions
): Promise<SourceSemanticSearchControllerResult> {
  if (!options.enabled) {
    return {
      status: "disabled",
      message: "Source semantic search is disabled in settings.",
      results: []
    };
  }

  const query = options.query.trim();
  if (!query) {
    return {
      status: "ready",
      message: "Type a topic to run semantic search over embedded source chunks.",
      results: []
    };
  }

  try {
    const [sources, chunks, vectors, queryVector] = await Promise.all([
      options.store.getSourceRecords(),
      options.store.getSourceChunkRecords(),
      options.store.getVectorRecords(),
      embedQuery(options.provider, query, options.modelProfile.dimensions)
    ]);
    const searchInput: SourceSemanticSearchInput = {
      queryVector,
      modelNamespace: buildVectorNamespace(options.modelProfile),
      sources,
      chunks,
      vectors
    };
    if (options.limit !== undefined) searchInput.limit = options.limit;
    if (options.minScore !== undefined) searchInput.minScore = options.minScore;
    if (options.maxChunksPerSource !== undefined) searchInput.maxChunksPerSource = options.maxChunksPerSource;

    const results = searchSourceSemanticVectors(searchInput);

    return {
      status: "ready",
      message: formatReadyMessage(results.length),
      results
    };
  } catch (error) {
    return {
      status: "degraded",
      message: `Source semantic search failed: ${getErrorMessage(error)}`,
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
    throw new Error(`Source query embedding returned ${embeddings.length} vectors; expected 1.`);
  }

  const queryVector = embeddings[0]!;
  if (queryVector.length !== expectedDimensions) {
    throw new Error(`Source query embedding returned ${queryVector.length} dimensions; expected ${expectedDimensions}.`);
  }

  return queryVector;
}

function formatReadyMessage(resultCount: number): string {
  if (resultCount === 0) return "No source semantic results found.";
  return `${resultCount} source semantic ${resultCount === 1 ? "result" : "results"} found.`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
