import { describe, expect, it } from "vitest";
import type { GuardedVaultWriteOperation, SourceNoteProposal } from "@vaultseer/core";
import {
  planNoteContentRewriteOperation,
  planNoteLinkUpdateOperation,
  planNoteTagUpdateOperation,
  planSourceNoteCreationOperation
} from "@vaultseer/core";
import {
  editVaultWriteOperationContent,
  isEditableVaultWriteOperation,
  refreshActiveNoteOperationForCurrentContent,
  refreshRewriteOperationForCurrentContent
} from "../src/write-operation-edit";

describe("editVaultWriteOperationContent", () => {
  it("replaces source-note proposal content and regenerates the preview", () => {
    const operation = sourceCreationOperation();

    const edited = editVaultWriteOperationContent({
      operation,
      editedContent: "# Edited Source Note\n\nBetter structure.\n"
    });

    expect(edited).toMatchObject({
      type: "create_note_from_source",
      targetPath: operation.targetPath,
      expectedCurrentHash: null,
      content: "# Edited Source Note\n\nBetter structure.\n",
      source: operation.source,
      suggestionIds: operation.suggestionIds,
      createdAt: operation.createdAt,
      preview: {
        kind: "create_file",
        targetPath: operation.targetPath,
        beforeHash: null,
        additions: 3,
        deletions: 0,
        diff: expect.stringContaining("+# Edited Source Note")
      }
    });
    expect(edited.id).not.toBe(operation.id);
  });

  it("replaces note rewrite content using the current note text as the diff base", () => {
    const operation = rewriteOperation();

    const edited = editVaultWriteOperationContent({
      operation,
      currentContent: "# Resistors\n\nOriginal text.\n",
      editedContent: "# Resistors\n\n## Overview\n\nEdited text.\n"
    });

    expect(edited).toMatchObject({
      type: "rewrite_note_content",
      targetPath: operation.targetPath,
      expectedCurrentHash: operation.expectedCurrentHash,
      content: "# Resistors\n\n## Overview\n\nEdited text.\n",
      rewrite: {
        reason: operation.rewrite.reason,
        beforeHash: operation.expectedCurrentHash,
        afterHash: expect.any(String)
      },
      preview: {
        kind: "modify_file",
        beforeHash: operation.expectedCurrentHash,
        additions: 5,
        deletions: 3,
        diff: expect.stringContaining("+## Overview")
      }
    });
    expect(edited.id).not.toBe(operation.id);
  });

  it("rejects editing metadata-only proposals", () => {
    const operation = planNoteTagUpdateOperation({
      targetPath: "Electronics/Resistors.md",
      currentContent: "# Resistors\n",
      tagsToAdd: ["electronics"],
      suggestionIds: ["suggestion:tag"],
      createdAt: "2026-05-07T10:00:00.000Z"
    });

    expect(isEditableVaultWriteOperation(operation)).toBe(false);
    expect(() =>
      editVaultWriteOperationContent({
        operation,
        editedContent: "# Resistors\n"
      })
    ).toThrow("Only source-note creation and note rewrite proposals can be edited.");
  });
});

describe("refreshRewriteOperationForCurrentContent", () => {
  it("rebases an active-note rewrite onto the current note text before accept", () => {
    const operation = rewriteOperation();

    const refreshed = refreshRewriteOperationForCurrentContent({
      operation,
      currentContent: "# Resistors\n\nUser added a sentence after the proposal was drafted.\n"
    });

    expect(refreshed).not.toBeNull();
    expect(refreshed).toMatchObject({
      type: "rewrite_note_content",
      targetPath: operation.targetPath,
      content: operation.content,
      expectedCurrentHash: expect.not.stringMatching(operation.expectedCurrentHash ?? ""),
      preview: {
        kind: "modify_file",
        diff: expect.stringContaining("-User added a sentence after the proposal was drafted.")
      }
    });
    expect(refreshed?.id).not.toBe(operation.id);
  });

  it("leaves non-rewrite proposals unchanged", () => {
    const operation = planNoteTagUpdateOperation({
      targetPath: "Electronics/Resistors.md",
      currentContent: "# Resistors\n",
      tagsToAdd: ["electronics"],
      suggestionIds: ["suggestion:tag"],
      createdAt: "2026-05-07T10:00:00.000Z"
    });

    expect(refreshRewriteOperationForCurrentContent({ operation, currentContent: "# Resistors\n" })).toBeNull();
  });
});

