import { App, Modal, Notice, TFile } from "obsidian";
import type { GuardedVaultWriteOperation, VaultseerStore, VaultWriteDecision, VaultWritePort } from "@vaultseer/core";
import {
  acceptWriteReviewQueueOperation,
  recordWriteReviewQueueDecision
} from "./write-review-queue-controller";
import {
  editVaultWriteOperationContent,
  isEditableVaultWriteOperation,
  refreshRewriteOperationForCurrentContent
} from "./write-operation-edit";
import { VaultseerWriteProposalEditModal } from "./write-proposal-edit-modal";
import {
  buildWriteReviewQueueState,
  getDefaultWriteReviewQueueOperationId,
  getNextWriteReviewQueueOperationId,
  type WriteReviewQueueItem,
  type WriteReviewQueueState
} from "./write-review-queue-state";

export class VaultseerWriteReviewQueueModal extends Modal {
  private focusedOperationId: string | null = null;

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
    summaryEl.createEl("div", { text: `Approved: ${state.approvedCount}` });
    summaryEl.createEl("div", { text: `Rejected: ${state.rejectedCount}` });
    summaryEl.createEl("div", { text: `Apply failures: ${state.failedApplyCount}` });
    summaryEl.createEl("div", { text: `Applied records: ${state.appliedCount}` });
    summaryEl.createEl("div", { text: `Needs review: ${state.activeCount}` });
    summaryEl.createEl("div", { text: `History: ${state.historyCount}` });
    summaryEl.createEl("p", {
      text: "Accept applies the proposal after re-checking the target note. Edit updates the proposed Markdown before accepting."
    });

    this.focusedOperationId = normalizeFocusedOperationId(state, this.focusedOperationId);
    const focusedItem = state.items.find((item) => item.operationId === this.focusedOperationId) ?? null;
    this.renderNavigator(contentEl, state, operations, focusedItem);

