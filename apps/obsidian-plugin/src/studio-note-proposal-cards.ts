import type {
  GuardedVaultWriteOperation,
  VaultWriteApplyResultRecord,
  VaultWriteDecisionRecord
} from "@vaultseer/core";
import { buildInlineApprovalState, type InlineApprovalSurface } from "./inline-approval-state";
import {
  buildWriteReviewQueueState,
  type WriteReviewQueueApplyState,
  type WriteReviewQueueDecisionState,
  type WriteReviewQueueItem,
  type WriteReviewQueueSection
} from "./write-review-queue-state";

export type StudioNoteProposalControlType = "approve" | "defer" | "reject" | "approve_apply" | "apply";

export type StudioNoteProposalControl = {
  type: StudioNoteProposalControlType;
  label: string;
  enabled: boolean;
};

export type StudioNoteProposalCard = {
  id: string;
  title: string;
  targetPath: string;
  summary: string;
  reviewSurface: InlineApprovalSurface;
  reviewMessage: string;
  decisionState: WriteReviewQueueDecisionState;
  decisionLabel: string;
  applyState: WriteReviewQueueApplyState;
  applyLabel: string;
  canApply: boolean;
  queueSection: WriteReviewQueueSection;
  previewDiff: string;
  controls: StudioNoteProposalControl[];
};

export type StudioNoteProposalCardState = {
  status: "no_active_note" | "empty" | "ready";
  message: string;
  hiddenHistoryCount: number;
  cards: StudioNoteProposalCard[];
};

export type BuildStudioNoteProposalCardsInput = {
  activePath: string | null;
  writeOperations: GuardedVaultWriteOperation[];
  decisions?: VaultWriteDecisionRecord[];
  applyResults?: VaultWriteApplyResultRecord[];
  includeHistory?: boolean;
};

export function buildStudioNoteProposalCards(
  input: BuildStudioNoteProposalCardsInput
): StudioNoteProposalCardState {
  if (input.activePath === null) {
    return {
      status: "no_active_note",
      message: "Open a Markdown note to review current-note proposals.",
      hiddenHistoryCount: 0,
      cards: []
    };
  }

  const activePath = input.activePath;
  const operationsById = new Map(input.writeOperations.map((operation) => [operation.id, operation]));
  const queueState = buildWriteReviewQueueState({
    operations: input.writeOperations,
    decisions: input.decisions ?? [],
    applyResults: input.applyResults ?? []
  });
  const allCards = queueState.items
    .filter((item) => item.targetPath === activePath)
    .map((item) => {
      const operation = operationsById.get(item.operationId);
      return operation === undefined ? null : buildProposalCard(operation, activePath, item);
    })
    .filter((card): card is StudioNoteProposalCard => card !== null);
  const hiddenHistoryCount = input.includeHistory === true ? 0 : allCards.filter((card) => card.queueSection === "history").length;
  const cards = input.includeHistory === true ? allCards : allCards.filter((card) => card.queueSection !== "history");

  if (cards.length === 0) {
    return {
      status: "empty",
      message: `No proposed changes are waiting for this note.${formatHiddenHistoryMessage(hiddenHistoryCount)}`,
      hiddenHistoryCount,
      cards: []
    };
  }

  return {
    status: "ready",
    message: `${cards.length} proposed change${cards.length === 1 ? "" : "s"} for this note.${formatHiddenHistoryMessage(hiddenHistoryCount)}`,
    hiddenHistoryCount,
    cards
  };
}

function formatHiddenHistoryMessage(count: number): string {
  if (count === 0) {
    return "";
  }

  return ` ${count} completed change${count === 1 ? "" : "s"} ${count === 1 ? "is" : "are"} hidden.`;
}

