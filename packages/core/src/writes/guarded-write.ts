import { hashString } from "../chunking/text-chunking";
import type { SourceNoteProposal } from "../source/source-note-proposal";

export type VaultWriteOperationType = "create_note_from_source";

export type VaultWritePreview = {
  kind: "create_file";
  targetPath: string;
  beforeHash: string | null;
  afterHash: string;
  diff: string;
  additions: number;
  deletions: number;
};

export type SourceNoteCreationOperation = {
  id: string;
  type: "create_note_from_source";
  targetPath: string;
  expectedCurrentHash: string | null;
  content: string;
  preview: VaultWritePreview;
  source: {
    sourceId: string;
    sourcePath: string;
    sourceContentHash: string;
  };
  suggestionIds: string[];
  createdAt: string;
};

export type GuardedVaultWriteOperation = SourceNoteCreationOperation;

export type PlanSourceNoteCreationOperationInput = {
  proposal: SourceNoteProposal;
  targetPath: string;
  suggestionIds: string[];
  createdAt: string;
};

export type VaultWriteCurrentSnapshot = {
  path: string;
  currentHash: string | null;
};

export type VaultWritePreconditionReason = "wrong_target" | "target_exists" | "missing_file" | "stale_file";

export type VaultWritePreconditionResult =
  | { ok: true }
  | {
      ok: false;
      reason: VaultWritePreconditionReason;
      expectedCurrentHash: string | null;
      actualCurrentHash: string | null;
    };

export type VaultWriteDecision = "approved" | "rejected" | "deferred";

export type VaultWriteDecisionRecord = {
  operationId: string;
  decision: VaultWriteDecision;
  targetPath: string;
  suggestionIds: string[];
  decidedAt: string;
};

export type CreateVaultWriteDecisionRecordInput = {
  operation: GuardedVaultWriteOperation;
  decision: VaultWriteDecision;
  decidedAt: string;
};

export type VaultWriteApproval = {
  operationId: string;
  targetPath: string;
  expectedCurrentHash: string | null;
  afterHash: string;
  approvedAt: string;
};

export type VaultWriteDryRunResult = {
  operation: GuardedVaultWriteOperation;
  precondition: VaultWritePreconditionResult;
  preview: VaultWritePreview;
};

export type VaultWriteApplyResult = {
  operationId: string;
  targetPath: string;
  beforeHash: string | null;
  afterHash: string;
  appliedAt: string;
};

export interface VaultWritePort {
  dryRun(operation: GuardedVaultWriteOperation): Promise<VaultWriteDryRunResult>;
  apply(operation: GuardedVaultWriteOperation, approval: VaultWriteApproval): Promise<VaultWriteApplyResult>;
}

export function planSourceNoteCreationOperation(input: PlanSourceNoteCreationOperationInput): SourceNoteCreationOperation {
  const content = normalizeWriteContent(input.proposal.markdownPreview);
  const operationHash = hashString([input.proposal.sourceId, input.proposal.sourceContentHash, input.targetPath].join("\n"));

  return {
    id: `vault-write:create-note-from-source:${input.proposal.sourceId}:${operationHash}`,
    type: "create_note_from_source",
    targetPath: input.targetPath,
    expectedCurrentHash: null,
    content,
    preview: createFilePreview(input.targetPath, content),
    source: {
      sourceId: input.proposal.sourceId,
      sourcePath: input.proposal.sourcePath,
      sourceContentHash: input.proposal.sourceContentHash
    },
    suggestionIds: [...input.suggestionIds],
    createdAt: input.createdAt
  };
}

export function evaluateVaultWritePrecondition(
  operation: GuardedVaultWriteOperation,
  current: VaultWriteCurrentSnapshot
): VaultWritePreconditionResult {
  if (current.path !== operation.targetPath) {
    return {
      ok: false,
      reason: "wrong_target",
      expectedCurrentHash: operation.expectedCurrentHash,
      actualCurrentHash: current.currentHash
    };
  }

  if (operation.expectedCurrentHash === null) {
    return current.currentHash === null
      ? { ok: true }
      : {
          ok: false,
          reason: "target_exists",
          expectedCurrentHash: null,
          actualCurrentHash: current.currentHash
        };
  }

  if (current.currentHash === null) {
    return {
      ok: false,
      reason: "missing_file",
      expectedCurrentHash: operation.expectedCurrentHash,
      actualCurrentHash: null
    };
  }

  if (current.currentHash !== operation.expectedCurrentHash) {
    return {
      ok: false,
      reason: "stale_file",
      expectedCurrentHash: operation.expectedCurrentHash,
      actualCurrentHash: current.currentHash
    };
  }

  return { ok: true };
}

export function createVaultWriteDecisionRecord(input: CreateVaultWriteDecisionRecordInput): VaultWriteDecisionRecord {
  return {
    operationId: input.operation.id,
    decision: input.decision,
    targetPath: input.operation.targetPath,
    suggestionIds: [...input.operation.suggestionIds],
    decidedAt: input.decidedAt
  };
}

export function mergeVaultWriteOperations(
  existing: GuardedVaultWriteOperation[],
  incoming: GuardedVaultWriteOperation[]
): GuardedVaultWriteOperation[] {
  const operationsById = new Map<string, GuardedVaultWriteOperation>();
  for (const operation of existing) operationsById.set(operation.id, clone(operation));
  for (const operation of incoming) operationsById.set(operation.id, clone(operation));
  return [...operationsById.values()].sort((left, right) => left.id.localeCompare(right.id));
}

export function upsertVaultWriteDecisionRecord(
  existing: VaultWriteDecisionRecord[],
  incoming: VaultWriteDecisionRecord
): VaultWriteDecisionRecord[] {
  const decisionsByOperationId = new Map<string, VaultWriteDecisionRecord>();
  for (const decision of existing) decisionsByOperationId.set(decision.operationId, clone(decision));
  decisionsByOperationId.set(incoming.operationId, clone(incoming));
  return [...decisionsByOperationId.values()].sort((left, right) => left.operationId.localeCompare(right.operationId));
}

function createFilePreview(targetPath: string, content: string): VaultWritePreview {
  const lines = content.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();

  return {
    kind: "create_file",
    targetPath,
    beforeHash: null,
    afterHash: hashString(content),
    diff: ["--- /dev/null", `+++ b/${targetPath}`, "@@", ...lines.map((line) => `+${line}`), ""].join("\n"),
    additions: lines.length,
    deletions: 0
  };
}

function normalizeWriteContent(content: string): string {
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return normalized.endsWith("\n") ? normalized : `${normalized}\n`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
