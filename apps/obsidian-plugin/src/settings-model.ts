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
  nativeCodexEnabled: boolean;
  codexCommand: string;
  codexWorkingDirectory: string;
  managedSourceFolder: string;
  planFolder: string;
  releaseFolder: string;
};

export const DEFAULT_SOURCE_NOTE_FOLDER = "Source Notes";
export const DEFAULT_MANAGED_SOURCE_FOLDER = "Sources";
export const DEFAULT_PLAN_FOLDER = "Plans";
export const DEFAULT_RELEASE_FOLDER = "Releases";

export const DEFAULT_SETTINGS: VaultseerSettings = {
  excludedFolders: [".obsidian", "research"],
  semanticSearchEnabled: false,
  semanticIndexingEnabled: false,
  embeddingEndpoint: "http://localhost:11434",
  embeddingProviderId: "ollama",
  embeddingModelId: "nomic-embed-text",
  embeddingDimensions: 768,
  embeddingBatchSize: 8,
  sourceNoteFolder: DEFAULT_SOURCE_NOTE_FOLDER,
  nativeCodexEnabled: false,
  codexCommand: "codex",
  codexWorkingDirectory: "",
  managedSourceFolder: DEFAULT_MANAGED_SOURCE_FOLDER,
  planFolder: DEFAULT_PLAN_FOLDER,
  releaseFolder: DEFAULT_RELEASE_FOLDER
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