function buildProposalCard(
  operation: GuardedVaultWriteOperation,
  activePath: string,
  queueItem: WriteReviewQueueItem
): StudioNoteProposalCard {
  const approvalState = buildInlineApprovalState({
    operationType: operation.type,
    targetPath: operation.targetPath,
    activePath,
    touchesMultipleFiles: false
  });

  return {
    id: operation.id,
    title: formatOperationTitle(operation.type),
    targetPath: operation.targetPath,
    summary: summarizeOperation(operation),
    reviewSurface: approvalState.surface,
    reviewMessage: approvalState.message,
    decisionState: queueItem.decisionState,
    decisionLabel: queueItem.decisionLabel,
    applyState: queueItem.applyState,
    applyLabel: queueItem.applyLabel,
    canApply: queueItem.canApply,
    queueSection: queueItem.queueSection,
    previewDiff: queueItem.previewDiff,
    controls: buildControls(queueItem)
  };
}

function buildControls(item: WriteReviewQueueItem): StudioNoteProposalControl[] {
  const decisionControls: StudioNoteProposalControl[] = ([
    { type: "approve", decision: "approved", label: "Approve" },
    { type: "defer", decision: "deferred", label: "Defer" },
    { type: "reject", decision: "rejected", label: "Reject" }
  ] as const).map((control) => ({
    type: control.type,
    label: control.label,
    enabled: item.queueSection === "active" && item.decisionState !== control.decision
  }));

  return [
    ...decisionControls,
    {
      type: "approve_apply",
      label: "Approve and apply",
      enabled: canApproveAndApply(item)
    },
    {
      type: "apply",
      label: applyControlLabel(item),
      enabled: item.canApply
    }
  ];
}

function canApproveAndApply(item: WriteReviewQueueItem): boolean {
  if (item.queueSection !== "active") return false;
  if (item.decisionState === "approved") return false;
  if (item.applyState === "applied") return false;
  switch (item.operationType) {
    case "create_note_from_source":
    case "update_note_tags":
    case "update_note_links":
    case "rewrite_note_content":
      return true;
  }
}

function applyControlLabel(item: WriteReviewQueueItem): string {
  if (item.operationType === "update_note_tags") {
    if (item.applyState === "applied") return "Tag update applied";
    if (item.applyState === "failed" && item.canApply) return "Retry tag update";
    return "Apply tag update";
  }

  if (item.operationType === "update_note_links") {
    if (item.applyState === "applied") return "Link update applied";
    if (item.applyState === "failed" && item.canApply) return "Retry link update";
    return "Apply link update";
  }

  if (item.operationType === "rewrite_note_content") {
    if (item.applyState === "applied") return "Note rewrite applied";
    if (item.applyState === "failed" && item.canApply) return "Retry note rewrite";
    return "Apply note rewrite";
  }

  if (item.applyState === "applied") return "Already created";
  if (item.applyState === "failed" && item.canApply) return "Retry create note";
  return "Create note";
}

function summarizeOperation(operation: GuardedVaultWriteOperation): string {
  const preview = operation.preview as { summary?: unknown; additions?: unknown; deletions?: unknown } | undefined;
  if (typeof preview?.summary === "string" && preview.summary.trim().length > 0) {
    return preview.summary.trim();
  }

  if (operation.type === "update_note_tags") {
    const addedTags = operation.tagUpdate.addedTags;
    if (addedTags.length > 0) {
      return `Add tags: ${addedTags.join(", ")}`;
    }
    return "Update note tags.";
  }

  if (operation.type === "update_note_links") {
    const count = operation.linkUpdate.replacements.length;
    return `Update ${count} link${count === 1 ? "" : "s"}.`;
  }

  if (operation.type === "rewrite_note_content") {
    return operation.rewrite.reason ?? `Rewrite note (${operation.preview.additions} added, ${operation.preview.deletions} removed).`;
  }

  const additions = typeof preview?.additions === "number" ? preview.additions : null;
  const deletions = typeof preview?.deletions === "number" ? preview.deletions : null;
  if (additions !== null && deletions !== null) {
    return `Create note from source (${additions} added, ${deletions} removed).`;
  }

  return "Create note from source.";
}

function formatOperationTitle(type: GuardedVaultWriteOperation["type"]): string {
  switch (type) {
    case "update_note_tags":
      return "Tag update";
    case "update_note_links":
      return "Link update";
    case "rewrite_note_content":
      return "Note rewrite";
    case "create_note_from_source":
      return "Source note";
  }
}
