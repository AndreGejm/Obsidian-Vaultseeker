import { describe, expect, it } from "vitest";
import type { GuardedVaultWriteOperation, VaultWriteApplyResultRecord, VaultWriteDecisionRecord } from "@vaultseer/core";
import { planNoteTagUpdateOperation } from "@vaultseer/core";
import { buildWriteReviewQueueState } from "../src/write-review-queue-state";

describe("buildWriteReviewQueueState", () => {
  it("returns an empty read-only queue state when there are no proposed operations", () => {
    expect(buildWriteReviewQueueState({ operations: [], decisions: [], applyResults: [] })).toEqual({
      status: "empty",
      title: "Guarded Write Review Queue",
      message: "No guarded write proposals are stored.",
      totalCount: 0,
      pendingCount: 0,
      deferredCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      failedApplyCount: 0,
      appliedCount: 0,
      items: []
    });
  });

  it("marks approved unapplied operations as ready for guarded apply", () => {
    const pending = writeOperation({
      id: "vault-write:create-note-from-source:pending",
      targetPath: "Source Notes/Pending.md",
      createdAt: "2026-05-01T10:00:00.000Z"
    });
    const approved = writeOperation({
      id: "vault-write:create-note-from-source:approved",
      targetPath: "Source Notes/Approved.md",
      createdAt: "2026-05-01T09:00:00.000Z"
    });
    const rejected = writeOperation({
      id: "vault-write:create-note-from-source:rejected",
      targetPath: "Source Notes/Rejected.md",
      createdAt: "2026-05-01T11:00:00.000Z"
    });

    const state = buildWriteReviewQueueState({
      operations: [approved, rejected, pending],
      applyResults: [],
      decisions: [
        writeDecision({
          operationId: approved.id,
          targetPath: approved.targetPath,
          decision: "approved",
          decidedAt: "2026-05-01T12:00:00.000Z"
        }),
        writeDecision({
          operationId: rejected.id,
          targetPath: rejected.targetPath,
          decision: "rejected",
          decidedAt: "2026-05-01T12:30:00.000Z"
        })
      ]
    });

    expect(state).toMatchObject({
      status: "ready",
      totalCount: 3,
      pendingCount: 1,
      deferredCount: 0,
      approvedCount: 1,
      rejectedCount: 1,
      failedApplyCount: 0,
      appliedCount: 0,
      message: "1 pending, 0 deferred, 1 approved, 1 rejected."
    });
    expect(state.items.map((item) => [item.operationId, item.decisionState, item.applyState, item.canApply])).toEqual([
      [pending.id, "pending", "not_applied", false],
      [approved.id, "approved", "not_applied", true],
      [rejected.id, "rejected", "not_applied", false]
    ]);
    expect(state.items[0]).toMatchObject({
      operationTypeLabel: "Create note from source",
      targetPath: "Source Notes/Pending.md",
      sourcePath: "Sources/Ragnarok.pdf",
      suggestionIds: ["suggestion:source-note:source:ragnarok:draft"],
      previewDiff: "--- /dev/null\n+++ b/Source Notes/Pending.md\n@@\n+# Pending\n"
    });
  });

  it("uses the latest decision record for an operation when duplicate decision rows are loaded", () => {
    const operation = writeOperation({ id: "vault-write:create-note-from-source:decision-order" });

    const state = buildWriteReviewQueueState({
      operations: [operation],
      applyResults: [],
      decisions: [
        writeDecision({
          operationId: operation.id,
          targetPath: operation.targetPath,
          decision: "approved",
          decidedAt: "2026-05-01T12:00:00.000Z"
        }),
        writeDecision({
          operationId: operation.id,
          targetPath: operation.targetPath,
          decision: "deferred",
          decidedAt: "2026-05-01T13:00:00.000Z"
        })
      ]
    });

    expect(state.items).toHaveLength(1);
    expect(state.items[0]).toMatchObject({
      decisionState: "deferred",
      decisionLabel: "Deferred",
      decidedAt: "2026-05-01T13:00:00.000Z",
      canApply: false
    });
  });

  it("surfaces latest apply result state separately from review decisions", () => {
    const failed = writeOperation({
      id: "vault-write:create-note-from-source:failed",
      targetPath: "Source Notes/Failed.md",
      createdAt: "2026-05-01T09:00:00.000Z"
    });
    const applied = writeOperation({
      id: "vault-write:create-note-from-source:applied",
      targetPath: "Source Notes/Applied.md",
      createdAt: "2026-05-01T08:00:00.000Z"
    });

    const state = buildWriteReviewQueueState({
      operations: [applied, failed],
      decisions: [
        writeDecision({ operationId: failed.id, targetPath: failed.targetPath, decision: "approved" }),
        writeDecision({ operationId: applied.id, targetPath: applied.targetPath, decision: "approved" })
      ],
      applyResults: [
        applyResult({
          operationId: failed.id,
          targetPath: failed.targetPath,
          status: "failed",
          message: "Target file changed before apply.",
          failedAt: "2026-05-01T18:00:00.000Z"
        }),
        applyResult({
          operationId: applied.id,
          targetPath: applied.targetPath,
          status: "applied",
          appliedAt: "2026-05-01T18:30:00.000Z"
        })
      ]
    });

    expect(state.failedApplyCount).toBe(1);
    expect(state.appliedCount).toBe(1);
    expect(state.items.map((item) => [item.operationId, item.applyState, item.applyLabel])).toEqual([
      [failed.id, "failed", "Apply failed: Target file changed before apply."],
      [applied.id, "applied", "Applied at 2026-05-01T18:30:00.000Z"]
    ]);
  });

  it("allows retry only when the latest apply failure is retryable", () => {
    const retryable = writeOperation({
      id: "vault-write:create-note-from-source:retryable",
      targetPath: "Source Notes/Retryable.md",
      createdAt: "2026-05-01T09:00:00.000Z"
    });
    const blocked = writeOperation({
      id: "vault-write:create-note-from-source:blocked",
      targetPath: "Source Notes/Blocked.md",
      createdAt: "2026-05-01T08:00:00.000Z"
    });
    const applied = writeOperation({
      id: "vault-write:create-note-from-source:already-applied",
      targetPath: "Source Notes/Already Applied.md",
      createdAt: "2026-05-01T07:00:00.000Z"
    });

    const state = buildWriteReviewQueueState({
      operations: [applied, blocked, retryable],
      decisions: [
        writeDecision({ operationId: retryable.id, targetPath: retryable.targetPath, decision: "approved" }),
        writeDecision({ operationId: blocked.id, targetPath: blocked.targetPath, decision: "approved" }),
        writeDecision({ operationId: applied.id, targetPath: applied.targetPath, decision: "approved" })
      ],
      applyResults: [
        applyResult({
          operationId: retryable.id,
          targetPath: retryable.targetPath,
          status: "failed",
          retryable: true,
          failedAt: "2026-05-01T18:00:00.000Z"
        }),
        applyResult({
          operationId: blocked.id,
          targetPath: blocked.targetPath,
          status: "failed",
          retryable: false,
          failedAt: "2026-05-01T18:05:00.000Z"
        }),
        applyResult({
          operationId: applied.id,
          targetPath: applied.targetPath,
          status: "applied",
          appliedAt: "2026-05-01T18:10:00.000Z"
        })
      ]
    });

    expect(state.items.map((item) => [item.operationId, item.canApply])).toEqual([
      [retryable.id, true],
      [blocked.id, false],
      [applied.id, false]
    ]);
  });

  it("shows note tag updates as preview-only operations until the write port supports them", () => {
    const operation = tagUpdateOperation();

    const state = buildWriteReviewQueueState({
      operations: [operation],
      decisions: [writeDecision({ operationId: operation.id, targetPath: operation.targetPath, decision: "approved" })],
      applyResults: []
    });

    expect(state.items).toEqual([
      expect.objectContaining({
        operationId: operation.id,
        operationType: "update_note_tags",
        operationTypeLabel: "Update note tags",
        targetPath: "Electronics/Precision Timer.md",
        sourcePath: null,
        sourceContentHash: null,
        decisionState: "approved",
        canApply: false,
        previewDiff: expect.stringContaining("+++ b/Electronics/Precision Timer.md")
      })
    ]);
  });
});