describe("refreshActiveNoteOperationForCurrentContent", () => {
  it("rebases an active-note tag proposal onto the current note text before accept", () => {
    const operation = planNoteTagUpdateOperation({
      targetPath: "Electronics/Resistors.md",
      currentContent: "# Resistors\n",
      tagsToAdd: ["electronics"],
      suggestionIds: ["suggestion:tag"],
      createdAt: "2026-05-07T10:00:00.000Z"
    });

    const refreshed = refreshActiveNoteOperationForCurrentContent({
      operation,
      currentContent: "# Resistors\n\nUser added a sentence after the proposal was drafted.\n"
    });

    expect(refreshed).toMatchObject({
      type: "update_note_tags",
      targetPath: operation.targetPath,
      expectedCurrentHash: expect.not.stringMatching(operation.expectedCurrentHash),
      content: expect.stringContaining("User added a sentence after the proposal was drafted."),
      tagUpdate: {
        addedTags: ["electronics"]
      }
    });
    expect(refreshed.content).toContain("tags:");
    expect(refreshed.content).toContain("- electronics");
    expect(refreshed.id).not.toBe(operation.id);
  });

  it("rebases an active-note link proposal onto the current note text before accept", () => {
    const operation = planNoteLinkUpdateOperation({
      targetPath: "Electronics/Resistors.md",
      currentContent: "# Resistors\n\nSee [[Ohm law]].\n",
      replacements: [
        {
          rawLink: "[[Ohm law]]",
          unresolvedTarget: "Ohm law",
          suggestedPath: "Electronics/Ohm's law.md"
        }
      ],
      suggestionIds: ["suggestion:link"],
      createdAt: "2026-05-07T10:00:00.000Z"
    });

    const refreshed = refreshActiveNoteOperationForCurrentContent({
      operation,
      currentContent: "# Resistors\n\nUser added context.\n\nSee [[Ohm law]].\n"
    });

    expect(refreshed).toMatchObject({
      type: "update_note_links",
      targetPath: operation.targetPath,
      expectedCurrentHash: expect.not.stringMatching(operation.expectedCurrentHash),
      content: expect.stringContaining("User added context."),
      linkUpdate: {
        replacements: [
          {
            rawLink: "[[Ohm law]]",
            unresolvedTarget: "Ohm law",
            suggestedPath: "Electronics/Ohm's law.md"
          }
        ]
      }
    });
    expect(refreshed.content).toContain("[[Electronics/Ohm's law|Ohm law]]");
    expect(refreshed.id).not.toBe(operation.id);
  });
});

function sourceCreationOperation(overrides: Partial<GuardedVaultWriteOperation> = {}): GuardedVaultWriteOperation {
  return {
    ...planSourceNoteCreationOperation({
      proposal: sourceNoteProposal(),
      targetPath: "Source Notes/Resistors.md",
      suggestionIds: ["suggestion:source-note:resistors"],
      createdAt: "2026-05-07T10:00:00.000Z"
    }),
    ...overrides
  };
}

function rewriteOperation(overrides: Partial<GuardedVaultWriteOperation> = {}): GuardedVaultWriteOperation {
  return {
    ...planNoteContentRewriteOperation({
      targetPath: "Electronics/Resistors.md",
      currentContent: "# Resistors\n\nOriginal text.\n",
      proposedContent: "# Resistors\n\nStructured text.\n",
      reason: "Improve readability.",
      suggestionIds: ["suggestion:rewrite"],
      createdAt: "2026-05-07T10:00:00.000Z"
    }),
    ...overrides
  };
}

function sourceNoteProposal(overrides: Partial<SourceNoteProposal> = {}): SourceNoteProposal {
  return {
    sourceId: "source:resistors",
    sourcePath: "Sources/resistors.pdf",
    sourceContentHash: "sha256:source",
    title: "Resistors",
    summary: "Resistor source.",
    aliases: [],
    outlineHeadings: [],
    suggestedTags: [],
    suggestedLinks: [],
    relatedNotes: [],
    markdownPreview: "# Resistors\n",
    evidence: [{ type: "source_filename", value: "resistors.pdf" }],
    ...overrides
  };
}
