import { describe, expect, it } from "vitest";
import type { GuardedVaultWriteOperation } from "@vaultseer/core";
import { InMemoryVaultseerStore } from "@vaultseer/core";
import { recordWriteReviewQueueDecision } from "../src/write-review-queue-controller";

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
    expect(approved.message).toBe("Marked Source Notes/Ragnarok.md as approved for later apply. No note was changed.");
    expect(deferred.message).toBe("Marked Source Notes/Ragnarok.md as deferred. No note was changed.");
  });
});

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
