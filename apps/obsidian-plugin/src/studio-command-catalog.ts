export type VaultseerStudioCommandGroupId = "notes" | "sources" | "review" | "semantic" | "studio";

export type VaultseerStudioCommandGroupDefinition = {
  id: VaultseerStudioCommandGroupId;
  label: string;
};

export type VaultseerStudioCommandDefinition = {
  id: string;
  name: string;
  group: VaultseerStudioCommandGroupId;
  quickActionLabel?: string;
};

export type VaultseerStudioCommand = VaultseerStudioCommandDefinition & {
  run: () => Promise<void>;
};

export type VaultseerStudioCommandGroup<TCommand extends VaultseerStudioCommandDefinition> = {
  id: VaultseerStudioCommandGroupId;
  label: string;
  commands: TCommand[];
};

export const VAULTSEER_STUDIO_COMMAND_GROUPS: VaultseerStudioCommandGroupDefinition[] = [
  { id: "notes", label: "Notes and search" },
  { id: "sources", label: "Sources and extraction" },
  { id: "review", label: "Review and writes" },
  { id: "semantic", label: "Semantic indexing" },
  { id: "studio", label: "Studio and Codex" }
];

export const VAULTSEER_STUDIO_COMMAND_DEFINITIONS: VaultseerStudioCommandDefinition[] = [
  { id: "rebuild-index", name: "Rebuild read-only vault index", group: "notes", quickActionLabel: "Index" },
  { id: "clear-index", name: "Clear read-only vault index", group: "notes" },
  { id: "show-index-health", name: "Check read-only vault index health", group: "notes" },
  { id: "search-index", name: "Search read-only vault index", group: "notes", quickActionLabel: "Search notes" },
  {
    id: "search-source-workspaces",
    name: "Search stored source workspaces",
    group: "notes",
    quickActionLabel: "Search sources"
  },
  {
    id: "open-write-review-queue",
    name: "Open guarded write review queue",
    group: "review",
    quickActionLabel: "Review writes"
  },
  { id: "import-active-text-source", name: "Import active text/code file as source workspace", group: "sources" },
  { id: "choose-text-source-file", name: "Choose text/code file to import as source workspace", group: "sources" },
  { id: "plan-source-extraction-queue", name: "Plan PDF source extraction queue", group: "sources" },
  { id: "show-source-extraction-queue-status", name: "Show source extraction queue status", group: "sources" },
  { id: "run-source-extraction-batch", name: "Run one PDF source extraction batch", group: "sources" },
  { id: "recover-source-extraction-queue", name: "Recover interrupted source extraction jobs", group: "sources" },
  { id: "cancel-source-extraction-queue", name: "Cancel active source extraction jobs", group: "sources" },
  { id: "open-workbench", name: "Open read-only workbench", group: "notes" },
  { id: "open-studio", name: "Open native Studio", group: "studio" },
  { id: "check-native-codex-setup", name: "Check native Codex setup", group: "studio" },
  { id: "reset-native-codex-session", name: "Reset native Codex session", group: "studio" },
  {
    id: "plan-semantic-index",
    name: "Plan semantic indexing queue",
    group: "semantic",
    quickActionLabel: "Plan vectors"
  },
  { id: "run-semantic-index-batch", name: "Run one semantic indexing batch", group: "semantic" },
  { id: "cancel-semantic-index-queue", name: "Cancel active semantic indexing jobs", group: "semantic" },
  { id: "plan-source-semantic-index", name: "Plan source semantic indexing queue", group: "semantic" },
  { id: "run-source-semantic-index-batch", name: "Run one source semantic indexing batch", group: "semantic" },
  { id: "cancel-source-semantic-index-queue", name: "Cancel active source semantic indexing jobs", group: "semantic" }
];

export function groupVaultseerStudioCommands<TCommand extends VaultseerStudioCommandDefinition>(
  commands: TCommand[]
): VaultseerStudioCommandGroup<TCommand>[] {
  return VAULTSEER_STUDIO_COMMAND_GROUPS.map((group) => ({
    ...group,
    commands: commands.filter((command) => command.group === group.id)
  })).filter((group) => group.commands.length > 0);
}

export function getVaultseerQuickCommands<TCommand extends VaultseerStudioCommandDefinition>(
  commands: TCommand[]
): TCommand[] {
  return commands.filter((command) => command.quickActionLabel !== undefined);
}
