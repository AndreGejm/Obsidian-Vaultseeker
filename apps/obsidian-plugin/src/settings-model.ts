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
  codexProvider: CodexProviderId;
  openAiApiKey: string;
  openAiBaseUrl: string;
  nativeCodexEnabled: boolean;
  codexCommand: string;
  codexWorkingDirectory: string;
  codexModel: CodexModelId;
  codexReasoningEffort: CodexReasoningEffort;
  managedSourceFolder: string;
  planFolder: string;
  releaseFolder: string;
};

export const CODEX_PROVIDER_OPTIONS = ["acp", "openai"] as const;

export type CodexProviderId = (typeof CODEX_PROVIDER_OPTIONS)[number];

export const CODEX_MODEL_OPTIONS = [
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.3-codex",
  "gpt-5.3-codex-spark",
  "gpt-5.2"
] as const;

export type CodexModelId = (typeof CODEX_MODEL_OPTIONS)[number];

export const CODEX_REASONING_EFFORT_OPTIONS = ["low", "medium", "high", "xhigh"] as const;

export type CodexReasoningEffort = (typeof CODEX_REASONING_EFFORT_OPTIONS)[number];

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
  codexProvider: "acp",
  openAiApiKey: "",
  openAiBaseUrl: "https://api.openai.com/v1",
  nativeCodexEnabled: false,
  codexCommand: "codex-acp",
  codexWorkingDirectory: "",
  codexModel: "gpt-5.3-codex-spark",
  codexReasoningEffort: "medium",
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

export function normalizeCodexModel(value: unknown): CodexModelId {
  return includesString(CODEX_MODEL_OPTIONS, value) ? value : DEFAULT_SETTINGS.codexModel;
}

export function normalizeCodexProvider(value: unknown): CodexProviderId {
  return includesString(CODEX_PROVIDER_OPTIONS, value) ? value : DEFAULT_SETTINGS.codexProvider;
}

export function normalizeCodexReasoningEffort(value: unknown): CodexReasoningEffort {
  return includesString(CODEX_REASONING_EFFORT_OPTIONS, value)
    ? value
    : DEFAULT_SETTINGS.codexReasoningEffort;
}

function includesString<const T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "string" && values.includes(value);
}
