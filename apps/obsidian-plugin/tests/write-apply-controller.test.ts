import { describe, expect, it } from "vitest";
import type {
  GuardedVaultWriteOperation,
  VaultWriteApplyResult,
  VaultWriteDecisionRecord,
  VaultWriteDryRunResult,
  VaultWritePort
} from "@vaultseer/core";
import {
  createVaultWriteDecisionRecord,
  InMemoryVaultseerStore,
  planSourceNoteCreationOperation
} from "@vaultseer/core";
import { applyApprovedVaultWriteOperation } from "../src/write-apply-controller";
import type { SourceNoteProposal } from "@vaultseer/core";

describe("applyApprovedVaultWriteOperation", () => {
  it("applies an approved operation, verifies through the port, and stores an applied result", async () => {
    const store = new InMemoryVaultseerStore();
    const operation = writeOperation();
    const decision = decisionRecord(operation, "approved");
    const port = new FakeWritePort({ dryRun: okDryRun(operation), applyResult: appliedResult(operation) });
    await store.replaceVaultWriteOperations([operation]);
    await store.recordVaultWriteDecision(decision);

    const summary = await applyApprovedVaultWriteOperation({
      store,
      writePort: port,
      operation,
      decision,
      now: () => "2026-05-01T20:00:00.000Z"
    });

    expect(port.applyCount).toBe(1);
    expect(summary).toMatchObject({
      status: "applied",
      message: "Created Source Notes/Ragnarok.md."
    });
    await expect(store.getVaultWriteApplyResultRecords()).resolves.toEqual([
      {
        operationId: operation.id,
        status: "applied",
        targetPath: operation.targetPath,
        beforeHash: null,
        afterHash: operation.preview.afterHash,
        appliedAt: "2026-05-01T20:00:00.000Z"
      }
    ]);
    await expect(store.getVaultWriteOperations()).resolves.toEqual([operation]);
  });

  it("refuses to apply when the operation has not been approved", async () => {
    const store = new InMemoryVaultseerStore();
    const operation = writeOperation();
    const decision = decisionRecord(operation, "deferred");
    const port = new FakeWritePort({ dryRun: okDryRun(operation), applyResult: appliedResult(operation) });

    const summary = await applyApprovedVaultWriteOperation({
      store,
      writePort: port,
      operation,
      decision,
      now: () => "2026-05-01T20:00:00.000Z"
    });

    expect(port.applyCount).toBe(0);
    expect(summary.status).toBe("blocked");
    expect(summary.message).toBe("Source Notes/Ragnarok.md is not approved for apply.");
    await expect(store.getVaultWriteApplyResultRecords()).resolves.toEqual([]);
  });

  it("records a precondition failure without calling apply", async () => {
    const store = new InMemoryVaultseerStore();
    const operation = writeOperation();
    const decision = decisionRecord(operation, "approved");
    const port = new FakeWritePort({
      dryRun: {
        operation,
        preview: operation.preview,
        precondition: {
          ok: false,
          reason: "target_exists",
          expectedCurrentHash: null,
          actualCurrentHash: "sha256:existing"
        }
      },
      applyResult: appliedResult(operation)
    });

    const summary = await applyApprovedVaultWriteOperation({
      store,
      writePort: port,
      operation,
      decision,
      now: () => "2026-05-01T20:00:00.000Z"
    });

    expect(port.applyCount).toBe(0);
    expect(summary.status).toBe("failed");
    expect(summary.message).toBe("Could not create Source Notes/Ragnarok.md: target already exists.");
    await expect(store.getVaultWriteApplyResultRecords()).resolves.toEqual([
      {
        operationId: operation.id,
        status: "failed",
        targetPath: operation.targetPath,
        stage: "precondition",
        expectedCurrentHash: null,
        actualCurrentHash: "sha256:existing",
        message: "target already exists",
        retryable: false,
        failedAt: "2026-05-01T20:00:00.000Z"
      }
    ]);
  });

  it("records a retryable write failure when the port throws", async () => {
    const store = new InMemoryVaultseerStore();
    const operation = writeOperation();
    const decision = decisionRecord(operation, "approved");
    const port = new FakeWritePort({
      dryRun: okDryRun(operation),
      applyError: new Error("disk is read-only")
    });

    const summary = await applyApprovedVaultWriteOperation({
      store,
      writePort: port,
      operation,
      decision,
      now: () => "2026-05-01T20:00:00.000Z"
    });

    expect(port.applyCount).toBe(1);
    expect(summary.status).toBe("failed");
    expect(summary.message).toBe("Could not create Source Notes/Ragnarok.md: disk is read-only.");
    await expect(store.getVaultWriteApplyResultRecords()).resolves.toEqual([
      {
        operationId: operation.id,
        status: "failed",
        targetPath: operation.targetPath,
        stage: "write",
        expectedCurrentHash: null,
        actualCurrentHash: null,
        message: "disk is read-only",
        retryable: true,
        failedAt: "2026-05-01T20:00:00.000Z"
      }
    ]);
  });
});

class FakeWritePort implements VaultWritePort {
  applyCount = 0;

  constructor(
    private readonly options: {
      dryRun: VaultWriteDryRunResult;
      applyResult?: VaultWriteApplyResult;
      applyError?: Error;
    }
  ) {}

  async dryRun(): Promise<VaultWriteDryRunResult> {
    return this.options.dryRun;
  }

  async apply(): Promise<VaultWriteApplyResult> {
    this.applyCount += 1;
    if (this.options.applyError) throw this.options.applyError;
    if (!this.options.applyResult) throw new Error("missing fake apply result");
    return this.options.applyResult;
  }
}

function okDryRun(operation: GuardedVaultWriteOperation): VaultWriteDryRunResult {
  return {
    operation,
    preview: operation.preview,
    precondition: { ok: true }
  };
}

function appliedResult(operation: GuardedVaultWriteOperation): VaultWriteApplyResult {
  return {
    operationId: operation.id,
    targetPath: operation.targetPath,
    beforeHash: null,
    afterHash: operation.preview.afterHash,
    appliedAt: "2026-05-01T20:00:00.000Z"
  };
}

function decisionRecord(
  operation: GuardedVaultWriteOperation,
  decision: VaultWriteDecisionRecord["decision"]
): VaultWriteDecisionRecord {
  return createVaultWriteDecisionRecord({
    operation,
    decision,
    decidedAt: "2026-05-01T19:00:00.000Z"
  });
}

function writeOperation(overrides: Partial<GuardedVaultWriteOperation> = {}): GuardedVaultWriteOperation {
  return {
    ...planSourceNoteCreationOperation({
      proposal: sourceNoteProposal(),
      targetPath: "Source Notes/Ragnarok.md",
      suggestionIds: ["suggestion:source-note:source:ragnarok:draft"],
      createdAt: "2026-05-01T15:00:00.000Z"
    }),
    ...overrides
  };
}

function sourceNoteProposal(overrides: Partial<SourceNoteProposal> = {}): SourceNoteProposal {
  return {
    sourceId: "source:ragnarok",
    sourcePath: "Sources/ragnarok-paper.pdf",
    sourceContentHash: "sha256:ragnarok",
    title: "Ragnarok",
    summary: "Ragnarok appears in medieval Icelandic literature.",
    aliases: [],
    outlineHeadings: [],
    suggestedTags: [],
    suggestedLinks: [],
    relatedNotes: [],
    markdownPreview: "# Ragnarok\n",
    evidence: [{ type: "source_filename", value: "ragnarok-paper.pdf" }],
    ...overrides
  };
}
