import type { GuardedVaultWriteOperation, TagSuggestion, VaultseerStore } from "@vaultseer/core";
import {
  createNoteTagSuggestionRecords,
  mergeSuggestionRecords,
  mergeVaultWriteOperations,
  planNoteTagUpdateOperation
} from "@vaultseer/core";

export type StageNoteTagUpdateProposalInput = {
  store: VaultseerStore;
  targetPath: string;
  currentContent: string;
  tagSuggestions: TagSuggestion[];
  now: () => string;
  maxTags?: number;
  beforeCommit?: () => boolean | Promise<boolean>;
};

export type StageNoteTagUpdateProposalSummary =
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

export async function stageNoteTagUpdateProposal(
  input: StageNoteTagUpdateProposalInput
): Promise<StageNoteTagUpdateProposalSummary> {
  const tagSuggestions = selectTagSuggestions(input.tagSuggestions, input.maxTags);

  if (tagSuggestions.length === 0) {
    return skipped(input.targetPath, 0, "No tag suggestions are available to stage.");
  }

  const createdAt = input.now();
  const suggestionRecords = createNoteTagSuggestionRecords(
    {
      targetPath: input.targetPath,
      suggestions: tagSuggestions
    },
    createdAt
  );
  const operation = planNoteTagUpdateOperation({
    targetPath: input.targetPath,
    currentContent: input.currentContent,
    tagsToAdd: tagSuggestions.map((suggestion) => suggestion.tag),
    suggestionIds: suggestionRecords.map((record) => record.id),
    createdAt
  });

  if (operation.tagUpdate.addedTags.length === 0) {
    return skipped(
      input.targetPath,
      tagSuggestions.length,
      "The suggested tags are already present in the current file."
    );
  }

  const [existingSuggestions, existingOperations] = await Promise.all([
    input.store.getSuggestionRecords(),
    input.store.getVaultWriteOperations()
  ]);

  if (input.beforeCommit && (await input.beforeCommit()) !== true) {
    return skipped(
      input.targetPath,
      tagSuggestions.length,
      "The active note changed before staging could finish. Nothing was staged."
    );
  }

  await Promise.all([
    input.store.replaceSuggestionRecords(mergeSuggestionRecords(existingSuggestions, suggestionRecords)),
    input.store.replaceVaultWriteOperations(mergeVaultWriteOperations(existingOperations, [operation]))
  ]);

  return {
    status: "planned",
    targetPath: input.targetPath,
    suggestionCount: suggestionRecords.length,
    operation,
    message: `Staged ${formatCount(suggestionRecords.length, "tag suggestion")} for review. No note was changed.`
  };
}

function selectTagSuggestions(suggestions: TagSuggestion[], maxTags: number | undefined): TagSuggestion[] {
  const limit = maxTags ?? suggestions.length;
  return suggestions
    .filter((suggestion) => suggestion.tag.trim().length > 0)
    .slice(0, Math.max(0, limit));
}

function skipped(
  targetPath: string,
  suggestionCount: number,
  message: string
): StageNoteTagUpdateProposalSummary {
  return {
    status: "skipped",
    targetPath,
    suggestionCount,
    operation: null,
    message
  };
}

function formatCount(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
