export type VaultseerSettings = {
  excludedFolders: string[];
  semanticSearchEnabled: boolean;
  semanticIndexingEnabled: boolean;
  embeddingEndpoint: string;
  embeddingProviderId: string;
  embeddingModelId: string;
  embeddingDimensions: number;
  embeddingBatchSize: number;
  sourceNoteFolder: string;
};

export const DEFAULT_SOURCE_NOTE_FOLDER = "Source Notes";

export const DEFAULT_SETTINGS: VaultseerSettings = {
  excludedFolders: [".obsidian", "research"],
  semanticSearchEnabled: false,
  semanticIndexingEnabled: false,
  embeddingEndpoint: "http://localhost:11434",
  embeddingProviderId: "ollama",
  embeddingModelId: "nomic-embed-text",
  embeddingDimensions: 768,
  embeddingBatchSize: 8,
  sourceNoteFolder: DEFAULT_SOURCE_NOTE_FOLDER
};

export function normalizeVaultFolderPath(value: unknown, fallback = DEFAULT_SOURCE_NOTE_FOLDER): string {
  if (typeof value !== "string") return fallback;
  const normalized = value
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .trim();
  return normalized.length > 0 ? normalized : fallback;
}
