import type { GuardedVaultWriteOperation, VaultWriteApplyResultRecord } from "@vaultseer/core";
import {
  createVaultWriteDecisionRecord,
  planNoteContentRewriteOperation,
  planNoteTagUpdateOperation
} from "@vaultseer/core";
import { describe, expect, it, vi } from "vitest";
import { renderStudioCurrentNoteProposalCards } from "../src/studio-note-proposal-card-view";

describe("renderStudioCurrentNoteProposalCards", () => {
  it("offers completed current-note proposal history without showing it as active work", () => {
    const operation = tagUpdateOperation();
    const container = fakeElement("root");

    renderStudioCurrentNoteProposalCards(
      container as unknown as HTMLElement,
      {
        activePath: "Notes/VHDL.md",
        writeOperations: [operation],
        writeDecisions: [
          createVaultWriteDecisionRecord({
            operation,
            decision: "approved",
            decidedAt: "2026-05-03T10:30:00.000Z"
          })
        ],
        writeApplyResults: [appliedResult(operation)],
        showEmptyState: true
      },
      vi.fn()
    );

    expect(textContentTree(container)).toContain("No proposed changes are waiting for this note. 1 completed change is hidden.");
    expect(findText(container, "Show completed changes (1)")).toBeDefined();
    expect(findText(container, "Completed proposal history")).toBeDefined();
    expect(findText(container, "Add tags")).toBeDefined();
  });

  it("opens active proposal diffs by default so the redline is immediately visible", () => {
    const operation = rewriteOperation();
    const container = fakeElement("root");

    renderStudioCurrentNoteProposalCards(
      container as unknown as HTMLElement,
      {
        activePath: "Notes/VHDL.md",
        writeOperations: [operation],
        writeDecisions: [],
        writeApplyResults: [],
        showEmptyState: true
      },
      vi.fn()
    );

    const diffDetails = findElement(container, "details", "vaultseer-studio-proposal-diff");
    expect(diffDetails?.open).toBe(true);
    expect(textContentTree(container)).toContain("Write to note");
    expect(findElement(container, "button", "vaultseer-studio-proposal-control vaultseer-studio-proposal-control-primary")).toBeDefined();
  });

  it("uses a simpler chat label for active-note proposal cards", () => {
    const operation = rewriteOperation();
    const container = fakeElement("root");

    renderStudioCurrentNoteProposalCards(
      container as unknown as HTMLElement,
      {
        activePath: "Notes/VHDL.md",
        writeOperations: [operation],
        writeDecisions: [],
        writeApplyResults: [],
        showEmptyState: false,
        surface: "chat"
      },
      vi.fn()
    );

    const renderedText = textContentTree(container);
    expect(renderedText).toContain("Ready to write to active note");
    expect(renderedText).toContain("Review the redline, edit if needed, then press Write to note.");
    expect(renderedText).not.toContain("Current-note proposals");
    expect(renderedText).not.toContain("Review: Pending review");
    expect(renderedText).not.toContain("Apply: Not applied");
  });

  it("hides completed proposal history from the chat surface when there is nothing to write", () => {
    const operation = tagUpdateOperation();
    const container = fakeElement("root");

    renderStudioCurrentNoteProposalCards(
      container as unknown as HTMLElement,
      {
        activePath: "Notes/VHDL.md",
        writeOperations: [operation],
        writeDecisions: [
          createVaultWriteDecisionRecord({
            operation,
            decision: "approved",
            decidedAt: "2026-05-03T10:30:00.000Z"
          })
        ],
        writeApplyResults: [appliedResult(operation)],
        showEmptyState: false,
        surface: "chat"
      },
      vi.fn()
    );

    expect(textContentTree(container)).toBe("");
  });

  it("keeps completed proposal history out of the chat surface when an active draft is ready", () => {
    const completedOperation = tagUpdateOperation();
    const activeOperation = rewriteOperation();
    const container = fakeElement("root");

    renderStudioCurrentNoteProposalCards(
      container as unknown as HTMLElement,
      {
        activePath: "Notes/VHDL.md",
        writeOperations: [completedOperation, activeOperation],
        writeDecisions: [
          createVaultWriteDecisionRecord({
            operation: completedOperation,
            decision: "approved",
            decidedAt: "2026-05-03T10:30:00.000Z"
          })
        ],
        writeApplyResults: [appliedResult(completedOperation)],
        showEmptyState: false,
        surface: "chat"
      },
      vi.fn()
    );

    const renderedText = textContentTree(container);
    expect(renderedText).toContain("Ready to write to active note");
    expect(renderedText).toContain("Rewrite note");
    expect(renderedText).not.toContain("Completed proposal history");
    expect(renderedText).not.toContain("Add tags");
  });
});

function tagUpdateOperation(): GuardedVaultWriteOperation {
  return {
    ...planNoteTagUpdateOperation({
      targetPath: "Notes/VHDL.md",
      currentContent: "---\ntags:\n- fpga\n---\n# VHDL\n",
      tagsToAdd: ["vhdl"],
      suggestionIds: ["suggestion:note-tag:Notes/VHDL.md:vhdl"],
      createdAt: "2026-05-03T10:00:00.000Z"
    }),
    id: "write-1"
  };
}

function rewriteOperation(): GuardedVaultWriteOperation {
  return {
    ...planNoteContentRewriteOperation({
      targetPath: "Notes/VHDL.md",
      currentContent: "# VHDL\n\nOld prose.\n",
      proposedContent: "# VHDL\n\n## Overview\n\nClearer prose.\n",
      reason: "Improve structure.",
      suggestionIds: ["suggestion:rewrite"],
      createdAt: "2026-05-03T10:00:00.000Z"
    }),
    id: "write-rewrite-1"
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

function fakeElement(tagName: string): FakeElement {
  return {
    tagName,
    className: "",
    textContent: "",
    children: [],
    disabled: false,
    open: false,
    createDiv(options: { cls?: string } = {}) {
      const child = fakeElement("div");
      child.className = options.cls ?? "";
      this.children.push(child);
      return child as unknown as HTMLElement;
    },
    createEl(tag: string, options: { text?: string; cls?: string; attr?: Record<string, string> } = {}) {
      const child = fakeElement(tag);
      child.textContent = options.text ?? "";
      child.className = options.cls ?? "";
      this.children.push(child);
      return child as unknown as HTMLElement;
    },
    addEventListener() {
      return undefined;
    }
  };
}

function textContentTree(element: FakeElement): string {
  return [element.textContent, ...element.children.map(textContentTree)].filter(Boolean).join(" ");
}

function findText(element: FakeElement, text: string): FakeElement | undefined {
  if (element.textContent === text) {
    return element;
  }

  for (const child of element.children) {
    const found = findText(child, text);
    if (found !== undefined) {
      return found;
    }
  }

  return undefined;
}

function findElement(element: FakeElement, tagName: string, className: string): FakeElement | undefined {
  if (element.tagName === tagName && element.className === className) {
    return element;
  }

  for (const child of element.children) {
    const found = findElement(child, tagName, className);
    if (found !== undefined) {
      return found;
    }
  }

  return undefined;
}

interface FakeElement {
  tagName: string;
  className: string;
  textContent: string;
  children: FakeElement[];
  disabled: boolean;
  open: boolean;
  createDiv(options?: { cls?: string }): HTMLElement;
  createEl(tag: string, options?: { text?: string; cls?: string; attr?: Record<string, string> }): HTMLElement;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
}
