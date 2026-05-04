import type { GuardedVaultWriteOperation, SuggestionRecord, VaultseerStore } from "@vaultseer/core";
import {
  hashString,
  mergeSuggestionRecords,
  mergeVaultWriteOperations,
  planNoteContentRewriteOperation
} from "@vaultseer/core";

export type StageNoteRewriteProposalInput = {
  store: VaultseerStore;
  targetPath: string;
  currentContent: string;
  proposedContent: string;
  reason: string | null;
  now: () => string;
  beforeCommit?: () => boolean | Promise<boolean>;
};

export type StageNoteRewriteProposalSummary =
  | {
      status: "planned";
      targetPath: string;
      suggestionCount: number;
      operation: GuardedVaultWriteOperation;
      message: string;
    }
  | {
      status: "skipped";
      targetPath: string;
      suggestionCount: number;
      operation: null;
      message: string;
    };

export async function stageNoteRewriteProposal(
  input: StageNoteRewriteProposalInput
): Promise<StageNoteRewriteProposalSummary> {
  const createdAt = input.now();
  const suggestionRecord = createNoteRewriteSuggestionRecord({
    targetPath: input.targetPath,
    proposedContent: input.proposedContent,
    reason: input.reason,
    createdAt
  });
  const operation = planNoteContentRewriteOperation({
    targetPath: input.targetPath,
    currentContent: input.currentContent,
    proposedContent: input.proposedContent,
    reason: input.reason,
    suggestionIds: [suggestionRecord.id],
    createdAt
  });

  if (operation.preview.beforeHash === operation.preview.afterHash) {
    return skipped(input.targetPath, "The proposed rewrite matches the current file.");
  }

  const [existingSuggestions, existingOperations] = await Promise.all([
    input.store.getSuggestionRecords(),
    input.store.getVaultWriteOperations()
  ]);

  if (input.beforeCommit && (await input.beforeCommit()) !== true) {
    return skipped(input.targetPath, "The active note changed before staging could finish. Nothing was staged.");
  }

  await Promise.all([
    input.store.replaceSuggestionRecords(mergeSuggestionRecords(existingSuggestions, [suggestionRecord])),
    input.store.replaceVaultWriteOperations(mergeVaultWriteOperations(existingOperations, [operation]))
  ]);

  return {
    status: "planned",
    targetPath: input.targetPath,
    suggestionCount: 1,
    operation,
    message: "Staged 1 note rewrite for review. No note was changed."
  };
}

function createNoteRewriteSuggestionRecord(input: {
  targetPath: string;
  proposedContent: string;
  reason: string | null;
  createdAt: string;
}): SuggestionRecord {
  const contentHash = hashString(input.proposedContent);
  return {
    id: `suggestion:note-rewrite:${input.targetPath}:${contentHash}`,
    type: "note_rewrite",
    targetPath: input.targetPath,
    confidence: 0.6,
    evidence: input.reason ? [{ type: "assistant_note_rewrite", reason: input.reason }] : [],
    createdAt: input.createdAt
  };
}

function skipped(targetPath: string, message: string): StageNoteRewriteProposalSummary {
  return {
    status: "skipped",
    targetPath,
    suggestionCount: 0,
    operation: null,
    message
  };
}
