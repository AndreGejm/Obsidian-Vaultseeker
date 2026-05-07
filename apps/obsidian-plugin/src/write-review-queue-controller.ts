import type {
  GuardedVaultWriteOperation,
  VaultseerStore,
  VaultWriteDecision,
  VaultWriteDecisionRecord,
  VaultWritePort
} from "@vaultseer/core";
import { createVaultWriteDecisionRecord } from "@vaultseer/core";
import {
  applyApprovedVaultWriteOperation,
  type ApplyApprovedVaultWriteOperationSummary,
  type ApplyApprovedVaultWriteOperationStatus
} from "./write-apply-controller";

export type RecordWriteReviewQueueDecisionInput = {
  store: VaultseerStore;
  operation: GuardedVaultWriteOperation;
  decision: VaultWriteDecision;
  now: () => string;
};

export type RecordWriteReviewQueueDecisionSummary = {
  decisionRecord: VaultWriteDecisionRecord;
  decisionCount: number;
  operationCount: number;
  message: string;
};

export type AcceptWriteReviewQueueOperationInput = {
  store: VaultseerStore;
  writePort: VaultWritePort;
  operation: GuardedVaultWriteOperation;
  now: () => string;
};

export type AcceptWriteReviewQueueOperationSummary = {
  decisionRecord: VaultWriteDecisionRecord;
  status: ApplyApprovedVaultWriteOperationStatus;
  operationId: string;
  targetPath: string;
  message: string;
  applyResult: ApplyApprovedVaultWriteOperationSummary;
};

export async function recordWriteReviewQueueDecision(
  input: RecordWriteReviewQueueDecisionInput
): Promise<RecordWriteReviewQueueDecisionSummary> {
  const decisionRecord = createVaultWriteDecisionRecord({
    operation: input.operation,
    decision: input.decision,
    decidedAt: input.now()
  });
  const [decisions, operations] = await Promise.all([
    input.store.recordVaultWriteDecision(decisionRecord),
    input.store.getVaultWriteOperations()
  ]);

  return {
    decisionRecord,
    decisionCount: decisions.length,
    operationCount: operations.length,
    message: `Marked ${input.operation.targetPath} as ${formatDecision(input.decision)}. No note was changed.`
  };
}

export async function acceptWriteReviewQueueOperation(
  input: AcceptWriteReviewQueueOperationInput
): Promise<AcceptWriteReviewQueueOperationSummary> {
  const decisionSummary = await recordWriteReviewQueueDecision({
    store: input.store,
    operation: input.operation,
    decision: "approved",
    now: input.now
  });
  const applySummary = await applyApprovedVaultWriteOperation({
    store: input.store,
    writePort: input.writePort,
    operation: input.operation,
    decision: decisionSummary.decisionRecord,
    now: input.now
  });

  return {
    decisionRecord: decisionSummary.decisionRecord,
    status: applySummary.status,
    operationId: applySummary.operationId,
    targetPath: applySummary.targetPath,
    applyResult: applySummary,
    message:
      applySummary.status === "applied"
        ? `Wrote ${applySummary.targetPath} to the note.`
        : `Approved ${applySummary.targetPath}, but writing did not complete: ${applySummary.message}`
  };
}

function formatDecision(decision: VaultWriteDecision): string {
  switch (decision) {
    case "approved":
      return "approved";
    case "deferred":
      return "deferred";
    case "rejected":
      return "rejected";
  }
}
