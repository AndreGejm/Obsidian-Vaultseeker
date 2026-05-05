import type { GuardedVaultWriteOperation, VaultWriteApplyResultRecord } from "@vaultseer/core";
import {
  createVaultWriteDecisionRecord,
  planNoteContentRewriteOperation,
  planNoteLinkUpdateOperation,
  planNoteTagUpdateOperation
} from "@vaultseer/core";
import { describe, expect, it } from "vitest";
import { buildStudioNoteProposalCards } from "../src/studio-note-proposal-cards";

describe("buildStudioNoteProposalCards", () => {
  it("explains the empty proposal state for the active note", () => {
    const state = buildStudioNoteProposalCards({
      activePath: "Notes/VHDL.md",
      writeOperations: []
    });

    expect(state).toEqual({
      status: "empty",
      message: "No proposed changes are waiting for this note.",
      hiddenHistoryCount: 0,
      cards: []
    });
  });

  it("turns current-note write operations into readable proposal cards", () => {
    const operation = tagUpdateOperation();

    const state = buildStudioNoteProposalCards({
      activePath: "Notes/VHDL.md",
      writeOperations: [operation]
    });

    expect(state.status).toBe("ready");
    expect(state.cards).toEqual([
      {
        id: "write-1",
        title: "Tag update",
        targetPath: "Notes/VHDL.md",
        summary: "Add tags: vhdl",
        reviewSurface: "inline",
        reviewMessage: "This current note change can be reviewed inline.",
        decisionState: "pending",
        decisionLabel: "Pending review",
        applyState: "not_applied",
        applyLabel: "Not applied",
        canApply: false,
        queueSection: "active",
        previewDiff: expect.stringContaining("tags:"),
        controls: [
          { type: "approve", label: "Approve", enabled: true },
          { type: "defer", label: "Defer", enabled: true },
          { type: "reject", label: "Reject", enabled: true },
          { type: "approve_apply", label: "Approve and apply", enabled: true },
          { type: "apply", label: "Apply tag update", enabled: false }
        ]
      }
    ]);
  });

  it("makes approved current-note rewrites directly applicable inline", () => {
    const operation = rewriteOperation();
    const decision = createVaultWriteDecisionRecord({
      operation,
      decision: "approved",
      decidedAt: "2026-05-03T10:30:00.000Z"
    });

    const state = buildStudioNoteProposalCards({
      activePath: "Notes/VHDL.md",
      writeOperations: [operation],
      decisions: [decision],
      applyResults: []
    });

    expect(state.status).toBe("ready");
    expect(state.cards[0]).toMatchObject({
      id: "write-rewrite-1",
      title: "Note rewrite",
      reviewSurface: "inline",
      reviewMessage: "This current note change can be reviewed inline.",
      decisionState: "approved",
      decisionLabel: "Approved for later apply",
      applyState: "not_applied",
      canApply: true,
      controls: [
        { type: "approve", label: "Approve", enabled: false },
        { type: "defer", label: "Defer", enabled: true },
        { type: "reject", label: "Reject", enabled: true },
        { type: "approve_apply", label: "Approve and apply", enabled: false },
        { type: "apply", label: "Apply note rewrite", enabled: true }
      ]
    });
  });

  it("makes approved current-note link updates directly applicable inline", () => {
    const operation = linkUpdateOperation();
    const decision = createVaultWriteDecisionRecord({
      operation,
      decision: "approved",
      decidedAt: "2026-05-03T10:30:00.000Z"
    });

    const state = buildStudioNoteProposalCards({
      activePath: "Notes/VHDL.md",
      writeOperations: [operation],
      decisions: [decision],
      applyResults: []
    });

    expect(state.status).toBe("ready");
    expect(state.cards[0]).toMatchObject({
      id: "write-link-1",
      title: "Link update",
      reviewSurface: "inline",
      reviewMessage: "This current note change can be reviewed inline.",
      decisionState: "approved",
      applyState: "not_applied",
      canApply: true,
      controls: [
        { type: "approve", label: "Approve", enabled: false },
        { type: "defer", label: "Defer", enabled: true },
        { type: "reject", label: "Reject", enabled: true },
        { type: "approve_apply", label: "Approve and apply", enabled: false },
        { type: "apply", label: "Apply link update", enabled: true }
      ]
    });
  });

  it("hides applied current-note proposal history by default", () => {
    const operation = tagUpdateOperation();

    const state = buildStudioNoteProposalCards({
      activePath: "Notes/VHDL.md",
      writeOperations: [operation],
      decisions: [
        createVaultWriteDecisionRecord({
          operation,
          decision: "approved",
          decidedAt: "2026-05-03T10:30:00.000Z"
        })
      ],
      applyResults: [appliedResult(operation)]
    });

    expect(state).toEqual({
      status: "empty",
      message: "No proposed changes are waiting for this note. 1 completed change is hidden.",
      hiddenHistoryCount: 1,
      cards: []
    });
  });

  it("can include applied current-note proposal history without active controls", () => {
    const operation = tagUpdateOperation();

    const state = buildStudioNoteProposalCards({
      activePath: "Notes/VHDL.md",
      writeOperations: [operation],
      decisions: [
        createVaultWriteDecisionRecord({
          operation,
          decision: "approved",
          decidedAt: "2026-05-03T10:30:00.000Z"
        })
      ],
      applyResults: [appliedResult(operation)],
      includeHistory: true
    });

    expect(state.cards[0]).toMatchObject({
      queueSection: "history",
      applyState: "applied",
      applyLabel: "Applied at 2026-05-03T10:45:00.000Z",
      canApply: false,
      controls: [
        { type: "approve", label: "Approve", enabled: false },
        { type: "defer", label: "Defer", enabled: false },
        { type: "reject", label: "Reject", enabled: false },
        { type: "approve_apply", label: "Approve and apply", enabled: false },
        { type: "apply", label: "Tag update applied", enabled: false }
      ]
    });
  });

  it("shows active current-note proposals before applied history", () => {
    const appliedOperation = tagUpdateOperation();
    const pendingOperation = rewriteOperation();

    const state = buildStudioNoteProposalCards({
      activePath: "Notes/VHDL.md",
      writeOperations: [appliedOperation, pendingOperation],
      decisions: [
        createVaultWriteDecisionRecord({
          operation: appliedOperation,
          decision: "approved",
          decidedAt: "2026-05-03T10:30:00.000Z"
        })
      ],
      applyResults: [appliedResult(appliedOperation)],
      includeHistory: true
    });

    expect(state.cards.map((card) => card.id)).toEqual(["write-rewrite-1", "write-1"]);
    expect(state.cards.map((card) => card.queueSection)).toEqual(["active", "history"]);
  });

  it("ignores proposals for other notes", () => {
    const state = buildStudioNoteProposalCards({
      activePath: "Notes/VHDL.md",
      writeOperations: [
        tagUpdateOperation({
          targetPath: "Notes/Other.md"
        })
      ]
    });

    expect(state.status).toBe("empty");
    expect(state.cards).toEqual([]);
  });
});

