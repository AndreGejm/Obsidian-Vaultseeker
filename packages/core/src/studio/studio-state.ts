import type {
  BuildStudioStateInput,
  StudioCurrentNoteStatus,
  StudioModeId,
  StudioModeSummary,
  StudioModeStatus,
  StudioState
} from "./types";

const MODE_LABELS: Record<StudioModeId, string> = {
  note: "Note",
  chat: "Chat",
  search: "Search",
  sources: "Sources",
  plans: "Plans",
  releases: "Releases",
  review: "Review"
};

const MODE_ORDER: StudioModeId[] = ["note", "chat", "search", "sources", "plans", "releases", "review"];

export function buildStudioState(input: BuildStudioStateInput): StudioState {
  const currentNoteStatus = getCurrentNoteStatus(input.activePath, input.indexedNotePaths);
  const modeSummaries = Object.fromEntries(
    MODE_ORDER.map((mode) => [mode, buildModeSummary(mode, input, currentNoteStatus)])
  ) as Record<StudioModeId, StudioModeSummary>;

  return {
    activeMode: input.requestedMode ?? "note",
    currentNoteStatus,
    availableModes: MODE_ORDER.map((mode) => modeSummaries[mode]),
    modeSummaries
  };
}

function getCurrentNoteStatus(activePath: string | null, indexedNotePaths: string[]): StudioCurrentNoteStatus {
  if (!activePath) return "none";
  return indexedNotePaths.includes(activePath) ? "indexed" : "not_indexed";
}

function buildModeSummary(
  id: StudioModeId,
  input: BuildStudioStateInput,
  currentNoteStatus: StudioCurrentNoteStatus
): StudioModeSummary {
  if (id === "note" && currentNoteStatus === "none") {
    return summary(id, "blocked", "Open a Markdown note to use note mode.");
  }

  if (id === "note" && currentNoteStatus === "not_indexed") {
    return summary(id, "degraded", "The active note is not in the current Vaultseer index.");
  }

  if (id === "chat" && input.codexRuntimeStatus !== "running") {
    return summary(id, "degraded", "Codex is not running. Start Codex to chat with the active note.");
  }

  if ((id === "search" || id === "sources") && input.indexStatus === "empty") {
    return summary(id, "blocked", "Rebuild the Vaultseer index before using this mode.");
  }

  return summary(id, "ready", `${MODE_LABELS[id]} mode is ready.`);
}

function summary(id: StudioModeId, status: StudioModeStatus, message: string): StudioModeSummary {
  return {
    id,
    label: MODE_LABELS[id],
    status,
    message
  };
}
