import type { GuardedVaultWriteOperation, LinkSuggestion, VaultseerStore } from "@vaultseer/core";
import {
  createNoteLinkSuggestionRecords,
  mergeSuggestionRecords,
  mergeVaultWriteOperations,
  planNoteLinkUpdateOperation
} from "@vaultseer/core";

export type StageNoteLinkUpdateProposalInput = {
  store: VaultseerStore;
  targetPath: string;
  currentContent: string;
  linkSuggestions: LinkSuggestion[];
  now: () => string;
  maxLinks?: number;
};

export type StageNoteLinkUpdateProposalSummary =
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

export async function stageNoteLinkUpdateProposal(
  input: StageNoteLinkUpdateProposalInput
): Promise<StageNoteLinkUpdateProposalSummary> {
  const linkSuggestions = selectLinkSuggestions(input.linkSuggestions, input.maxLinks);

  if (linkSuggestions.length === 0) {
    return skipped(input.targetPath, 0, "No link suggestions are available to stage.");
  }

  const createdAt = input.now();
  const suggestionRecords = createNoteLinkSuggestionRecords(
    {
      targetPath: input.targetPath,
      suggestions: linkSuggestions
    },
    createdAt
  );
  const operation = planNoteLinkUpdateOperation({
    targetPath: input.targetPath,
    currentContent: input.currentContent,
    replacements: linkSuggestions.map((suggestion) => ({
      rawLink: suggestion.rawLink,
      unresolvedTarget: suggestion.unresolvedTarget,
      suggestedPath: suggestion.suggestedPath
    })),
    suggestionIds: suggestionRecords.map((record) => record.id),
    createdAt
  });

  if (operation.linkUpdate.replacements.length === 0) {
    return skipped(
      input.targetPath,
      linkSuggestions.length,
      "The suggested unresolved links are not present in the current file."
    );
  }

  const [existingSuggestions, existingOperations] = await Promise.all([
    input.store.getSuggestionRecords(),
    input.store.getVaultWriteOperations()
  ]);
  await Promise.all([
    input.store.replaceSuggestionRecords(mergeSuggestionRecords(existingSuggestions, suggestionRecords)),
    input.store.replaceVaultWriteOperations(mergeVaultWriteOperations(existingOperations, [operation]))
  ]);

  return {
    status: "planned",
    targetPath: input.targetPath,
    suggestionCount: suggestionRecords.length,
    operation,
    message: `Staged ${formatCount(suggestionRecords.length, "link suggestion")} for review. No note was changed.`
  };
}

function selectLinkSuggestions(suggestions: LinkSuggestion[], maxLinks: number | undefined): LinkSuggestion[] {
  const limit = maxLinks ?? suggestions.length;
  return suggestions
    .filter((suggestion) => suggestion.rawLink.trim().length > 0 && suggestion.suggestedPath.trim().length > 0)
    .slice(0, Math.max(0, limit));
}

function skipped(
  targetPath: string,
  suggestionCount: number,
  message: string
): StageNoteLinkUpdateProposalSummary {
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
