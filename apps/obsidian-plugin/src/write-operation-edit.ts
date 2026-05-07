import type { GuardedVaultWriteOperation, VaultWritePreview } from "@vaultseer/core";
import {
  hashString,
  planNoteContentRewriteOperation,
  planNoteLinkUpdateOperation,
  planNoteTagUpdateOperation
} from "@vaultseer/core";

export type EditVaultWriteOperationContentInput = {
  operation: GuardedVaultWriteOperation;
  editedContent: string;
  currentContent?: string | undefined;
};

export type RefreshRewriteOperationForCurrentContentInput = {
  operation: GuardedVaultWriteOperation;
  currentContent: string;
};

export function isEditableVaultWriteOperation(operation: GuardedVaultWriteOperation): boolean {
  return operation.type === "create_note_from_source" || operation.type === "rewrite_note_content";
}

export function editVaultWriteOperationContent(
  input: EditVaultWriteOperationContentInput
): GuardedVaultWriteOperation {
  if (input.operation.type === "create_note_from_source") {
    const content = normalizeWriteContent(input.editedContent);
    const operationHash = hashString(
      [
        input.operation.source.sourceId,
        input.operation.source.sourceContentHash,
        input.operation.targetPath,
        hashString(content)
      ].join("\n")
    );

    return {
      ...input.operation,
      id: `vault-write:create-note-from-source:${input.operation.source.sourceId}:${operationHash}`,
      content,
      preview: createFilePreview(input.operation.targetPath, content)
    };
  }

  if (input.operation.type === "rewrite_note_content") {
    if (input.currentContent === undefined) {
      throw new Error("Current note content is required to edit a rewrite proposal.");
    }

    return planNoteContentRewriteOperation({
      targetPath: input.operation.targetPath,
      currentContent: input.currentContent,
      proposedContent: input.editedContent,
      reason: input.operation.rewrite.reason,
      suggestionIds: input.operation.suggestionIds,
      createdAt: input.operation.createdAt
    });
  }

  throw new Error("Only source-note creation and note rewrite proposals can be edited.");
}

export function refreshRewriteOperationForCurrentContent(
  input: RefreshRewriteOperationForCurrentContentInput
): GuardedVaultWriteOperation | null {
  if (input.operation.type !== "rewrite_note_content") {
    return null;
  }

  return editVaultWriteOperationContent({
    operation: input.operation,
    currentContent: input.currentContent,
    editedContent: input.operation.content
  });
}

export function refreshActiveNoteOperationForCurrentContent(
  input: RefreshRewriteOperationForCurrentContentInput
): GuardedVaultWriteOperation {
  switch (input.operation.type) {
    case "rewrite_note_content":
      return editVaultWriteOperationContent({
        operation: input.operation,
        currentContent: input.currentContent,
        editedContent: input.operation.content
      });
    case "update_note_tags":
      return planNoteTagUpdateOperation({
        targetPath: input.operation.targetPath,
        currentContent: input.currentContent,
        tagsToAdd: input.operation.tagUpdate.addedTags,
        suggestionIds: input.operation.suggestionIds,
        createdAt: input.operation.createdAt
      });
    case "update_note_links":
      return planNoteLinkUpdateOperation({
        targetPath: input.operation.targetPath,
        currentContent: input.currentContent,
        replacements: input.operation.linkUpdate.replacements.map((replacement) => ({
          rawLink: replacement.rawLink,
          unresolvedTarget: replacement.unresolvedTarget,
          suggestedPath: replacement.suggestedPath
        })),
        suggestionIds: input.operation.suggestionIds,
        createdAt: input.operation.createdAt
      });
    case "create_note_from_source":
      return input.operation;
  }
}

function createFilePreview(targetPath: string, content: string): VaultWritePreview {
  const lines = contentLines(content);

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

function contentLines(content: string): string[] {
  const lines = content.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function normalizeWriteContent(content: string): string {
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return normalized.endsWith("\n") ? normalized : `${normalized}\n`;
}