    const operationById = new Map(operations.map((operation) => [operation.id, operation]));
    const listEl = contentEl.createEl("section", { cls: "vaultseer-write-review-queue-items" });
    listEl.createEl("h3", { text: focusedItem ? "Selected Proposal" : "Proposals" });
    if (!focusedItem) {
      listEl.createEl("p", { text: "No proposal is selected." });
    } else {
      this.renderItem(listEl, focusedItem, operationById.get(focusedItem.operationId));
    }
  }

  private renderNavigator(
    parent: HTMLElement,
    state: WriteReviewQueueState,
    operations: GuardedVaultWriteOperation[],
    focusedItem: WriteReviewQueueItem | null
  ): void {
    const navEl = parent.createEl("section", { cls: "vaultseer-write-review-queue-navigation" });
    navEl.createEl("h3", { text: "Queue Navigation" });

    if (!focusedItem) {
      navEl.createEl("p", { text: "No active guarded write proposals are available." });
      return;
    }

    const activeItems = state.items.filter((item) => item.queueSection === "active");
    const focusedIndex = activeItems.findIndex((item) => item.operationId === focusedItem.operationId);
    navEl.createEl("div", {
      text: `Active proposal ${focusedIndex + 1} of ${activeItems.length} - ${focusedItem.queueSectionLabel}`
    });

    const actionsEl = navEl.createEl("div", { cls: "vaultseer-write-review-queue-navigation-actions" });
    const previousButton = actionsEl.createEl("button", { text: "Previous proposal" });
    previousButton.disabled = activeItems.length < 2;
    previousButton.addEventListener("click", () => {
      this.focusedOperationId = getNextWriteReviewQueueOperationId(state, focusedItem.operationId, "previous");
      this.renderState(state, operations);
    });

    const nextButton = actionsEl.createEl("button", { text: "Next proposal" });
    nextButton.disabled = activeItems.length < 2;
    nextButton.addEventListener("click", () => {
      this.focusedOperationId = getNextWriteReviewQueueOperationId(state, focusedItem.operationId, "next");
      this.renderState(state, operations);
    });

    const firstActiveOperationId = getDefaultWriteReviewQueueOperationId(state);
    const firstActiveButton = actionsEl.createEl("button", { text: "First needing review" });
    firstActiveButton.disabled = state.activeCount === 0 || focusedItem.operationId === firstActiveOperationId;
    firstActiveButton.addEventListener("click", () => {
      this.focusedOperationId = getDefaultWriteReviewQueueOperationId(state);
      this.renderState(state, operations);
    });
  }

  private renderItem(parent: HTMLElement, item: WriteReviewQueueItem, operation: GuardedVaultWriteOperation | undefined): void {
    const itemEl = parent.createEl("article", { cls: "vaultseer-write-review-queue-item" });
    itemEl.createEl("h4", { text: item.targetPath });
    itemEl.createEl("div", { text: `Queue section: ${item.queueSectionLabel}` });
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
    const acceptButton = actionsEl.createEl("button", {
      text: item.applyState === "applied" ? "Written" : "Accept and write to note"
    });
    acceptButton.disabled = !operation || item.queueSection !== "active";
    acceptButton.addEventListener("click", () => {
      if (!operation) return;
      void this.acceptOperation(operation);
    });

    const editButton = actionsEl.createEl("button", { text: "Edit" });
    editButton.disabled = !operation || !item.canEdit;
    editButton.addEventListener("click", () => {
      if (!operation) return;
      void this.editOperation(operation);
    });

    for (const decision of ["deferred", "rejected"] as const) {
      const button = actionsEl.createEl("button", { text: decisionButtonLabel(decision) });
      button.disabled = !operation || item.queueSection !== "active" || item.decisionState === decision;
      button.addEventListener("click", () => {
        if (!operation) return;
        void this.recordDecision(operation, decision);
      });
    }

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

  private async acceptOperation(operation: GuardedVaultWriteOperation): Promise<void> {
    try {
      const operationToAccept = await this.refreshRewriteBeforeAccept(operation);
      const summary = await acceptWriteReviewQueueOperation({
        store: this.store,
        writePort: this.writePort,
        operation: operationToAccept,
        now: this.now
      });
      new Notice(summary.message);
      await this.loadAndRender();
    } catch (error) {
      new Notice(`Vaultseer could not apply the guarded write: ${getErrorMessage(error)}`);
    }
  }

  private async editOperation(operation: GuardedVaultWriteOperation): Promise<void> {
    try {
      if (!isEditableVaultWriteOperation(operation)) {
        new Notice("Only note rewrites and source-note drafts can be edited here.");
        return;
      }

      const currentContent = operation.type === "rewrite_note_content" ? await this.readVaultTextFile(operation.targetPath) : undefined;
      new VaultseerWriteProposalEditModal(this.app, {
        targetPath: operation.targetPath,
        initialContent: operation.content,
        onSave: async (editedContent) => {
          const editedOperation = editVaultWriteOperationContent({
            operation,
            currentContent,
            editedContent
          });
          const operations = await this.store.getVaultWriteOperations();
          await this.store.replaceVaultWriteOperations(
            operations.map((candidate) => (candidate.id === operation.id ? editedOperation : candidate))
          );
          this.focusedOperationId = editedOperation.id;
          new Notice(`Updated proposal for ${operation.targetPath}.`);
          await this.loadAndRender();
        }
      }).open();
    } catch (error) {
      new Notice(`Vaultseer could not edit the proposal: ${getErrorMessage(error)}`);
    }
  }

  private async readVaultTextFile(path: string): Promise<string> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      throw new Error(`Could not find ${path} in the vault.`);
    }
    return await this.app.vault.read(file);
  }

  private async refreshRewriteBeforeAccept(operation: GuardedVaultWriteOperation): Promise<GuardedVaultWriteOperation> {
    if (operation.type !== "rewrite_note_content") {
      return operation;
    }

    const currentContent = await this.readVaultTextFile(operation.targetPath);
    const refreshed = refreshRewriteOperationForCurrentContent({ operation, currentContent });
    if (refreshed === null || refreshed.id === operation.id) {
      return operation;
    }

    const operations = await this.store.getVaultWriteOperations();
    await this.store.replaceVaultWriteOperations(
      operations.map((candidate) => (candidate.id === operation.id ? refreshed : candidate))
    );
    return refreshed;
  }
}

function normalizeFocusedOperationId(state: WriteReviewQueueState, currentOperationId: string | null): string | null {
  if (currentOperationId && state.items.some((item) => item.operationId === currentOperationId)) {
    const currentItem = state.items.find((item) => item.operationId === currentOperationId);
    if (currentItem?.queueSection === "active") return currentOperationId;
  }
  return getDefaultWriteReviewQueueOperationId(state);
}

function decisionButtonLabel(decision: VaultWriteDecision): string {
  switch (decision) {
    case "approved":
      return "Approve";
    case "deferred":
      return "Defer";
    case "rejected":
      return "Reject";
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
