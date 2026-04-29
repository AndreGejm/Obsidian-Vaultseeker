export type VaultseerSettings = {
  excludedFolders: string[];
  semanticSearchEnabled: boolean;
  semanticIndexingEnabled: boolean;
  embeddingEndpoint: string;
  embeddingProviderId: string;
  embeddingModelId: string;
  embeddingDimensions: number;
  embeddingBatchSize: number;
};

export const DEFAULT_SETTINGS: VaultseerSettings = {
  excludedFolders: [".obsidian", "research"],
  semanticSearchEnabled: false,
  semanticIndexingEnabled: false,
  embeddingEndpoint: "http://localhost:11434",
  embeddingProviderId: "ollama",
  embeddingModelId: "nomic-embed-text",
  embeddingDimensions: 768,
  embeddingBatchSize: 8
};
