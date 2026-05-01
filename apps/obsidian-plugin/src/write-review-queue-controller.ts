import type {
  GuardedVaultWriteOperation,
  VaultseerStore,
  VaultWriteDecision,
  VaultWriteDecisionRecord
} from "@vaultseer/core";
import { createVaultWriteDecisionRecord } from "@vaultseer/core";

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

function formatDecision(decision: VaultWriteDecision): string {
  switch (decision) {
    case "approved":
      return "approved for later apply";
    case "deferred":
      return "deferred";
    case "rejected":
      return "rejected";
  }
}
