import { buildStudioState, type CodexRuntimeStatus, type IndexStatus, type StudioModeId } from "@vaultseer/core";

export type StudioStateNoteSummary = {
  path: string;
  title: string;
  aliases: string[];
  tags: string[];
};

export type BuildPluginStudioStateInput = {
  requestedMode: StudioModeId | null;
  activePath: string | null;
  notes: StudioStateNoteSummary[];
  indexStatus: IndexStatus;
  codexRuntimeStatus: CodexRuntimeStatus;
};

export type PluginStudioState = {
  title: string;
  activeMode: StudioModeId;
  activeNoteLabel: string;
  activeNotePath: string | null;
  modes: Array<{
    id: StudioModeId;
    label: string;
    status: string;
    message: string;
    selected: boolean;
  }>;
};

export function buildPluginStudioState(input: BuildPluginStudioStateInput): PluginStudioState {
  const coreState = buildStudioState({
    requestedMode: input.requestedMode,
    activePath: input.activePath,
    indexedNotePaths: input.notes.map((note) => note.path),
    codexRuntimeStatus: input.codexRuntimeStatus,
    indexStatus: input.indexStatus
  });
  const activeNote = input.notes.find((note) => note.path === input.activePath);

  return {
    title: "Vaultseer Studio",
    activeMode: coreState.activeMode,
    activeNoteLabel: activeNote?.title ?? (input.activePath ? "Active note not indexed" : "No active note"),
    activeNotePath: input.activePath,
    modes: coreState.availableModes.map((mode) => ({
      id: mode.id,
      label: mode.label,
      status: mode.status,
      message: mode.message,
      selected: mode.id === coreState.activeMode
    }))
  };
}