function tagUpdateOperation(overrides: Partial<GuardedVaultWriteOperation> = {}): GuardedVaultWriteOperation {
  return {
    ...planNoteTagUpdateOperation({
      targetPath: "Notes/VHDL.md",
      currentContent: "---\ntags:\n- fpga\n---\n# VHDL\n",
      tagsToAdd: ["vhdl"],
      suggestionIds: ["suggestion:note-tag:Notes/VHDL.md:vhdl"],
      createdAt: "2026-05-03T10:00:00.000Z"
    }),
    id: "write-1",
    ...overrides
  };
}

function rewriteOperation(overrides: Partial<GuardedVaultWriteOperation> = {}): GuardedVaultWriteOperation {
  return {
    ...planNoteContentRewriteOperation({
      targetPath: "Notes/VHDL.md",
      currentContent: "# VHDL\n\nOld prose.\n",
      proposedContent: "# VHDL\n\n## Overview\n\nClearer prose.\n",
      reason: "Improve note structure.",
      suggestionIds: ["suggestion:note-rewrite:Notes/VHDL.md:codex"],
      createdAt: "2026-05-03T10:00:00.000Z"
    }),
    id: "write-rewrite-1",
    ...overrides
  };
}

function linkUpdateOperation(overrides: Partial<GuardedVaultWriteOperation> = {}): GuardedVaultWriteOperation {
  return {
    ...planNoteLinkUpdateOperation({
      targetPath: "Notes/VHDL.md",
      currentContent: "# VHDL\n\nSee [[Missing Timing Note]].\n",
      replacements: [
        {
          rawLink: "[[Missing Timing Note]]",
          unresolvedTarget: "Missing Timing Note",
          suggestedPath: "Notes/Timing Closure.md"
        }
      ],
      suggestionIds: ["suggestion:note-link:Notes/VHDL.md:Missing Timing Note:Notes/Timing Closure.md"],
      createdAt: "2026-05-03T10:00:00.000Z"
    }),
    id: "write-link-1",
    ...overrides
  };
}

function appliedResult(operation: GuardedVaultWriteOperation): VaultWriteApplyResultRecord {
  return {
    operationId: operation.id,
    status: "applied",
    targetPath: operation.targetPath,
    beforeHash: operation.expectedCurrentHash,
    afterHash: operation.preview.afterHash,
    appliedAt: "2026-05-03T10:45:00.000Z"
  };
}
