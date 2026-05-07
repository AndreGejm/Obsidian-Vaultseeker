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
    activeMode: input.requestedMode ?? "chat",
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
    return summary(id, "degraded", chatRuntimeMessage(input.codexRuntimeStatus));
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

function chatRuntimeMessage(status: BuildStudioStateInput["codexRuntimeStatus"]): string {
  switch (status) {
    case "disabled":
      return "Enable native Codex in Vaultseer settings to chat with the active note.";
    case "starting":
      return "Codex is starting. Chat will be ready when the native session connects.";
    case "stopping":
      return "Codex is stopping. Wait for it to stop before starting a new chat session.";
    case "failed":
      return "Codex failed to start or connect. Check the native Codex settings, then retry.";
    case "stopped":
      return "Send a message to start Codex and chat with the active note.";
    case "running":
      return "Chat mode is ready.";
  }
}
