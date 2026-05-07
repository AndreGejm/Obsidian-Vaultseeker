import type { GuardedVaultWriteOperation, VaultWriteApplyResultRecord } from "@vaultseer/core";
import {
  createVaultWriteDecisionRecord,
  planNoteContentRewriteOperation,
  planNoteLinkUpdateOperation,
  planNoteTagUpdateOperation
} from "@vaultseer/core";
import { describe, expect, it } from "vitest";
import { buildStudioNoteProposalCards, countActiveCurrentNoteProposals } from "../src/studio-note-proposal-cards";

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
        title: "Add tags",
        targetPath: "Notes/VHDL.md",
        summary: "Add tags: vhdl",
        reviewSurface: "inline",
        reviewMessage: "This current note change can be reviewed inline.",
        decisionState: "pending",
        decisionLabel: "Pending review",
        applyState: "not_applied",
        applyLabel: "Not applied",
        canApply: false,
        canEdit: false,
        queueSection: "active",
        previewDiff: expect.stringContaining("tags:"),
        controls: [
          { type: "accept", label: "Write to note", enabled: true, tone: "primary" },
          { type: "edit", label: "Edit draft", enabled: false, tone: "secondary" },
          { type: "defer", label: "Later", enabled: true, tone: "secondary" },
          { type: "reject", label: "Discard", enabled: true, tone: "secondary" }
        ]
      }
    ]);
  });

  it("allows pending current-note rewrites to be edited before accepting", () => {
    const operation = rewriteOperation();

    const state = buildStudioNoteProposalCards({
      activePath: "Notes/VHDL.md",
      writeOperations: [operation]
    });

    expect(state.cards[0]).toMatchObject({
      id: "write-rewrite-1",
      title: "Rewrite note",
      canApply: false,
      canEdit: true,
      controls: [
        { type: "accept", label: "Write to note", enabled: true, tone: "primary" },
        { type: "edit", label: "Edit draft", enabled: true, tone: "secondary" },
        { type: "defer", label: "Later", enabled: true, tone: "secondary" },
        { type: "reject", label: "Discard", enabled: true, tone: "secondary" }
      ]
    });
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
      title: "Rewrite note",
      reviewSurface: "inline",
      reviewMessage: "This current note change can be reviewed inline.",
      decisionState: "approved",
      decisionLabel: "Approved",
      applyState: "not_applied",
      canApply: true,
      canEdit: true,
      controls: [
        { type: "accept", label: "Write to note", enabled: true, tone: "primary" },
        { type: "edit", label: "Edit draft", enabled: true, tone: "secondary" },
        { type: "defer", label: "Later", enabled: true, tone: "secondary" },
        { type: "reject", label: "Discard", enabled: true, tone: "secondary" }
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
      title: "Fix links",
      reviewSurface: "inline",
      reviewMessage: "This current note change can be reviewed inline.",
      decisionState: "approved",
      applyState: "not_applied",
      canApply: true,
      canEdit: false,
      controls: [
        { type: "accept", label: "Write to note", enabled: true, tone: "primary" },
        { type: "edit", label: "Edit draft", enabled: false, tone: "secondary" },
        { type: "defer", label: "Later", enabled: true, tone: "secondary" },
        { type: "reject", label: "Discard", enabled: true, tone: "secondary" }
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

  it("can include applied current-note proposal history as read-only cards", () => {
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
      canEdit: false,
      controls: []
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

  it("counts only actionable current-note proposals for chat badges", () => {
    const completedOperation = tagUpdateOperation();
    const activeOperation = rewriteOperation();

    expect(
      countActiveCurrentNoteProposals({
        activePath: "Notes/VHDL.md",
        writeOperations: [completedOperation, activeOperation],
        decisions: [
          createVaultWriteDecisionRecord({
            operation: completedOperation,
            decision: "approved",
            decidedAt: "2026-05-03T10:30:00.000Z"
          })
        ],
        applyResults: [appliedResult(completedOperation)]
      })
    ).toBe(1);
  });

  it("does not count completed proposal history as active work", () => {
    const completedOperation = tagUpdateOperation();

    expect(
      countActiveCurrentNoteProposals({
        activePath: "Notes/VHDL.md",
        writeOperations: [completedOperation],
        decisions: [
          createVaultWriteDecisionRecord({
            operation: completedOperation,
            decision: "approved",
            decidedAt: "2026-05-03T10:30:00.000Z"
          })
        ],
        applyResults: [appliedResult(completedOperation)]
      })
    ).toBe(0);
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
