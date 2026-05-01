import type { GuardedVaultWriteOperation, VaultWriteDecisionRecord } from "@vaultseer/core";

export type WriteReviewQueueStatus = "empty" | "ready";
export type WriteReviewQueueDecisionState = "pending" | VaultWriteDecisionRecord["decision"];

export type WriteReviewQueueItem = {
  operationId: string;
  operationType: GuardedVaultWriteOperation["type"];
  operationTypeLabel: string;
  targetPath: string;
  createdAt: string;
  expectedCurrentHash: string | null;
  sourcePath: string | null;
  sourceContentHash: string | null;
  suggestionIds: string[];
  decision: VaultWriteDecisionRecord | null;
  decisionState: WriteReviewQueueDecisionState;
  decisionLabel: string;
  decidedAt: string | null;
  canApply: false;
  previewDiff: string;
};

export type WriteReviewQueueState = {
  status: WriteReviewQueueStatus;
  title: string;
  message: string;
  totalCount: number;
  pendingCount: number;
  deferredCount: number;
  approvedCount: number;
  rejectedCount: number;
  items: WriteReviewQueueItem[];
};

export type BuildWriteReviewQueueStateInput = {
  operations: GuardedVaultWriteOperation[];
  decisions: VaultWriteDecisionRecord[];
};

export function buildWriteReviewQueueState(input: BuildWriteReviewQueueStateInput): WriteReviewQueueState {
  if (input.operations.length === 0) {
    return {
      status: "empty",
      title: "Guarded Write Review Queue",
      message: "No guarded write proposals are stored.",
      totalCount: 0,
      pendingCount: 0,
      deferredCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      items: []
    };
  }

  const decisionsByOperationId = latestDecisionsByOperationId(input.decisions);
  const items = input.operations.map((operation): WriteReviewQueueItem => {
    const decision = decisionsByOperationId.get(operation.id) ?? null;
    const decisionState = decision?.decision ?? "pending";
    return {
      operationId: operation.id,
      operationType: operation.type,
      operationTypeLabel: formatOperationType(operation.type),
      targetPath: operation.targetPath,
      createdAt: operation.createdAt,
      expectedCurrentHash: operation.expectedCurrentHash,
      sourcePath: operation.source.sourcePath,
      sourceContentHash: operation.source.sourceContentHash,
      suggestionIds: [...operation.suggestionIds].sort((left, right) => left.localeCompare(right)),
      decision,
      decisionState,
      decisionLabel: formatDecisionState(decisionState),
      decidedAt: decision?.decidedAt ?? null,
      canApply: false,
      previewDiff: operation.preview.diff
    };
  });

  const sortedItems = items.sort(compareQueueItems);
  const pendingCount = sortedItems.filter((item) => item.decisionState === "pending").length;
  const deferredCount = sortedItems.filter((item) => item.decisionState === "deferred").length;
  const approvedCount = sortedItems.filter((item) => item.decisionState === "approved").length;
  const rejectedCount = sortedItems.filter((item) => item.decisionState === "rejected").length;

  return {
    status: "ready",
    title: "Guarded Write Review Queue",
    message: `${pendingCount} pending, ${deferredCount} deferred, ${approvedCount} approved, ${rejectedCount} rejected.`,
    totalCount: sortedItems.length,
    pendingCount,
    deferredCount,
    approvedCount,
    rejectedCount,
    items: sortedItems
  };
}

function latestDecisionsByOperationId(decisions: VaultWriteDecisionRecord[]): Map<string, VaultWriteDecisionRecord> {
  const byOperationId = new Map<string, VaultWriteDecisionRecord>();
  for (const decision of decisions) {
    const existing = byOperationId.get(decision.operationId);
    if (!existing || existing.decidedAt.localeCompare(decision.decidedAt) < 0) {
      byOperationId.set(decision.operationId, structuredClone(decision));
    }
  }
  return byOperationId;
}

function compareQueueItems(left: WriteReviewQueueItem, right: WriteReviewQueueItem): number {
  const decisionOrder = decisionSortOrder(left.decisionState) - decisionSortOrder(right.decisionState);
  if (decisionOrder !== 0) return decisionOrder;

  const createdOrder = right.createdAt.localeCompare(left.createdAt);
  if (createdOrder !== 0) return createdOrder;

  return left.operationId.localeCompare(right.operationId);
}

function decisionSortOrder(decisionState: WriteReviewQueueDecisionState): number {
  switch (decisionState) {
    case "pending":
      return 0;
    case "deferred":
      return 1;
    case "approved":
      return 2;
    case "rejected":
      return 3;
  }
}

function formatOperationType(type: GuardedVaultWriteOperation["type"]): string {
  switch (type) {
    case "create_note_from_source":
      return "Create note from source";
  }
}

function formatDecisionState(decisionState: WriteReviewQueueDecisionState): string {
  switch (decisionState) {
    case "pending":
      return "Pending review";
    case "deferred":
      return "Deferred";
    case "approved":
      return "Approved for later apply";
    case "rejected":
      return "Rejected";
  }
}
