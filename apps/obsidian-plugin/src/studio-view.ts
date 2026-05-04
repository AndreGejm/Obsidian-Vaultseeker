import { ItemView, Menu, Notice, type App, type WorkspaceLeaf } from "obsidian";
import type {
  ActiveNoteContextPacket,
  CodexRuntimeStatus,
  GuardedVaultWriteOperation,
  IndexHealth,
  NoteRecord,
  StudioModeId,
  VaultseerStore,
  VaultWriteApplyResultRecord,
  VaultWriteDecision,
  VaultWriteDecisionRecord,
  VaultWritePort
} from "@vaultseer/core";
import {
  applyChatEvent,
  applyActiveNoteChangeToChatState,
  createCodexChatSendScope,
  createCodexToolRequestScope,
  createEmptyChatState,
  isCurrentCodexToolRequestScope,
  isCurrentCodexChatSend,
  type CodexChatToolRequest,
  type CodexChatSendScope,
  type CodexChatState,
  type CodexToolRequestScope
} from "./codex-chat-state";
import type { CodexChatAdapter } from "./codex-chat-adapter";
import { buildCodexPendingToolRequestDisplayItems } from "./codex-pending-tool-request-display";
import {
  dispatchCodexToolRequest,
  isProposalCodexTool,
  isRunnableCodexTool,
  type CodexToolImplementations,
  type CodexToolResult
} from "./codex-tool-dispatcher";
import { buildStudioChatComposerState, buildStudioChatShellState } from "./studio-chat-shell-state";
import { buildPluginStudioState, type PluginStudioState } from "./studio-state";
import { CODEX_MODEL_OPTIONS, CODEX_REASONING_EFFORT_OPTIONS, type CodexReasoningEffort } from "./settings-model";
import {
  getVaultseerQuickCommands,
  groupVaultseerStudioCommands,
  type VaultseerStudioCommand
} from "./studio-command-catalog";
import {
  buildStudioModeDashboard,
  type StudioModeDashboardActionCard
} from "./studio-mode-dashboard";
import { buildStudioNoteProposalCards, type StudioNoteProposalControlType } from "./studio-note-proposal-cards";
import { buildStudioStatusStrip, type StudioStatusStripItem } from "./studio-status-strip";
import {
  buildVaultseerChatActionPlan,
  extractLastAssistantMarkdownSuggestion
} from "./vaultseer-chat-action-plan";
import {
  buildVaultseerToolContinuationMessage,
  buildVaultseerActionEvidenceMessage,
  shouldContinueVaultseerToolLoop,
  splitCodexToolRequestsForExecution,
  splitVaultseerChatActionPlan
} from "./vaultseer-chat-action-execution";
import { formatCodexToolResultMessage } from "./codex-tool-result-message";
import {
  applyVaultseerSlashCommandMessage,
  queueVaultseerStudioCommandRequest
} from "./vaultseer-studio-command-request";
import { recordWriteReviewQueueDecision } from "./write-review-queue-controller";
import { applyApprovedVaultWriteOperation } from "./write-apply-controller";

export const VAULTSEER_STUDIO_VIEW_TYPE = "vaultseer-studio";
const MAX_CODEX_TOOL_CONTINUATION_ITERATIONS = 3;

export class VaultseerStudioView extends ItemView {
  private activeMode: StudioModeId | null = null;
  private chatState: CodexChatState = createEmptyChatState(null);
  private chatSending = false;
  private chatSendId = 0;
  private chatDraft = "";

  constructor(
    leaf: WorkspaceLeaf,
    private readonly store: VaultseerStore,
    private readonly getActivePath: () => string | null,
    private readonly getCodexRuntimeStatus: () => CodexRuntimeStatus,
    private readonly resetCodexSession: () => Promise<void>,
    private readonly getCodexModelSelection: () => { codexModel: string; codexReasoningEffort: CodexReasoningEffort },
    private readonly updateCodexModelSelection: (
      patch: Partial<{ codexModel: string; codexReasoningEffort: CodexReasoningEffort }>
    ) => Promise<void>,
    private readonly getVaultseerCommands: () => VaultseerStudioCommand[],
    private readonly buildActiveNoteContext: () => Promise<ActiveNoteContextPacket>,
    private readonly chatAdapter: CodexChatAdapter,
    private readonly codexTools: CodexToolImplementations,
    private readonly writePort: VaultWritePort
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VAULTSEER_STUDIO_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Vaultseer Studio";
  }

  getIcon(): string {
    return "compass";
  }

