import { describe, expect, it } from "vitest";
import type { GuardedVaultWriteOperation, VaultWriteDecisionRecord } from "@vaultseer/core";
import { buildWriteReviewQueueState } from "../src/write-review-queue-state";

describe("buildWriteReviewQueueState", () => {
  it("returns an empty read-only queue state when there are no proposed operations", () => {
    expect(buildWriteReviewQueueState({ operations: [], decisions: [] })).toEqual({
      status: "empty",
      title: "Guarded Write Review Queue",
      message: "No guarded write proposals are stored.",
      totalCount: 0,
      pendingCount: 0,
      deferredCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      items: []
    });
  });

  it("lists pending and decided operations without exposing apply state", () => {
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
      message: "1 pending, 0 deferred, 1 approved, 1 rejected."
    });
    expect(state.items.map((item) => [item.operationId, item.decisionState, item.canApply])).toEqual([
      [pending.id, "pending", false],
      [approved.id, "approved", false],
      [rejected.id, "rejected", false]
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
