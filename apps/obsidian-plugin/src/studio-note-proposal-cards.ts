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

export type StudioNoteProposalControlType = "accept" | "edit" | "defer" | "reject";

export type StudioNoteProposalControl = {
  type: StudioNoteProposalControlType;
  label: string;
  enabled: boolean;
  tone: "primary" | "secondary";
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
  canEdit: boolean;
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
    canEdit: queueItem.canEdit,
    queueSection: queueItem.queueSection,
    previewDiff: queueItem.previewDiff,
    controls: buildControls(queueItem)
  };
}

function buildControls(item: WriteReviewQueueItem): StudioNoteProposalControl[] {
  if (item.queueSection === "history") {
    return [];
  }

  return [
    {
      type: "accept",
      label: item.applyState === "applied" ? "Written" : "Write to note",
      enabled: canAccept(item),
      tone: "primary"
    },
    {
      type: "edit",
      label: "Edit draft",
      enabled: item.canEdit,
      tone: "secondary"
    },
    {
      type: "defer",
      label: "Later",
      enabled: item.queueSection === "active" && item.decisionState !== "deferred",
      tone: "secondary"
    },
    {
      type: "reject",
      label: "Discard",
      enabled: item.queueSection === "active" && item.decisionState !== "rejected",
      tone: "secondary"
    }
  ];
}

function canAccept(item: WriteReviewQueueItem): boolean {
  if (item.queueSection !== "active") return false;
  if (item.applyState === "applied") return false;
  switch (item.operationType) {
    case "create_note_from_source":
    case "update_note_tags":
    case "update_note_links":
    case "rewrite_note_content":
      return true;
  }
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
      return "Add tags";
    case "update_note_links":
      return "Fix links";
    case "rewrite_note_content":
      return "Rewrite note";
    case "create_note_from_source":
      return "Source note";
  }
}