function writeOperation(overrides: Partial<GuardedVaultWriteOperation> = {}): GuardedVaultWriteOperation {
  const targetPath = overrides.targetPath ?? "Source Notes/Ragnarok.md";
  return {
    id: "vault-write:create-note-from-source:ragnarok",
    type: "create_note_from_source",
    targetPath,
    expectedCurrentHash: null,
    content: "# Ragnarok\n",
    preview: {
      kind: "create_file",
      targetPath,
      beforeHash: null,
      afterHash: "sha256:after",
      diff: `--- /dev/null\n+++ b/${targetPath}\n@@\n+# ${targetPath.replace(/^Source Notes\//, "").replace(/\.md$/, "")}\n`,
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

function writeDecision(overrides: Partial<VaultWriteDecisionRecord> = {}): VaultWriteDecisionRecord {
  return {
    operationId: "vault-write:create-note-from-source:ragnarok",
    decision: "approved",
    targetPath: "Source Notes/Ragnarok.md",
    suggestionIds: ["suggestion:source-note:source:ragnarok:draft"],
    decidedAt: "2026-05-01T12:00:00.000Z",
    ...overrides
  };
}

function applyResult(overrides: Partial<VaultWriteApplyResultRecord>): VaultWriteApplyResultRecord {
  if (overrides.status === "failed") {
    return {
      operationId: "vault-write:create-note-from-source:ragnarok",
      status: "failed",
      targetPath: "Source Notes/Ragnarok.md",
      stage: "precondition",
      expectedCurrentHash: null,
      actualCurrentHash: "sha256:current",
      message: "Target file changed before apply.",
      retryable: false,
      failedAt: "2026-05-01T18:00:00.000Z",
      ...overrides
    };
  }

  return {
    operationId: "vault-write:create-note-from-source:ragnarok",
    status: "applied",
    targetPath: "Source Notes/Ragnarok.md",
    beforeHash: null,
    afterHash: "sha256:after",
    appliedAt: "2026-05-01T18:00:00.000Z",
    ...overrides
  };
}

function tagUpdateOperation(): GuardedVaultWriteOperation {
  return planNoteTagUpdateOperation({
    targetPath: "Electronics/Precision Timer.md",
    currentContent: "# Precision Timer\n",
    tagsToAdd: ["electronics/timing"],
    suggestionIds: ["suggestion:note-tag:Electronics/Precision Timer.md:electronics/timing"],
    createdAt: "2026-05-01T21:00:00.000Z"
  });
}
