import type { IndexStatus } from "../storage/types";

export type StudioModeId = "note" | "chat" | "search" | "sources" | "plans" | "releases" | "review";

export type CodexRuntimeStatus = "disabled" | "stopped" | "starting" | "running" | "failed" | "stopping";

export type StudioModeStatus = "ready" | "blocked" | "degraded";

export type StudioModeSummary = {
  id: StudioModeId;
  label: string;
  status: StudioModeStatus;
  message: string;
};

export type StudioCurrentNoteStatus = "indexed" | "not_indexed" | "none";

export type BuildStudioStateInput = {
  requestedMode: StudioModeId | null;
  activePath: string | null;
  indexedNotePaths: string[];
  codexRuntimeStatus: CodexRuntimeStatus;
  indexStatus: IndexStatus;
};

export type StudioState = {
  activeMode: StudioModeId;
  currentNoteStatus: StudioCurrentNoteStatus;
  availableModes: StudioModeSummary[];
  modeSummaries: Record<StudioModeId, StudioModeSummary>;
};
