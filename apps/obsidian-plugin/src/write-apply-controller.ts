import type {
  GuardedVaultWriteOperation,
  VaultseerStore,
  VaultWriteDecisionRecord,
  VaultWritePort,
  VaultWritePreconditionReason
} from "@vaultseer/core";
import {
  createVaultWriteApplyFailureRecord,
  createVaultWriteApplySuccessRecord
} from "@vaultseer/core";

export type ApplyApprovedVaultWriteOperationStatus = "applied" | "failed" | "blocked";

export type ApplyApprovedVaultWriteOperationInput = {
  store: VaultseerStore;
  writePort: VaultWritePort;
  operation: GuardedVaultWriteOperation;
  decision: VaultWriteDecisionRecord | null;
  now: () => string;
};

export type ApplyApprovedVaultWriteOperationSummary = {
  status: ApplyApprovedVaultWriteOperationStatus;
  operationId: string;
  targetPath: string;
  message: string;
};

export async function applyApprovedVaultWriteOperation(
  input: ApplyApprovedVaultWriteOperationInput
): Promise<ApplyApprovedVaultWriteOperationSummary> {
  if (input.decision?.decision !== "approved") {
    return {
      status: "blocked",
      operationId: input.operation.id,
      targetPath: input.operation.targetPath,
      message: `${input.operation.targetPath} is not approved for apply.`
    };
  }

  const dryRun = await input.writePort.dryRun(input.operation);
  if (!dryRun.precondition.ok) {
    const message = formatPreconditionReason(dryRun.precondition.reason);
    await input.store.recordVaultWriteApplyResult(
      createVaultWriteApplyFailureRecord({
        operation: input.operation,
        stage: "precondition",
        expectedCurrentHash: dryRun.precondition.expectedCurrentHash,
        actualCurrentHash: dryRun.precondition.actualCurrentHash,
        message,
        retryable: false,
        failedAt: input.now()
      })
    );
    return {
      status: "failed",
      operationId: input.operation.id,
      targetPath: input.operation.targetPath,
      message: `${failureMessagePrefix(input.operation)}: ${message}.`
    };
  }

  try {
    const appliedAt = input.now();
    const result = await input.writePort.apply(input.operation, {
      operationId: input.operation.id,
      targetPath: input.operation.targetPath,
      expectedCurrentHash: input.operation.expectedCurrentHash,
      afterHash: input.operation.preview.afterHash,
      approvedAt: appliedAt
    });
    await input.store.recordVaultWriteApplyResult(
      createVaultWriteApplySuccessRecord({
        operation: input.operation,
        beforeHash: result.beforeHash,
        afterHash: result.afterHash,
        appliedAt: result.appliedAt
      })
    );
    return {
      status: "applied",
      operationId: input.operation.id,
      targetPath: input.operation.targetPath,
      message: successMessage(input.operation)
    };
  } catch (error) {
    const message = getErrorMessage(error);
    await input.store.recordVaultWriteApplyResult(
      createVaultWriteApplyFailureRecord({
        operation: input.operation,
        stage: "write",
        expectedCurrentHash: input.operation.expectedCurrentHash,
        actualCurrentHash: null,
        message,
        retryable: true,
        failedAt: input.now()
      })
    );
    return {
      status: "failed",
      operationId: input.operation.id,
      targetPath: input.operation.targetPath,
      message: `${failureMessagePrefix(input.operation)}: ${message}.`
    };
  }
}

function successMessage(operation: GuardedVaultWriteOperation): string {
  switch (operation.type) {
    case "create_note_from_source":
      return `Created ${operation.targetPath}.`;
    case "update_note_tags":
      return `Applied tag update to ${operation.targetPath}.`;
    case "update_note_links":
      return `Applied link update to ${operation.targetPath}.`;
  }
}

function failureMessagePrefix(operation: GuardedVaultWriteOperation): string {
  switch (operation.type) {
    case "create_note_from_source":
      return `Could not create ${operation.targetPath}`;
    case "update_note_tags":
      return `Could not apply tag update to ${operation.targetPath}`;
    case "update_note_links":
      return `Could not apply link update to ${operation.targetPath}`;
  }
}

function formatPreconditionReason(reason: VaultWritePreconditionReason): string {
  switch (reason) {
    case "wrong_target":
      return "target path mismatch";
    case "target_exists":
      return "target already exists";
    case "missing_parent_folder":
      return "target folder does not exist";
    case "missing_file":
      return "target file is missing";
    case "stale_file":
      return "target changed since review";
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
