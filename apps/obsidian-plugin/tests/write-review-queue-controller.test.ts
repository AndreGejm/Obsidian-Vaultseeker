import { describe, expect, it } from "vitest";
import type {
  GuardedVaultWriteOperation,
  VaultWriteApplyResult,
  VaultWriteApproval,
  VaultWriteDryRunResult,
  VaultWritePort
} from "@vaultseer/core";
import { InMemoryVaultseerStore } from "@vaultseer/core";
import { acceptWriteReviewQueueOperation, recordWriteReviewQueueDecision } from "../src/write-review-queue-controller";

describe("recordWriteReviewQueueDecision", () => {
  it("records the latest decision without removing the proposed operation", async () => {
    const store = new InMemoryVaultseerStore();
    const operation = writeOperation();
    await store.replaceVaultWriteOperations([operation]);

    const approved = await recordWriteReviewQueueDecision({
      store,
      operation,
      decision: "approved",
      now: () => "2026-05-01T12:00:00.000Z"
    });
    const deferred = await recordWriteReviewQueueDecision({
      store,
      operation,
      decision: "deferred",
      now: () => "2026-05-01T13:00:00.000Z"
    });

    await expect(store.getVaultWriteOperations()).resolves.toEqual([operation]);
    await expect(store.getVaultWriteDecisionRecords()).resolves.toEqual([deferred.decisionRecord]);
    expect(approved.message).toBe("Marked Source Notes/Ragnarok.md as approved. No note was changed.");
    expect(deferred.message).toBe("Marked Source Notes/Ragnarok.md as deferred. No note was changed.");
  });

  it("accepts by approving, applying, and leaving the proposal out of active review", async () => {
    const store = new InMemoryVaultseerStore();
    const operation = writeOperation();
    const port = new FakeWritePort(operation);
    await store.replaceVaultWriteOperations([operation]);

    const summary = await acceptWriteReviewQueueOperation({
      store,
      writePort: port,
      operation,
      now: () => "2026-05-01T14:00:00.000Z"
    });

    expect(summary.status).toBe("applied");
    expect(summary.message).toBe("Accepted and applied Source Notes/Ragnarok.md.");
    expect(port.applyCount).toBe(1);
    await expect(store.getVaultWriteDecisionRecords()).resolves.toEqual([
      {
        operationId: operation.id,
        decision: "approved",
        targetPath: operation.targetPath,
        suggestionIds: operation.suggestionIds,
        decidedAt: "2026-05-01T14:00:00.000Z"
      }
    ]);
    await expect(store.getVaultWriteApplyResultRecords()).resolves.toEqual([
      {
        operationId: operation.id,
        status: "applied",
        targetPath: operation.targetPath,
        beforeHash: null,
        afterHash: operation.preview.afterHash,
        appliedAt: "2026-05-01T14:00:00.000Z"
      }
    ]);
  });
});

class FakeWritePort implements VaultWritePort {
  applyCount = 0;

  constructor(private readonly operation: GuardedVaultWriteOperation) {}

  async dryRun(): Promise<VaultWriteDryRunResult> {
    return {
      operation: this.operation,
      preview: this.operation.preview,
      precondition: { ok: true }
    };
  }

  async apply(_operation: GuardedVaultWriteOperation, approval: VaultWriteApproval): Promise<VaultWriteApplyResult> {
    this.applyCount += 1;
    return {
      operationId: this.operation.id,
      targetPath: this.operation.targetPath,
      beforeHash: this.operation.expectedCurrentHash,
      afterHash: this.operation.preview.afterHash,
      appliedAt: approval.approvedAt
    };
  }
}

function writeOperation(overrides: Partial<GuardedVaultWriteOperation> = {}): GuardedVaultWriteOperation {
  return {
    id: "vault-write:create-note-from-source:ragnarok",
    type: "create_note_from_source",
    targetPath: "Source Notes/Ragnarok.md",
    expectedCurrentHash: null,
    content: "# Ragnarok\n",
    preview: {
      kind: "create_file",
      targetPath: "Source Notes/Ragnarok.md",
      beforeHash: null,
      afterHash: "sha256:after",
      diff: "--- /dev/null\n+++ b/Source Notes/Ragnarok.md\n@@\n+# Ragnarok\n",
      additions: 1,
      deletions: 0
    },
    source: {
      sourceId: "source:ragnarok",
      sourcePath: "Sources/Ragnarok.pdf",
      sourceContentHash: "sha256:source"
    },
    suggestionIds: ["suggestion:source-note:source:ragnarok:draft"],
    createdAt: "2026-05-01T10:00:00.000Z",
    ...overrides
  };
}