  async onOpen(): Promise<void> {
    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        this.handleActiveNoteOpened(file?.path ?? null);
        void this.refresh();
      })
    );
    await this.refresh();
  }

  async onClose(): Promise<void> {
    this.contentEl.empty();
  }

  async refresh(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Vaultseer Studio" });
    contentEl.createEl("p", { text: "Loading Studio..." });

    try {
      const [health, notes, writeOperations, writeDecisions, writeApplyResults] = await Promise.all([
        this.store.getHealth(),
        this.store.getNoteRecords(),
        this.store.getVaultWriteOperations(),
        this.store.getVaultWriteDecisionRecords(),
        this.store.getVaultWriteApplyResultRecords()
      ]);
      this.render(health, notes, writeOperations, writeDecisions, writeApplyResults);
    } catch (error) {
      contentEl.empty();
      contentEl.createEl("h2", { text: "Vaultseer Studio" });
      contentEl.createEl("p", { text: `Could not load Studio state: ${getErrorMessage(error)}` });
      new Notice("Vaultseer Studio could not load.");
    }
  }

  private render(
    health: IndexHealth,
    notes: NoteRecord[],
    writeOperations: GuardedVaultWriteOperation[],
    writeDecisions: VaultWriteDecisionRecord[],
    writeApplyResults: VaultWriteApplyResultRecord[]
  ): void {
    const activePath = this.getActivePath();
    this.chatState = applyActiveNoteChangeToChatState(this.chatState, activePath);

    const state = buildPluginStudioState({
      requestedMode: this.activeMode,
      activePath,
      notes,
      indexStatus: health.status,
      codexRuntimeStatus: this.getCodexRuntimeStatus()
    });

    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: state.title });
    contentEl.createEl("p", { text: `Current note: ${state.activeNoteLabel}` });
    this.renderStatusStrip(
      contentEl,
      buildStudioStatusStrip({
        health,
        activePath,
        notes,
        writeOperations,
        codexRuntimeStatus: this.getCodexRuntimeStatus()
      })
    );
    this.renderModeButtons(contentEl, state);
    this.renderSelectedMode(contentEl, state, writeOperations, writeDecisions, writeApplyResults);
  }

  private renderStatusStrip(containerEl: HTMLElement, items: StudioStatusStripItem[]): void {
    const stripEl = containerEl.createDiv({ cls: "vaultseer-studio-status-strip" });

    for (const item of items) {
      const itemEl = stripEl.createDiv({
        cls: `vaultseer-studio-status-item vaultseer-studio-status-${item.tone}`
      });
      itemEl.createEl("span", { text: item.label, cls: "vaultseer-studio-status-label" });
      itemEl.createEl("strong", { text: item.value, cls: "vaultseer-studio-status-value" });
    }
  }

  private renderModeButtons(containerEl: HTMLElement, state: PluginStudioState): void {
    const nav = containerEl.createDiv({ cls: "vaultseer-studio-nav" });

    for (const mode of state.modes) {
      const button = nav.createEl("button", {
        text: mode.label,
        title: mode.message,
        cls: mode.selected ? "vaultseer-studio-mode-selected" : ""
      });
      button.setAttribute("aria-pressed", String(mode.selected));
      button.addEventListener("click", async () => {
        this.activeMode = mode.id;
        await this.refresh();
      });
    }
  }

  private renderSelectedMode(
    containerEl: HTMLElement,
    state: PluginStudioState,
    writeOperations: GuardedVaultWriteOperation[],
    writeDecisions: VaultWriteDecisionRecord[],
    writeApplyResults: VaultWriteApplyResultRecord[]
  ): void {
    const selectedMode = state.modes.find((mode) => mode.selected) ?? state.modes[0];
    const body = containerEl.createDiv({ cls: "vaultseer-studio-body" });

    if (selectedMode?.id === "chat") {
      this.renderChatMode(body, state, writeOperations, writeDecisions, writeApplyResults);
      return;
    }

    body.createEl("h3", { text: selectedMode?.label ?? "Note" });
    body.createEl("p", { text: selectedMode?.message ?? "Mode is ready." });
    if (selectedMode !== undefined) {
      this.renderModeDashboard(body, selectedMode.id, state.activeNotePath, writeOperations.length);
    }

    if (selectedMode?.id === "note") {
      this.renderNoteMode(body, state, writeOperations, writeDecisions, writeApplyResults);
    }
  }

  private renderModeDashboard(
    containerEl: HTMLElement,
    mode: StudioModeId,
    activeNotePath: string | null,
    pendingWriteCount: number
  ): void {
    const dashboard = buildStudioModeDashboard({
      mode,
      activeNotePath,
      pendingWriteCount
    });

    if (dashboard.cards.length === 0) {
      return;
    }

    containerEl.createEl("p", { text: dashboard.summary, cls: "vaultseer-studio-mode-summary" });
    const cardsEl = containerEl.createDiv({ cls: "vaultseer-studio-action-grid" });
    for (const card of dashboard.cards) {
      this.renderDashboardActionCard(cardsEl, card);
    }
  }

  private renderDashboardActionCard(containerEl: HTMLElement, card: StudioModeDashboardActionCard): void {
    const cardEl = containerEl.createDiv({
      cls: `vaultseer-studio-action-card vaultseer-studio-action-${card.tone}`
    });
    cardEl.createEl("strong", { text: card.title });
    cardEl.createEl("p", { text: card.description });
    const button = cardEl.createEl("button", {
      text: card.buttonLabel,
      attr: {
        type: "button"
      }
    });
    button.addEventListener("click", async () => {
      if (card.modeId !== undefined) {
        this.activeMode = card.modeId;
        await this.refresh();
        return;
      }

      if (card.commandId === undefined) {
        return;
      }

      const command = this.getVaultseerCommands().find((item) => item.id === card.commandId);
      if (command === undefined) {
        new Notice(`Vaultseer command is not available: ${card.commandId}`);
        return;
      }

      const activePath = this.getActivePath();
      this.chatState = applyActiveNoteChangeToChatState(this.chatState, activePath);
      this.chatState = queueVaultseerStudioCommandRequest(this.chatState, command, new Date().toISOString());
      this.activeMode = "chat";
      await this.refresh();
    });
  }

  private renderNoteMode(
    containerEl: HTMLElement,
    state: PluginStudioState,
    writeOperations: GuardedVaultWriteOperation[],
    writeDecisions: VaultWriteDecisionRecord[],
    writeApplyResults: VaultWriteApplyResultRecord[]
  ): void {
    this.renderCurrentNoteProposalCards(containerEl, {
      activePath: state.activeNotePath,
      writeOperations,
      writeDecisions,
      writeApplyResults,
      showEmptyState: true
    });
  }

  private renderCurrentNoteProposalCards(
    containerEl: HTMLElement,
    input: {
      activePath: string | null;
      writeOperations: GuardedVaultWriteOperation[];
      writeDecisions: VaultWriteDecisionRecord[];
      writeApplyResults: VaultWriteApplyResultRecord[];
      showEmptyState: boolean;
    }
  ): void {
    const proposalState = buildStudioNoteProposalCards({
      activePath: input.activePath,
      writeOperations: input.writeOperations,
      decisions: input.writeDecisions,
      applyResults: input.writeApplyResults
    });

    if (!input.showEmptyState && proposalState.cards.length === 0) {
      return;
    }

    const proposalsEl = containerEl.createDiv({ cls: "vaultseer-studio-note-proposals" });
    proposalsEl.createEl("h4", { text: "Current-note proposals" });
    proposalsEl.createEl("p", { text: proposalState.message });

    if (proposalState.cards.length === 0) {
      return;
    }

    for (const card of proposalState.cards) {
      const cardEl = proposalsEl.createDiv({ cls: "vaultseer-studio-proposal-card" });
      cardEl.createEl("strong", { text: card.title });
      cardEl.createEl("p", { text: card.summary });
      cardEl.createEl("div", { text: `Review: ${card.decisionLabel}` });
      cardEl.createEl("div", { text: `Apply: ${card.applyLabel}` });
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
          }
        });
        button.disabled = !control.enabled;
        button.addEventListener("click", async () => {
          await this.handleProposalControl(card.id, control.type);
        });
      }

      const diffEl = cardEl.createEl("details", { cls: "vaultseer-studio-proposal-diff" });
      diffEl.createEl("summary", { text: "Preview diff" });
      diffEl.createEl("pre", { text: card.previewDiff });
    }
  }

  private renderChatMode(
    containerEl: HTMLElement,
    state: PluginStudioState,
    writeOperations: GuardedVaultWriteOperation[],
    writeDecisions: VaultWriteDecisionRecord[],
    writeApplyResults: VaultWriteApplyResultRecord[]
  ): void {
    const shellState = buildStudioChatShellState({
      activeNoteLabel: state.activeNoteLabel,
      activeNotePath: state.activeNotePath,
      codexRuntimeStatus: this.getCodexRuntimeStatus(),
      ...this.getCodexModelSelection()
    });
    const composerState = buildStudioChatComposerState({
      chatSending: this.chatSending,
      draft: this.chatDraft
    });
    const shellEl = containerEl.createDiv({ cls: "vaultseer-codex-shell" });
    const headerEl = shellEl.createDiv({ cls: "vaultseer-codex-header" });
    const titleEl = headerEl.createDiv({ cls: "vaultseer-codex-title" });
    titleEl.createEl("strong", { text: shellState.title });
    titleEl.createEl("span", { text: shellState.activeNoteTitle, cls: "vaultseer-codex-subtitle" });

    const controlsEl = headerEl.createDiv({ cls: "vaultseer-codex-controls" });
    controlsEl.createEl("span", { text: shellState.runtimeLabel, cls: "vaultseer-codex-runtime" });
    const resetButton = controlsEl.createEl("button", {
      text: "Reset",
      attr: {
        type: "button"
      },
      cls: "vaultseer-codex-ghost-button"
    });
    resetButton.disabled = this.chatSending;
    resetButton.addEventListener("click", async () => {
      this.chatSendId += 1;
      this.chatSending = false;
      this.chatState = applyChatEvent(this.chatState, { type: "clear" });
      await this.resetCodexSession();
      await this.refresh();
    });

    const messagesEl = shellEl.createDiv({ cls: "vaultseer-codex-messages" });

    if (this.chatState.messages.length === 0) {
      messagesEl.createEl("p", { text: shellState.emptyStateText, cls: "vaultseer-codex-empty" });
    } else {
      for (const message of this.chatState.messages) {
        const messageEl = messagesEl.createDiv({ cls: `vaultseer-codex-message vaultseer-chat-${message.role}` });
        messageEl.createEl("strong", { text: `${capitalize(message.role)}` });
        messageEl.createSpan({ text: message.content });
      }
    }

    this.renderPendingToolRequests(shellEl);
    this.renderCurrentNoteProposalCards(shellEl, {
      activePath: state.activeNotePath,
      writeOperations,
      writeDecisions,
      writeApplyResults,
      showEmptyState: false
    });

    if (this.chatState.error) {
      shellEl.createEl("p", { text: this.chatState.error, cls: "vaultseer-codex-error" });
    }

    const form = shellEl.createEl("form", { cls: "vaultseer-codex-composer" });
    const composerBodyEl = form.createDiv({ cls: "vaultseer-codex-composer-body" });
    if (shellState.activeNoteMention !== null) {
      composerBodyEl.createEl("span", { text: shellState.activeNoteMention, cls: "vaultseer-codex-note-pill" });
    }

    let input: HTMLTextAreaElement | null = null;
    const quickCommands = getVaultseerQuickCommands(this.getVaultseerCommands());
    if (shellState.quickPrompts.length > 0 || quickCommands.length > 0) {
      const quickActionsEl = composerBodyEl.createDiv({ cls: "vaultseer-codex-quick-actions" });
      for (const prompt of shellState.quickPrompts) {
        const promptButton = quickActionsEl.createEl("button", {
          text: prompt.label,
          title: prompt.title,
          attr: {
            type: "button"
          },
          cls: "vaultseer-codex-quick-action"
        });
        promptButton.disabled = this.chatSending;
        promptButton.addEventListener("click", () => {
          if (input === null || this.chatSending) {
            return;
          }

          input.value = prompt.prompt;
          this.chatDraft = prompt.prompt;
          requestFormSubmit(form);
        });
      }

      for (const command of quickCommands) {
        const quickButton = quickActionsEl.createEl("button", {
          text: command.quickActionLabel ?? command.name,
          title: `/${command.id} - ${command.name}`,
          attr: {
            type: "button"
          },
          cls: "vaultseer-codex-quick-action"
        });
        quickButton.disabled = this.chatSending;
        quickButton.addEventListener("click", async () => {
          const activePath = this.getActivePath();
          this.chatState = applyActiveNoteChangeToChatState(this.chatState, activePath);
          this.chatState = queueVaultseerStudioCommandRequest(this.chatState, command, new Date().toISOString());
          await this.refresh();
        });
      }
    }

    input = composerBodyEl.createEl("textarea", {
      attr: {
        rows: "3",
        placeholder: shellState.composerPlaceholder
      }
    });
    input.value = composerState.inputValue;
    input.addEventListener("input", () => {
      this.chatDraft = input?.value ?? "";
    });

    const footerEl = form.createDiv({ cls: "vaultseer-codex-composer-footer" });
    const commandButton = footerEl.createEl("button", {
      text: shellState.modeLabel,
      attr: {
        type: "button",
        "aria-label": "Open Vaultseer commands"
      },
      cls: "vaultseer-codex-select-button"
    });
    commandButton.disabled = this.chatSending;
    commandButton.addEventListener("click", (event) => {
      this.showCommandMenu(event);
    });
    const modelButton = footerEl.createEl("button", {
      text: shellState.modelLabel,
      attr: {
        type: "button",
        "aria-label": "Change Codex model"
      },
      cls: "vaultseer-codex-select-button"
    });
    modelButton.disabled = this.chatSending;
    modelButton.addEventListener("click", (event) => {
      this.showModelMenu(event);
    });
    const reasoningButton = footerEl.createEl("button", {
      text: shellState.reasoningLabel,
      attr: {
        type: "button",
        "aria-label": "Change Codex reasoning effort"
      },
      cls: "vaultseer-codex-select-button"
    });
    reasoningButton.disabled = this.chatSending;
    reasoningButton.addEventListener("click", (event) => {
      this.showReasoningMenu(event);
    });
    const sendButton = footerEl.createEl("button", {
      text: composerState.sendLabel,
      attr: {
        type: "submit",
        "aria-label": "Send message"
      },
      cls: "vaultseer-codex-send-button"
    });
    input.disabled = composerState.inputDisabled;
    sendButton.disabled = composerState.sendDisabled;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (this.chatSending) return;

      const message = input.value.trim();
      if (!message) return;
      this.chatDraft = "";

      const activePath = this.getActivePath();
      this.chatState = applyActiveNoteChangeToChatState(this.chatState, activePath);
      const slashResult = applyVaultseerSlashCommandMessage(
        this.chatState,
        message,
        this.getVaultseerCommands(),
        new Date().toISOString()
      );
      if (slashResult.handled) {
        this.chatState = slashResult.state;
        await this.refresh();
        return;
      }

      const sendId = ++this.chatSendId;
      this.chatSending = true;
      const sendScope = createCodexChatSendScope(this.chatState, sendId, activePath);
      this.chatState = applyChatEvent(this.chatState, {
        type: "user_message",
        content: message,
        createdAt: new Date().toISOString()
      });

      if (this.chatAdapter.capabilities?.nativeToolLoop === true) {
        await this.refresh();

        try {
          const context = await this.buildActiveNoteContext();
          const response = await this.chatAdapter.send({
            message,
            context
          });
          await this.applyCodexResponseAndAutoContinue(sendScope, response, 0);
        } catch (error) {
          if (this.isCurrentChatSend(sendScope)) {
            this.chatState = applyChatEvent(this.chatState, {
              type: "error",
              message: getErrorMessage(error)
            });
          }
        } finally {
          if (this.chatSendId === sendId) {
            this.chatSending = false;
          }
          await this.refresh();
        }
        return;
      }

      const lastAssistantMarkdownSuggestion = extractLastAssistantMarkdownSuggestion(this.chatState.messages);
      const actionPlan = buildVaultseerChatActionPlan({
        message,
        activePath,
        lastAssistantMarkdownSuggestion
      });
      const actionPlanSplit = splitVaultseerChatActionPlan(actionPlan);
      if (actionPlan.content !== null || actionPlanSplit.approvalToolRequests.length > 0) {
        this.chatState = applyChatEvent(this.chatState, {
          type: "assistant_message",
          content: actionPlan.content ?? "Vaultseer prepared actions for this request.",
          createdAt: new Date().toISOString(),
          toolRequests: actionPlanSplit.approvalToolRequests
        });
      }
      const stagedProposalResults = await this.runApprovedProposalToolRequests([
        ...(actionPlan.autoStageToolRequests ?? []),
        ...actionPlanSplit.autoStageToolRequests
      ]);
      if (stagedProposalResults.length > 0 && this.isCurrentChatSend(sendScope)) {
        this.chatState = applyChatEvent(this.chatState, {
          type: "assistant_message",
          content: [
            "Vaultseer staged the active-note proposal for review.",
            ...stagedProposalResults.map((result) => formatCodexToolResultMessage(result))
          ].join("\n\n"),
          createdAt: new Date().toISOString()
        });
      }
      if (actionPlan.sendToCodex === false) {
        this.chatSending = false;
        await this.refresh();
        return;
      }
      await this.refresh();

      try {
        const automaticToolResults = await this.runAutomaticToolRequests(actionPlanSplit.autoRunToolRequests);
        if (automaticToolResults.length > 0 && this.isCurrentChatSend(sendScope)) {
          this.chatState = applyChatEvent(this.chatState, {
            type: "assistant_message",
            content: [
              "Vaultseer checked read-only context automatically.",
              ...automaticToolResults.map((result) => formatCodexToolResultMessage(result))
            ].join("\n\n"),
            createdAt: new Date().toISOString()
          });
          await this.refresh();
        }

        const context = await this.buildActiveNoteContext();
        const response = await this.chatAdapter.send({
          message: buildVaultseerActionEvidenceMessage(actionPlan.agentMessage ?? message, automaticToolResults),
          context
        });
        await this.applyCodexResponseAndAutoContinue(sendScope, response, 0);
      } catch (error) {
        if (this.isCurrentChatSend(sendScope)) {
          this.chatState = applyChatEvent(this.chatState, {
            type: "error",
            message: getErrorMessage(error)
          });
        }
      } finally {
        if (this.chatSendId === sendId) {
          this.chatSending = false;
        }
        await this.refresh();
      }
    });
  }

  private async applyCodexResponseAndAutoContinue(
    sendScope: CodexChatSendScope,
    response: Awaited<ReturnType<CodexChatAdapter["send"]>>,
    iteration: number
  ): Promise<void> {
    if (!this.isCurrentChatSend(sendScope)) {
      return;
    }

    const split = splitCodexToolRequestsForExecution(response.toolRequests);
    this.appendNativeAgentToolEvents(response.toolEvents);
    this.chatState = applyChatEvent(this.chatState, {
      type: "assistant_message",
      content: response.content,
      createdAt: new Date().toISOString(),
      toolRequests: split.approvalToolRequests
    });
    await this.refresh();

    const stagedProposalResults = await this.runApprovedProposalToolRequests(split.autoStageToolRequests);
    if (stagedProposalResults.length > 0 && this.isCurrentChatSend(sendScope)) {
      this.chatState = applyChatEvent(this.chatState, {
        type: "assistant_message",
        content: [
          "Vaultseer staged the active-note proposal for review.",
          ...stagedProposalResults.map((result) => formatCodexToolResultMessage(result))
        ].join("\n\n"),
        createdAt: new Date().toISOString()
      });
      await this.refresh();
    }

    if (
      !shouldContinueVaultseerToolLoop({
        iteration,
        maxIterations: MAX_CODEX_TOOL_CONTINUATION_ITERATIONS,
        resultCount: split.autoRunToolRequests.length
      })
    ) {
      return;
    }

    const automaticToolResults = await this.runAutomaticToolRequests(split.autoRunToolRequests);
    if (!this.isCurrentChatSend(sendScope)) {
      return;
    }

    this.chatState = applyChatEvent(this.chatState, {
      type: "assistant_message",
      content: [
        "Vaultseer ran requested read-only tools automatically.",
        ...automaticToolResults.map((result) => formatCodexToolResultMessage(result))
      ].join("\n\n"),
      createdAt: new Date().toISOString()
    });
    await this.refresh();

    const context = await this.buildActiveNoteContext();
    const continuationResponse = await this.chatAdapter.send({
      message: buildVaultseerToolContinuationMessage(automaticToolResults),
      context
    });
    await this.applyCodexResponseAndAutoContinue(sendScope, continuationResponse, iteration + 1);
  }

  private appendNativeAgentToolEvents(
    toolEvents: Awaited<ReturnType<CodexChatAdapter["send"]>>["toolEvents"]
  ): void {
    if (!Array.isArray(toolEvents) || toolEvents.length === 0) {
      return;
    }

    for (const event of toolEvents) {
      this.chatState = applyChatEvent(this.chatState, {
        type: "system_message",
        content: formatCodexToolResultMessage(event.result),
        createdAt: new Date().toISOString()
      });
    }
  }

  private async continueCodexAfterToolResults(results: CodexToolResult[]): Promise<void> {
    if (
      !shouldContinueVaultseerToolLoop({
        iteration: 0,
        maxIterations: MAX_CODEX_TOOL_CONTINUATION_ITERATIONS,
        resultCount: results.length
      })
    ) {
      return;
    }

    const activePath = this.getActivePath();
    this.chatState = applyActiveNoteChangeToChatState(this.chatState, activePath);
    const sendId = ++this.chatSendId;
    const sendScope = createCodexChatSendScope(this.chatState, sendId, activePath);
    this.chatSending = true;
    await this.refresh();

    try {
      const context = await this.buildActiveNoteContext();
      const response = await this.chatAdapter.send({
        message: buildVaultseerToolContinuationMessage(results),
        context
      });
      await this.applyCodexResponseAndAutoContinue(sendScope, response, 0);
    } catch (error) {
      if (this.isCurrentChatSend(sendScope)) {
        this.chatState = applyChatEvent(this.chatState, {
          type: "error",
          message: getErrorMessage(error)
        });
      }
    } finally {
      if (this.chatSendId === sendId) {
        this.chatSending = false;
      }
      await this.refresh();
    }
  }

  private async runAutomaticToolRequests(requests: CodexChatToolRequest[]): Promise<CodexToolResult[]> {
    const results: CodexToolResult[] = [];

    for (const request of requests) {
      results.push(
        await dispatchCodexToolRequest({
          request: {
            tool: request.tool,
            input: request.input
          },
          tools: this.codexTools
        })
      );
    }

    return results;
  }

  private async runApprovedProposalToolRequests(requests: CodexChatToolRequest[]): Promise<CodexToolResult[]> {
    const results: CodexToolResult[] = [];
    const activePath = this.getActivePath();

    for (const request of requests) {
      results.push(
        await dispatchCodexToolRequest({
          request: {
            tool: request.tool,
            input: request.input
          },
          tools: this.codexTools,
          allowProposalTools: true,
          beforeProposalCommit: () => this.getActivePath() === activePath
        })
      );
    }

    return results;
  }

  private renderPendingToolRequests(containerEl: HTMLElement): void {
    if (this.chatState.pendingToolRequests.length === 0) {
      return;
    }

    const pendingEl = containerEl.createDiv({ cls: "vaultseer-studio-chat-tool-requests" });
    pendingEl.createEl("h4", { text: "Requested actions" });

    for (const request of buildCodexPendingToolRequestDisplayItems(this.chatState.pendingToolRequests)) {
      const requestEl = pendingEl.createDiv({ cls: "vaultseer-studio-chat-tool-request" });
      const summaryEl = requestEl.createDiv({ cls: "vaultseer-studio-chat-tool-request-summary" });
      summaryEl.createEl("strong", { text: request.title });
      summaryEl.createSpan({ text: request.statusLabel, cls: "vaultseer-studio-chat-tool-request-status" });
      summaryEl.createEl("p", { text: request.description });
      if (request.inputPreview !== "null" && request.inputPreview !== "No input") {
        summaryEl.createEl("code", { text: request.inputPreview });
      }

      for (const control of request.controls) {
        const button = requestEl.createEl("button", {
          text: control.label,
          attr: {
            type: "button"
          }
        });
        button.addEventListener("click", async () => {
          if (control.type === "run") {
            await this.handleToolRequestRun(control.displayId);
            return;
          }

          if (control.type === "stage") {
            await this.handleToolRequestStage(control.displayId);
            return;
          }

          await this.handleToolRequestDismiss(control.displayId);
        });
      }
    }
  }

  private async handleToolRequestRun(displayId: string): Promise<void> {
    const activePath = this.getActivePath();
    this.chatState = applyActiveNoteChangeToChatState(this.chatState, activePath);
    const request = this.chatState.pendingToolRequests.find((pendingRequest) => pendingRequest.displayId === displayId);
    if (!request || !isRunnableCodexTool(request.tool) || request.executionStatus !== undefined) {
      await this.refresh();
      return;
    }

    const scope = createCodexToolRequestScope(this.chatState, displayId, activePath);
    this.chatState = applyChatEvent(this.chatState, {
      type: "start_tool_request",
      displayId,
      scope
    });
    await this.refresh();

    let result: CodexToolResult;
    try {
      result = await dispatchCodexToolRequest({
        request: {
          tool: request.tool,
          input: request.input
        },
        tools: this.codexTools
      });
    } catch (error) {
      result = {
        ok: false,
        tool: request.tool,
        message: getErrorMessage(error)
      };
    }

    if (this.isCurrentToolRequest(scope)) {
      this.chatState = applyChatEvent(this.chatState, {
        type: result.ok ? "complete_tool_request" : "fail_tool_request",
        displayId,
        scope,
        result,
        createdAt: new Date().toISOString()
      });
      await this.continueCodexAfterToolResults([result]);
    }

    await this.refresh();
  }

  private async handleToolRequestStage(displayId: string): Promise<void> {
    const activePath = this.getActivePath();
    this.chatState = applyActiveNoteChangeToChatState(this.chatState, activePath);
    const request = this.chatState.pendingToolRequests.find((pendingRequest) => pendingRequest.displayId === displayId);
    if (!request || !isProposalCodexTool(request.tool) || request.tool !== "stage_suggestion" || request.executionStatus !== undefined) {
      await this.refresh();
      return;
    }

    const scope = createCodexToolRequestScope(this.chatState, displayId, activePath);
    this.chatState = applyChatEvent(this.chatState, {
      type: "start_tool_request",
      displayId,
      scope
    });
    await this.refresh();

    let result: CodexToolResult;
    try {
      result = await dispatchCodexToolRequest({
        request: {
          tool: request.tool,
          input: request.input
        },
        tools: this.codexTools,
        allowProposalTools: true,
        beforeProposalCommit: () => this.isCurrentToolRequest(scope)
      });
    } catch (error) {
      result = {
        ok: false,
        tool: request.tool,
        message: getErrorMessage(error)
      };
    }

    if (this.isCurrentToolRequest(scope)) {
      this.chatState = applyChatEvent(this.chatState, {
        type: result.ok ? "complete_tool_request" : "fail_tool_request",
        displayId,
        scope,
        result,
        createdAt: new Date().toISOString()
      });
      await this.continueCodexAfterToolResults([result]);
    }

    await this.refresh();
  }

  private async handleToolRequestDismiss(displayId: string): Promise<void> {
    this.chatState = applyChatEvent(this.chatState, {
      type: "dismiss_tool_request",
      displayId
    });
    await this.refresh();
  }

  private async handleProposalControl(operationId: string, controlType: StudioNoteProposalControlType): Promise<void> {
    if (controlType === "approve_apply") {
      await this.handleProposalApproveAndApply(operationId);
      return;
    }

    if (controlType === "apply") {
      await this.handleProposalApply(operationId);
      return;
    }

    const decision = proposalControlToDecision(controlType);
    if (decision === null) {
      await this.refresh();
      return;
    }

    await this.handleProposalDecision(operationId, decision);
  }

  private async handleProposalApproveAndApply(operationId: string): Promise<void> {
    try {
      const operation = await this.loadProposalOperation(operationId);
      if (operation === null) {
        new Notice("Vaultseer proposal is no longer available.");
        await this.refresh();
        return;
      }

      const decisionSummary = await recordWriteReviewQueueDecision({
        store: this.store,
        operation,
        decision: "approved",
        now: () => new Date().toISOString()
      });
      const applySummary = await applyApprovedVaultWriteOperation({
        store: this.store,
        writePort: this.writePort,
        operation,
        decision: decisionSummary.decisionRecord,
        now: () => new Date().toISOString()
      });
      new Notice(`${decisionSummary.message} ${applySummary.message}`);
    } catch (error) {
      new Notice(`Vaultseer could not approve and apply the proposal: ${getErrorMessage(error)}`);
    }

    await this.refresh();
  }

  private async handleProposalDecision(operationId: string, decision: VaultWriteDecision): Promise<void> {
    try {
      const operation = await this.loadProposalOperation(operationId);
      if (operation === null) {
        new Notice("Vaultseer proposal is no longer available.");
        await this.refresh();
        return;
      }

      const summary = await recordWriteReviewQueueDecision({
        store: this.store,
        operation,
        decision,
        now: () => new Date().toISOString()
      });
      new Notice(summary.message);
    } catch (error) {
      new Notice(`Vaultseer could not record the proposal decision: ${getErrorMessage(error)}`);
    }

    await this.refresh();
  }

  private async handleProposalApply(operationId: string): Promise<void> {
    try {
      const operation = await this.loadProposalOperation(operationId);
      if (operation === null) {
        new Notice("Vaultseer proposal is no longer available.");
        await this.refresh();
        return;
      }

      const decisions = await this.store.getVaultWriteDecisionRecords();
      const summary = await applyApprovedVaultWriteOperation({
        store: this.store,
        writePort: this.writePort,
        operation,
        decision: findLatestDecision(decisions, operationId),
        now: () => new Date().toISOString()
      });
      new Notice(summary.message);
    } catch (error) {
      new Notice(`Vaultseer could not apply the proposal: ${getErrorMessage(error)}`);
    }

    await this.refresh();
  }

  private async loadProposalOperation(operationId: string): Promise<GuardedVaultWriteOperation | null> {
    const operations = await this.store.getVaultWriteOperations();
    return operations.find((operation) => operation.id === operationId) ?? null;
  }

  private showModelMenu(event: MouseEvent): void {
    event.preventDefault();
    const current = this.getCodexModelSelection().codexModel;
    const menu = new Menu();

    for (const model of CODEX_MODEL_OPTIONS) {
      menu.addItem((item) => {
        item.setTitle(model === current ? `Current: ${model}` : model);
        item.onClick(async () => {
          await this.updateCodexModelSelection({ codexModel: model });
          await this.refresh();
        });
      });
    }

    menu.showAtMouseEvent(event);
  }

  private showCommandMenu(event: MouseEvent): void {
    event.preventDefault();
    const menu = new Menu();

    for (const group of groupVaultseerStudioCommands(this.getVaultseerCommands())) {
      menu.addItem((item) => {
        item.setTitle(group.label);
        item.setIsLabel(true);
      });

      for (const command of group.commands) {
        menu.addItem((item) => {
          item.setTitle(command.name);
          item.onClick(async () => {
            const activePath = this.getActivePath();
            this.chatState = applyActiveNoteChangeToChatState(this.chatState, activePath);
            this.chatState = queueVaultseerStudioCommandRequest(this.chatState, command, new Date().toISOString());
            await this.refresh();
          });
        });
      }
    }

    menu.showAtMouseEvent(event);
  }

  private showReasoningMenu(event: MouseEvent): void {
    event.preventDefault();
    const current = this.getCodexModelSelection().codexReasoningEffort;
    const menu = new Menu();

    for (const effort of CODEX_REASONING_EFFORT_OPTIONS) {
      menu.addItem((item) => {
        const label = formatReasoningEffort(effort);
        item.setTitle(effort === current ? `Current: ${label}` : label);
        item.onClick(async () => {
          await this.updateCodexModelSelection({ codexReasoningEffort: effort });
          await this.refresh();
        });
      });
    }

    menu.showAtMouseEvent(event);
  }

  private isCurrentChatSend(scope: CodexChatSendScope): boolean {
    return isCurrentCodexChatSend(this.chatState, this.getActivePath(), scope, this.chatSendId);
  }

  private isCurrentToolRequest(scope: CodexToolRequestScope): boolean {
    return isCurrentCodexToolRequestScope(this.chatState, this.getActivePath(), scope);
  }

  private handleActiveNoteOpened(activePath: string | null): void {
    this.chatState = applyActiveNoteChangeToChatState(this.chatState, activePath);
  }
}

