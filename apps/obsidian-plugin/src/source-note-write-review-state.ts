import type {
  GuardedVaultWriteOperation,
  NoteRecord,
  SourceNoteProposal,
  SuggestionRecord,
  VaultWritePreconditionResult
} from "@vaultseer/core";
import {
  evaluateVaultWritePrecondition,
  planSourceNoteCreationOperation
} from "@vaultseer/core";

export type SourceNoteWriteReviewStatus = "ready" | "blocked" | "unavailable";

export type SourceNoteWriteReviewSource = {
  sourceId: string;
  sourcePath: string;
  sourceContentHash: string;
};

export type SourceNoteWriteReviewState = {
  status: SourceNoteWriteReviewStatus;
  title: string;
  message: string;
  targetPath: string | null;
  operation: GuardedVaultWriteOperation | null;
  precondition: VaultWritePreconditionResult | null;
  diff: string;
  canApply: false;
  source: SourceNoteWriteReviewSource | null;
  suggestionIds: string[];
};

export type BuildSourceNoteWriteReviewStateInput = {
  proposal: SourceNoteProposal | null;
  notes: NoteRecord[];
  suggestionRecords: SuggestionRecord[];
  createdAt: string;
  targetPath?: string;
};

const DEFAULT_SOURCE_NOTE_FOLDER = "Source Notes";

export function buildSourceNoteWriteReviewState(
  input: BuildSourceNoteWriteReviewStateInput
): SourceNoteWriteReviewState {
  if (!input.proposal) {
    return {
      status: "unavailable",
      title: "No Source Note Proposal",
      message: "This source does not have a note proposal to review.",
      targetPath: null,
      operation: null,
      precondition: null,
      diff: "",
      canApply: false,
      source: null,
      suggestionIds: []
    };
  }

  const targetPath = input.targetPath ?? deriveSourceNoteTargetPath(input.proposal);
  const suggestionIds = sourceProposalSuggestionIds(input.proposal, input.suggestionRecords);
  const operation = planSourceNoteCreationOperation({
    proposal: input.proposal,
    targetPath,
    suggestionIds,
    createdAt: input.createdAt
  });
  const currentTarget = findNoteByPath(input.notes, targetPath);
  const precondition = evaluateVaultWritePrecondition(operation, {
    path: targetPath,
    currentHash: currentTarget?.contentHash ?? null
  });

  return {
    status: precondition.ok ? "ready" : "blocked",
    title: "Review Source Note Creation",
    message: precondition.ok
      ? "Dry-run only. Vaultseer has not created or modified this note."
      : `Dry-run blocked: ${formatPreconditionReason(precondition.reason)}.`,
    targetPath,
    operation,
    precondition,
    diff: operation.preview.diff,
    canApply: false,
    source: {
      sourceId: input.proposal.sourceId,
      sourcePath: input.proposal.sourcePath,
      sourceContentHash: input.proposal.sourceContentHash
    },
    suggestionIds
  };
}

export function deriveSourceNoteTargetPath(proposal: SourceNoteProposal): string {
  const filename = sanitizeFilename(proposal.title) || "Source Note";
  return `${DEFAULT_SOURCE_NOTE_FOLDER}/${filename}.md`;
}

function sourceProposalSuggestionIds(proposal: SourceNoteProposal, suggestions: SuggestionRecord[]): string[] {
  const prefix = `suggestion:source-note:${proposal.sourceId}:`;
  return suggestions
    .filter((suggestion) => suggestion.id.startsWith(prefix))
    .map((suggestion) => suggestion.id)
    .sort((left, right) => left.localeCompare(right));
}

function findNoteByPath(notes: NoteRecord[], targetPath: string): NoteRecord | null {
  const normalizedTarget = normalizePathForComparison(targetPath);
  return notes.find((note) => normalizePathForComparison(note.path) === normalizedTarget) ?? null;
}

function normalizePathForComparison(path: string): string {
  return path.replace(/\\/g, "/").toLowerCase();
}

function sanitizeFilename(value: string): string {
  return value
    .replace(/\.md$/i, "")
    .replace(/[\\/:*?"<>|#[\]^&]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
}

function formatPreconditionReason(reason: Exclude<VaultWritePreconditionResult, { ok: true }>["reason"]): string {
  switch (reason) {
    case "wrong_target":
      return "target path mismatch";
    case "target_exists":
      return "target note already exists";
    case "missing_parent_folder":
      return "target folder does not exist";
    case "missing_file":
      return "target note is missing";
    case "stale_file":
      return "target note changed since analysis";
  }
}
