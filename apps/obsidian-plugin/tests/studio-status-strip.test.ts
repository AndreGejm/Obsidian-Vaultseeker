import type { GuardedVaultWriteOperation, IndexHealth, VaultWriteApplyResultRecord, VaultWriteDecisionRecord } from "@vaultseer/core";
import { planNoteTagUpdateOperation } from "@vaultseer/core";
import { describe, expect, it } from "vitest";
import { buildStudioStatusStrip } from "../src/studio-status-strip";

describe("buildStudioStatusStrip", () => {
  it("summarizes index, active note, review queue, and Codex status", () => {
    const health: IndexHealth = {
      schemaVersion: 1,
      status: "ready",
      statusMessage: null,
      lastIndexedAt: "2026-05-03T10:00:00.000Z",
      noteCount: 2,
      chunkCount: 5,
      vectorCount: 3,
      suggestionCount: 4,
      warnings: []
    };

    const items = buildStudioStatusStrip({
      health,
      activePath: "Notes/VHDL.md",
      notes: [{ path: "Notes/VHDL.md", title: "VHDL", aliases: [], tags: [] }],
      writeOperations: [tagUpdateOperation()],
      writeDecisions: [],
      writeApplyResults: [],
      codexRuntimeStatus: "running"
    });

    expect(items).toEqual([
      {
        id: "index",
        label: "Index",
        value: "Ready - 2 notes - 5 chunks",
        tone: "ready"
      },
      {
        id: "active-note",
        label: "Current note",
        value: "Indexed",
        tone: "ready"
      },
      {
        id: "review",
        label: "Review",
        value: "1 pending",
        tone: "attention"
      },
      {
        id: "codex",
        label: "Codex",
        value: "Connected",
        tone: "ready"
      }
    ]);
  });

  it("marks stale or missing current-note state as attention items", () => {
    const health: IndexHealth = {
      schemaVersion: 1,
      status: "stale",
      statusMessage: "Vault changed",
      lastIndexedAt: null,
      noteCount: 0,
      chunkCount: 0,
      vectorCount: 0,
      suggestionCount: 0,
      warnings: []
    };

    const items = buildStudioStatusStrip({
      health,
      activePath: "Notes/New.md",
      notes: [],
      writeOperations: [],
      writeDecisions: [],
      writeApplyResults: [],
      codexRuntimeStatus: "failed"
    });

    expect(items.map((item) => [item.id, item.value, item.tone])).toEqual([
      ["index", "Stale - 0 notes - 0 chunks", "attention"],
      ["active-note", "Not indexed", "attention"],
      ["review", "No pending writes", "muted"],
      ["codex", "Connection failed", "attention"]
    ]);
  });

  it("does not show handled write history as pending review work", () => {
    const operation = tagUpdateOperation();

    const appliedItems = buildStudioStatusStrip({
      health: health(),
      activePath: "Notes/VHDL.md",
      notes: [{ path: "Notes/VHDL.md", title: "VHDL", aliases: [], tags: [] }],
      writeOperations: [operation],
      writeDecisions: [writeDecision({ operationId: operation.id, targetPath: operation.targetPath, decision: "approved" })],
      writeApplyResults: [
        applyResult({
          operationId: operation.id,
          targetPath: operation.targetPath,
          status: "applied",
          beforeHash: operation.expectedCurrentHash,
          afterHash: operation.preview.afterHash
        })
      ],
      codexRuntimeStatus: "running"
    });

    expect(appliedItems.find((item) => item.id === "review")).toMatchObject({
      value: "All written",
      tone: "ready"
    });

    const rejectedItems = buildStudioStatusStrip({
      health: health(),
      activePath: "Notes/VHDL.md",
      notes: [{ path: "Notes/VHDL.md", title: "VHDL", aliases: [], tags: [] }],
      writeOperations: [operation],
      writeDecisions: [writeDecision({ operationId: operation.id, targetPath: operation.targetPath, decision: "rejected" })],
      writeApplyResults: [],
      codexRuntimeStatus: "running"
    });

    expect(rejectedItems.find((item) => item.id === "review")).toMatchObject({
      value: "Nothing to review",
      tone: "muted"
    });
  });
});

function health(): IndexHealth {
  return {
    schemaVersion: 1,
    status: "ready",
    statusMessage: null,
    lastIndexedAt: "2026-05-03T10:00:00.000Z",
    noteCount: 2,
    chunkCount: 5,
    vectorCount: 3,
    suggestionCount: 4,
    warnings: []
  };
}

function tagUpdateOperation(overrides: Partial<GuardedVaultWriteOperation> = {}): GuardedVaultWriteOperation {
  return {
    ...planNoteTagUpdateOperation({
      targetPath: "Notes/VHDL.md",
      currentContent: "# VHDL\n",
      tagsToAdd: ["electronics/fpga"],
      suggestionIds: ["suggestion:note-tag:Notes/VHDL.md:electronics/fpga"],
      createdAt: "2026-05-03T11:00:00.000Z"
    }),
    ...overrides
  };
}

function writeDecision(overrides: Partial<VaultWriteDecisionRecord> = {}): VaultWriteDecisionRecord {
  return {
    operationId: "vault-write:update-note-tags:Notes/VHDL.md",
    decision: "approved",
    targetPath: "Notes/VHDL.md",
    suggestionIds: ["suggestion:note-tag:Notes/VHDL.md:electronics/fpga"],
    decidedAt: "2026-05-03T12:00:00.000Z",
    ...overrides
  };
}

function applyResult(overrides: Partial<VaultWriteApplyResultRecord>): VaultWriteApplyResultRecord {
  if (overrides.status === "failed") {
    return {
      operationId: "vault-write:update-note-tags:Notes/VHDL.md",
      status: "failed",
      targetPath: "Notes/VHDL.md",
      stage: "precondition",
      expectedCurrentHash: null,
      actualCurrentHash: "sha256:current",
      message: "Target file changed before apply.",
      retryable: false,
      failedAt: "2026-05-03T13:00:00.000Z",
      ...overrides
    };
  }

  return {
    operationId: "vault-write:update-note-tags:Notes/VHDL.md",
    status: "applied",
    targetPath: "Notes/VHDL.md",
    beforeHash: null,
    afterHash: "sha256:after",
    appliedAt: "2026-05-03T13:00:00.000Z",
    ...overrides
  };
}
