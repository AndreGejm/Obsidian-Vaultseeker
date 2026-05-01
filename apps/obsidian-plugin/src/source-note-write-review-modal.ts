import { App, Modal } from "obsidian";
import type { SourceNoteWriteReviewState } from "./source-note-write-review-state";

export class VaultseerSourceNoteWriteReviewModal extends Modal {
  constructor(
    app: App,
    private readonly state: SourceNoteWriteReviewState
  ) {
    super(app);
  }

  onOpen(): void {
    this.render();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: this.state.title });
    contentEl.createEl("p", { text: this.state.message });

    if (!this.state.operation || !this.state.targetPath || !this.state.source || !this.state.precondition) {
      return;
    }

    const summaryEl = contentEl.createEl("section", { cls: "vaultseer-source-note-write-review-summary" });
    summaryEl.createEl("h3", { text: "Proposed Operation" });
    summaryEl.createEl("div", { text: `Operation: ${this.state.operation.type}` });
    summaryEl.createEl("div", { text: `Target note: ${this.state.targetPath}` });
    summaryEl.createEl("div", { text: `Source: ${this.state.source.sourcePath}` });
    summaryEl.createEl("div", { text: `Source hash: ${this.state.source.sourceContentHash}` });
    summaryEl.createEl("div", { text: `Apply available: ${this.state.canApply ? "yes" : "no"}` });

    const safetyEl = contentEl.createEl("section", { cls: "vaultseer-source-note-write-review-safety" });
    safetyEl.createEl("h3", { text: "Safety Check" });
    if (this.state.precondition.ok) {
      safetyEl.createEl("p", { text: "Target path is clear for a future approved create operation." });
    } else {
      safetyEl.createEl("p", { text: `Blocked: ${this.state.precondition.reason}.` });
      safetyEl.createEl("div", {
        text: `Expected hash: ${this.state.precondition.expectedCurrentHash ?? "no existing file"}`
      });
      safetyEl.createEl("div", {
        text: `Current hash: ${this.state.precondition.actualCurrentHash ?? "no existing file"}`
      });
    }

    const suggestionsEl = contentEl.createEl("section", { cls: "vaultseer-source-note-write-review-suggestions" });
    suggestionsEl.createEl("h3", { text: "Linked Suggestions" });
    if (this.state.suggestionIds.length === 0) {
      suggestionsEl.createEl("p", { text: "No persisted suggestion records are linked to this operation." });
    } else {
      const listEl = suggestionsEl.createEl("ul");
      for (const suggestionId of this.state.suggestionIds) {
        listEl.createEl("li", { text: suggestionId });
      }
    }

    const diffEl = contentEl.createEl("section", { cls: "vaultseer-source-note-write-review-diff" });
    diffEl.createEl("h3", { text: "Preview Diff" });
    diffEl.createEl("pre", { text: this.state.diff });
  }
}
