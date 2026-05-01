import { App, Modal, Notice } from "obsidian";
import type { GuardedVaultWriteOperation, VaultseerStore, VaultWriteDecision, VaultWritePort } from "@vaultseer/core";
import { applyApprovedVaultWriteOperation } from "./write-apply-controller";
import { recordWriteReviewQueueDecision } from "./write-review-queue-controller";
import { buildWriteReviewQueueState, type WriteReviewQueueItem, type WriteReviewQueueState } from "./write-review-queue-state";

export class VaultseerWriteReviewQueueModal extends Modal {
  constructor(
    app: App,
    private readonly store: VaultseerStore,
    private readonly writePort: VaultWritePort,
    private readonly now: () => string = () => new Date().toISOString()
  ) {
    super(app);
  }

  onOpen(): void {
    void this.loadAndRender();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async loadAndRender(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Guarded Write Review Queue" });
    contentEl.createEl("p", { text: "Loading proposed operations..." });

    try {
      const [operations, decisions, applyResults] = await Promise.all([
        this.store.getVaultWriteOperations(),
        this.store.getVaultWriteDecisionRecords(),
        this.store.getVaultWriteApplyResultRecords()
      ]);
      const state = buildWriteReviewQueueState({ operations, decisions, applyResults });
      this.renderState(state, operations);
    } catch (error) {
      contentEl.empty();
      contentEl.createEl("h2", { text: "Guarded Write Review Queue" });
      contentEl.createEl("p", { text: `Vaultseer could not load write proposals: ${getErrorMessage(error)}` });
      new Notice("Vaultseer could not load guarded write proposals.");
    }
  }

  private renderState(state: WriteReviewQueueState, operations: GuardedVaultWriteOperation[]): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: state.title });
    contentEl.createEl("p", { text: state.message });

    if (state.status === "empty") {
      return;
    }

    const summaryEl = contentEl.createEl("section", { cls: "vaultseer-write-review-queue-summary" });
    summaryEl.createEl("h3", { text: "Queue Summary" });
    summaryEl.createEl("div", { text: `Total proposals: ${state.totalCount}` });
    summaryEl.createEl("div", { text: `Pending: ${state.pendingCount}` });
    summaryEl.createEl("div", { text: `Deferred: ${state.deferredCount}` });
    summaryEl.createEl("div", { text: `Approved for later apply: ${state.approvedCount}` });
    summaryEl.createEl("div", { text: `Rejected: ${state.rejectedCount}` });
    summaryEl.createEl("div", { text: `Apply failures: ${state.failedApplyCount}` });
    summaryEl.createEl("div", { text: `Applied records: ${state.appliedCount}` });
    summaryEl.createEl("p", {
      text: "Decision buttons update Vaultseer review metadata only. Source-note creation re-checks the target before writing; tag updates are preview-only for now."
    });

    const operationById = new Map(operations.map((operation) => [operation.id, operation]));
    const listEl = contentEl.createEl("section", { cls: "vaultseer-write-review-queue-items" });
    listEl.createEl("h3", { text: "Proposals" });
    for (const item of state.items) {
      const operation = operationById.get(item.operationId);
      this.renderItem(listEl, item, operation);
    }
  }

  private renderItem(parent: HTMLElement, item: WriteReviewQueueItem, operation: GuardedVaultWriteOperation | undefined): void {
    const itemEl = parent.createEl("article", { cls: "vaultseer-write-review-queue-item" });
    itemEl.createEl("h4", { text: item.targetPath });
    itemEl.createEl("div", { text: `Operation: ${item.operationTypeLabel}` });
    itemEl.createEl("div", { text: `Decision: ${item.decisionLabel}` });
    itemEl.createEl("div", { text: `Apply result: ${item.applyLabel}` });
    itemEl.createEl("div", { text: `Created: ${item.createdAt}` });
    if (item.decidedAt) itemEl.createEl("div", { text: `Decided: ${item.decidedAt}` });
    itemEl.createEl("div", { text: `Source: ${item.sourcePath ?? "unknown source"}` });
    itemEl.createEl("div", { text: `Source hash: ${item.sourceContentHash ?? "unknown hash"}` });
    itemEl.createEl("div", { text: `Expected current hash: ${item.expectedCurrentHash ?? "no existing file"}` });
    itemEl.createEl("div", { text: `Apply available: ${item.canApply ? "yes" : "no"}` });
    if (item.applyResult?.status === "failed") {
      itemEl.createEl("div", { text: `Failure stage: ${item.applyResult.stage}` });
      itemEl.createEl("div", { text: `Retryable: ${item.applyResult.retryable ? "yes" : "no"}` });
      itemEl.createEl("div", { text: `Actual hash: ${item.applyResult.actualCurrentHash ?? "no existing file"}` });
    }

    const suggestionsEl = itemEl.createEl("section", { cls: "vaultseer-write-review-queue-suggestions" });
    suggestionsEl.createEl("h5", { text: "Linked Suggestions" });
    if (item.suggestionIds.length === 0) {
      suggestionsEl.createEl("p", { text: "No suggestions are linked to this proposal." });
    } else {
      const listEl = suggestionsEl.createEl("ul");
      for (const suggestionId of item.suggestionIds) listEl.createEl("li", { text: suggestionId });
    }

    const actionsEl = itemEl.createEl("div", { cls: "vaultseer-write-review-queue-actions" });
    for (const decision of ["approved", "deferred", "rejected"] as const) {
      const button = actionsEl.createEl("button", { text: decisionButtonLabel(decision) });
      button.disabled = !operation || item.decisionState === decision;
      button.addEventListener("click", () => {
        if (!operation) return;
        void this.recordDecision(operation, decision);
      });
    }
    const applyButton = actionsEl.createEl("button", { text: applyButtonLabel(item) });
    applyButton.disabled = !operation || !item.canApply;
    applyButton.addEventListener("click", () => {
      if (!operation) return;
      void this.applyOperation(operation, item);
    });

    const diffEl = itemEl.createEl("section", { cls: "vaultseer-write-review-queue-diff" });
    diffEl.createEl("h5", { text: "Preview Diff" });
    diffEl.createEl("pre", { text: item.previewDiff });
  }

  private async recordDecision(operation: GuardedVaultWriteOperation, decision: VaultWriteDecision): Promise<void> {
    try {
      const summary = await recordWriteReviewQueueDecision({
        store: this.store,
        operation,
        decision,
        now: this.now
      });
      new Notice(summary.message);
      await this.loadAndRender();
    } catch (error) {
      new Notice(`Vaultseer could not record the write review decision: ${getErrorMessage(error)}`);
    }
  }

  private async applyOperation(operation: GuardedVaultWriteOperation, item: WriteReviewQueueItem): Promise<void> {
    try {
      const summary = await applyApprovedVaultWriteOperation({
        store: this.store,
        writePort: this.writePort,
        operation,
        decision: item.decision,
        now: this.now
      });
      new Notice(summary.message);
      await this.loadAndRender();
    } catch (error) {
      new Notice(`Vaultseer could not apply the guarded write: ${getErrorMessage(error)}`);
    }
  }
}

function decisionButtonLabel(decision: VaultWriteDecision): string {
  switch (decision) {
    case "approved":
      return "Approve for later";
    case "deferred":
      return "Defer";
    case "rejected":
      return "Reject";
  }
}

function applyButtonLabel(item: WriteReviewQueueItem): string {
  if (item.operationType === "update_note_tags") return "Tag update preview only";
  if (item.applyState === "applied") return "Already created";
  if (item.applyState === "failed" && item.canApply) return "Retry create note";
  return "Create note";
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
