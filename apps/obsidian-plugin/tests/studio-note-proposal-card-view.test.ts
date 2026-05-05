import type { GuardedVaultWriteOperation, VaultWriteApplyResultRecord } from "@vaultseer/core";
import { createVaultWriteDecisionRecord, planNoteTagUpdateOperation } from "@vaultseer/core";
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
    expect(findText(container, "Tag update")).toBeDefined();
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

interface FakeElement {
  tagName: string;
  className: string;
  textContent: string;
  children: FakeElement[];
  disabled: boolean;
  createDiv(options?: { cls?: string }): HTMLElement;
  createEl(tag: string, options?: { text?: string; cls?: string; attr?: Record<string, string> }): HTMLElement;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
}
