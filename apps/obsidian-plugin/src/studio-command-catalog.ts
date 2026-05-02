export type VaultseerStudioCommandDefinition = {
  id: string;
  name: string;
};

export type VaultseerStudioCommand = VaultseerStudioCommandDefinition & {
  run: () => Promise<void>;
};

export const VAULTSEER_STUDIO_COMMAND_DEFINITIONS: VaultseerStudioCommandDefinition[] = [
  { id: "rebuild-index", name: "Rebuild read-only vault index" },
  { id: "clear-index", name: "Clear read-only vault index" },
  { id: "show-index-health", name: "Check read-only vault index health" },
  { id: "search-index", name: "Search read-only vault index" },
  { id: "search-source-workspaces", name: "Search stored source workspaces" },
  { id: "open-write-review-queue", name: "Open guarded write review queue" },
  { id: "import-active-text-source", name: "Import active text/code file as source workspace" },
  { id: "choose-text-source-file", name: "Choose text/code file to import as source workspace" },
  { id: "plan-source-extraction-queue", name: "Plan PDF source extraction queue" },
  { id: "show-source-extraction-queue-status", name: "Show source extraction queue status" },
  { id: "run-source-extraction-batch", name: "Run one PDF source extraction batch" },
  { id: "recover-source-extraction-queue", name: "Recover interrupted source extraction jobs" },
  { id: "cancel-source-extraction-queue", name: "Cancel active source extraction jobs" },
  { id: "open-workbench", name: "Open read-only workbench" },
  { id: "open-studio", name: "Open native Studio" },
  { id: "check-native-codex-setup", name: "Check native Codex setup" },
  { id: "reset-native-codex-session", name: "Reset native Codex session" },
  { id: "plan-semantic-index", name: "Plan semantic indexing queue" },
  { id: "run-semantic-index-batch", name: "Run one semantic indexing batch" },
  { id: "cancel-semantic-index-queue", name: "Cancel active semantic indexing jobs" },
  { id: "plan-source-semantic-index", name: "Plan source semantic indexing queue" },
  { id: "run-source-semantic-index-batch", name: "Run one source semantic indexing batch" },
  { id: "cancel-source-semantic-index-queue", name: "Cancel active source semantic indexing jobs" }
];