export async function activateVaultseerStudio(app: App): Promise<WorkspaceLeaf | null> {
  const existingLeaf = app.workspace.getLeavesOfType(VAULTSEER_STUDIO_VIEW_TYPE)[0];
  const leaf = existingLeaf ?? app.workspace.getRightLeaf(false);
  if (!leaf) return null;

  await leaf.setViewState({ type: VAULTSEER_STUDIO_VIEW_TYPE, active: true });
  await app.workspace.revealLeaf(leaf);
  return leaf;
}

function proposalControlToDecision(controlType: StudioNoteProposalControlType): VaultWriteDecision | null {
  switch (controlType) {
    case "approve":
      return "approved";
    case "defer":
      return "deferred";
    case "reject":
      return "rejected";
    case "approve_apply":
      return null;
    case "apply":
      return null;
  }
}

function findLatestDecision(
  decisions: VaultWriteDecisionRecord[],
  operationId: string
): VaultWriteDecisionRecord | null {
  let latest: VaultWriteDecisionRecord | null = null;
  for (const decision of decisions) {
    if (decision.operationId !== operationId) continue;
    if (latest === null || latest.decidedAt.localeCompare(decision.decidedAt) < 0) {
      latest = decision;
    }
  }
  return latest;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function capitalize(value: string): string {
  return value.length > 0 ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}

function formatReasoningEffort(value: string): string {
  return value.length > 0 ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}

function requestFormSubmit(form: HTMLFormElement): void {
  if (typeof form.requestSubmit === "function") {
    form.requestSubmit();
    return;
  }

  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}
