import type { CodexRuntimeStatus } from "@vaultseer/core";

export type CodexRuntimeState = {
  status: CodexRuntimeStatus;
  message: string;
  processId: number | null;
};

export type CodexRuntimeEvent =
  | { type: "start_requested" }
  | { type: "started"; processId: number | null }
  | { type: "launch_failed"; message: string }
  | { type: "stop_requested" }
  | { type: "stopped" };

export type CanStartCodexRuntimeInput = {
  status: CodexRuntimeStatus;
  configured: boolean;
};

export function canStartCodexRuntime(input: CanStartCodexRuntimeInput): boolean {
  return input.configured && (input.status === "stopped" || input.status === "failed");
}

export function transitionCodexRuntime(state: CodexRuntimeState, event: CodexRuntimeEvent): CodexRuntimeState {
  switch (event.type) {
    case "start_requested":
      return { status: "starting", message: "Starting Codex.", processId: null };
    case "started":
      return { status: "running", message: "Codex is running.", processId: event.processId };
    case "launch_failed":
      return { status: "failed", message: event.message, processId: null };
    case "stop_requested":
      return { ...state, status: "stopping", message: "Stopping Codex." };
    case "stopped":
      return { status: "stopped", message: "Codex is stopped.", processId: null };
  }
}
