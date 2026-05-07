import type {
  CodexRuntimeStatus,
  GuardedVaultWriteOperation,
  IndexHealth,
  VaultWriteApplyResultRecord,
  VaultWriteDecisionRecord
} from "@vaultseer/core";
import { buildWriteReviewQueueState, type WriteReviewQueueState } from "./write-review-queue-state";

export type StudioStatusStripTone = "ready" | "attention" | "danger" | "muted";

export type StudioStatusStripNote = {
  path: string;
};

export type StudioStatusStripItem = {
  id: "index" | "active-note" | "review" | "codex";
  label: string;
  value: string;
  tone: StudioStatusStripTone;
};

export type BuildStudioStatusStripInput = {
  health: IndexHealth;
  activePath: string | null;
  notes: StudioStatusStripNote[];
  writeOperations: GuardedVaultWriteOperation[];
  writeDecisions: VaultWriteDecisionRecord[];
  writeApplyResults: VaultWriteApplyResultRecord[];
  codexRuntimeStatus: CodexRuntimeStatus;
};

export function buildStudioStatusStrip(input: BuildStudioStatusStripInput): StudioStatusStripItem[] {
  return [
    {
      id: "index",
      label: "Index",
      value: `${formatStatus(input.health.status)} - ${input.health.noteCount} notes - ${input.health.chunkCount} chunks`,
      tone: getIndexTone(input.health.status)
    },
    {
      id: "active-note",
      label: "Current note",
      ...getCurrentNoteStatus(input.activePath, input.notes)
    },
    {
      id: "review",
      label: "Review",
      ...getReviewStatus(
        buildWriteReviewQueueState({
          operations: input.writeOperations,
          decisions: input.writeDecisions,
          applyResults: input.writeApplyResults
        })
      )
    },
    {
      id: "codex",
      label: "Codex",
      ...getCodexStatus(input.codexRuntimeStatus)
    }
  ];
}

function getCurrentNoteStatus(
  activePath: string | null,
  notes: StudioStatusStripNote[]
): Pick<StudioStatusStripItem, "value" | "tone"> {
  if (activePath === null) {
    return { value: "No active note", tone: "muted" };
  }

  if (notes.some((note) => note.path === activePath)) {
    return { value: "Indexed", tone: "ready" };
  }

  return { value: "Not indexed", tone: "attention" };
}

function getReviewStatus(state: WriteReviewQueueState): Pick<StudioStatusStripItem, "value" | "tone"> {
  if (state.totalCount === 0) {
    return { value: "No pending writes", tone: "muted" };
  }

  if (state.activeCount > 0) {
    return { value: `${state.activeCount} pending`, tone: "attention" };
  }

  if (state.appliedCount === state.historyCount) {
    return { value: "All written", tone: "ready" };
  }

  return { value: "Nothing to review", tone: "muted" };
}

function getCodexStatus(status: CodexRuntimeStatus): Pick<StudioStatusStripItem, "value" | "tone"> {
  switch (status) {
    case "running":
      return { value: "Connected", tone: "ready" };
    case "failed":
      return { value: "Connection failed", tone: "attention" };
    case "starting":
      return { value: "Starting", tone: "attention" };
    case "stopping":
      return { value: "Stopping", tone: "attention" };
    case "disabled":
      return { value: "Disabled", tone: "muted" };
    case "stopped":
      return { value: "Starts on send", tone: "muted" };
  }
}

function getIndexTone(status: IndexHealth["status"]): StudioStatusStripTone {
  switch (status) {
    case "ready":
      return "ready";
    case "error":
      return "danger";
    case "empty":
    case "indexing":
    case "stale":
    case "degraded":
      return "attention";
  }
}

function formatStatus(value: string): string {
  return value.length > 0 ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}
