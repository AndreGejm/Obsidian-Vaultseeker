import type {
  GuardedVaultWriteOperation,
  VaultWriteApplyResultRecord,
  VaultWriteDecisionRecord
} from "@vaultseer/core";
import { buildStudioNoteProposalCards, type StudioNoteProposalControlType } from "./studio-note-proposal-cards";

export function renderStudioCurrentNoteProposalCards(
  containerEl: HTMLElement,
  input: {
    activePath: string | null;
    writeOperations: GuardedVaultWriteOperation[];
    writeDecisions: VaultWriteDecisionRecord[];
    writeApplyResults: VaultWriteApplyResultRecord[];
    showEmptyState: boolean;
    surface?: "note" | "chat";
  },
  onControl: (operationId: string, controlType: StudioNoteProposalControlType) => Promise<void>
): void {
  const proposalState = buildStudioNoteProposalCards({
    activePath: input.activePath,
    writeOperations: input.writeOperations,
    decisions: input.writeDecisions,
    applyResults: input.writeApplyResults
  });
  const surface = input.surface ?? "note";

  if (surface === "chat" && proposalState.cards.length === 0) {
    return;
  }

  if (!input.showEmptyState && proposalState.cards.length === 0 && proposalState.hiddenHistoryCount === 0) {
    return;
  }

  const proposalsEl = containerEl.createDiv({ cls: "vaultseer-studio-note-proposals" });
  proposalsEl.createEl("h4", { text: surface === "chat" ? "Ready to write to active note" : "Current-note proposals" });
  proposalsEl.createEl("p", {
    text:
      surface === "chat" && proposalState.cards.some((card) => card.queueSection === "active")
        ? "Review the redline, edit if needed, then press Write to note."
        : proposalState.message
  });

  for (const card of proposalState.cards) {
    renderProposalCard(proposalsEl, card, onControl, surface);
  }

  if (surface === "note" && proposalState.hiddenHistoryCount > 0) {
    const historyState = buildStudioNoteProposalCards({
      activePath: input.activePath,
      writeOperations: input.writeOperations,
      decisions: input.writeDecisions,
      applyResults: input.writeApplyResults,
      includeHistory: true
    });
    const historyCards = historyState.cards.filter((card) => card.queueSection === "history");
    renderCompletedHistory(proposalsEl, historyCards, onControl);
  }
}

function renderCompletedHistory(
  containerEl: HTMLElement,
  cards: ReturnType<typeof buildStudioNoteProposalCards>["cards"],
  onControl: (operationId: string, controlType: StudioNoteProposalControlType) => Promise<void>
): void {
  const detailsEl = containerEl.createEl("details", { cls: "vaultseer-studio-proposal-history" });
  detailsEl.createEl("summary", { text: `Show completed changes (${cards.length})` });
  detailsEl.createEl("h5", { text: "Completed proposal history" });
  detailsEl.createEl("p", { text: "Completed proposals are read-only. Create a new proposal to make another change." });

  for (const card of cards) {
    renderProposalCard(detailsEl, card, onControl, "note");
  }
}

function renderProposalCard(
  containerEl: HTMLElement,
  card: ReturnType<typeof buildStudioNoteProposalCards>["cards"][number],
  onControl: (operationId: string, controlType: StudioNoteProposalControlType) => Promise<void>,
  surface: "note" | "chat"
): void {
  const cardEl = containerEl.createDiv({ cls: "vaultseer-studio-proposal-card" });
  cardEl.createEl("strong", { text: card.title });
  cardEl.createEl("p", { text: card.summary });
  if (surface === "chat" && card.queueSection === "active") {
    cardEl.createEl("div", { text: "Not written yet.", cls: "vaultseer-studio-proposal-status" });
  } else {
    cardEl.createEl("div", { text: `Review: ${card.decisionLabel}` });
    cardEl.createEl("div", { text: `Apply: ${card.applyLabel}` });
  }
  cardEl.createEl("span", {
    text: card.reviewMessage,
    cls: `vaultseer-studio-proposal-review vaultseer-studio-proposal-${card.reviewSurface}`
  });

  const controlsEl = cardEl.createDiv({ cls: "vaultseer-studio-proposal-controls" });
  for (const control of card.controls) {
    const button = controlsEl.createEl("button", {
      text: control.label,
      attr: {
        type: "button"
      },
      cls: `vaultseer-studio-proposal-control vaultseer-studio-proposal-control-${control.tone}`
    });
    button.disabled = !control.enabled;
    button.addEventListener("click", async () => {
      await onControl(card.id, control.type);
    });
  }

  const diffEl = cardEl.createEl("details", { cls: "vaultseer-studio-proposal-diff" });
  if (card.queueSection === "active") {
    diffEl.open = true;
  }
  diffEl.createEl("summary", { text: "Preview diff" });
  diffEl.createEl("pre", { text: card.previewDiff });
}
