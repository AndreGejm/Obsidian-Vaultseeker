import {
  buildVectorNamespace,
  searchSourceSemanticVectors,
  type EmbeddingModelProfile,
  type EmbeddingProviderPort,
  type SourceChunkRecord,
  type SourceRecord,
  type SourceSemanticSearchInput,
  type SourceSemanticSearchResult,
  type VaultseerStore,
  type VectorRecord
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
    const [sources, chunks, vectors] = await Promise.all([
      options.store.getSourceRecords(),
      options.store.getSourceChunkRecords(),
      options.store.getVectorRecords()
    ]);
    const modelNamespace = buildVectorNamespace(options.modelProfile);
    if (!hasEligibleSourceVectors({
      sources,
      chunks,
      vectors,
      modelNamespace,
      dimensions: options.modelProfile.dimensions
    })) {
      return {
        status: "ready",
        message: formatReadyMessage(0),
        results: []
      };
    }

    const queryVector = await embedQuery(options.provider, query, options.modelProfile.dimensions);
    const searchInput: SourceSemanticSearchInput = {
      queryVector,
      modelNamespace,
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

function hasEligibleSourceVectors(input: {
  sources: SourceRecord[];
  chunks: SourceChunkRecord[];
  vectors: VectorRecord[];
  modelNamespace: string;
  dimensions: number;
}): boolean {
  const extractedSourceIds = new Set(
    input.sources
      .filter((source) => source.status === "extracted")
      .map((source) => source.id)
  );
  const currentSourceChunks = new Map(
    input.chunks
      .filter((chunk) => extractedSourceIds.has(chunk.sourceId))
      .map((chunk) => [chunk.id, chunk])
  );

  return input.vectors.some((vector) => {
    if (vector.model !== input.modelNamespace) return false;
    if (vector.dimensions !== input.dimensions || vector.vector.length !== input.dimensions) return false;

    const chunk = currentSourceChunks.get(vector.chunkId);
    return Boolean(chunk && vector.contentHash === chunk.normalizedTextHash);
  });
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
