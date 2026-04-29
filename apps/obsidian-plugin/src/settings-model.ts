export type VaultseerSettings = {
  excludedFolders: string[];
  semanticSearchEnabled: boolean;
  embeddingEndpoint: string;
};

export const DEFAULT_SETTINGS: VaultseerSettings = {
  excludedFolders: [".obsidian", "research"],
  semanticSearchEnabled: false,
  embeddingEndpoint: "http://localhost:11434"
};
