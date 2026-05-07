import { ItemView, MarkdownRenderer, Menu, Notice, TFile, type App, type WorkspaceLeaf } from "obsidian";
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
import {
  dispatchCodexToolRequest,
  isProposalCodexTool,
  isRunnableCodexTool,
  type CodexToolImplementations,
  type CodexToolResult
} from "./codex-tool-dispatcher";
import {
  buildStudioChatComposerState,
  buildStudioChatContextBarState,
  buildStudioChatShellState
} from "./studio-chat-shell-state";
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
import type { StudioNoteProposalControlType } from "./studio-note-proposal-cards";
import { renderStudioCurrentNoteProposalCards } from "./studio-note-proposal-card-view";
import {
  renderStudioPendingToolRequests,
  type StudioPendingToolRequestControlType
} from "./studio-pending-tool-request-view";
import { buildStudioStatusStrip } from "./studio-status-strip";
import { renderStudioStatusStrip } from "./studio-status-strip-view";
import { renderStudioChatPanel } from "./studio-chat-panel-view";
import { renderStudioCommandPanel } from "./studio-command-panel-view";
import {
  buildVaultseerChatActionPlan,
  extractLastAssistantMarkdownSuggestion,
  extractLastAssistantStageableMarkdownSuggestion
} from "./vaultseer-chat-action-plan";
import {
  appendAssistantRequestedStageSuggestion,
  buildVaultseerNativeToolLoopMessage,
  buildVaultseerStagedProposalMessage,
  buildVaultseerToolContinuationMessage,
  buildVaultseerActionEvidenceMessage,
  shouldHandleVaultseerActionPlanBeforeNativeToolLoop,
  shouldContinueVaultseerToolLoop,
  splitCodexToolRequestsForExecution,
  splitVaultseerChatActionPlan
} from "./vaultseer-chat-action-execution";
import { formatCodexToolResultMessage } from "./codex-tool-result-message";
import {
  applyVaultseerSlashCommandMessage,
  queueVaultseerStudioCommandRequest
} from "./vaultseer-studio-command-request";
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
  canAttachMoreChatImages,
  CHAT_IMAGE_ATTACHMENT_EXTENSIONS,
  createChatImageAttachment,
  MAX_CHAT_IMAGE_ATTACHMENT_COUNT,
  type ChatImageAttachment
} from "./chat-image-attachment";
import { restoreChatComposerFocus, shouldSubmitChatComposerKey } from "./chat-composer-focus";
import { VaultseerChatImageAttachmentModal } from "./chat-image-attachment-modal";
import { readVaultAssetRecords, type VaultAssetReaderApp, type VaultAssetRecord } from "./obsidian-adapter";
import { formatCodexRuntimeFailure } from "./codex-runtime-state";
import { shouldRefreshIndexAfterAcceptedWrite } from "./write-review-followup";

export const VAULTSEER_STUDIO_VIEW_TYPE = "vaultseer-studio";
const MAX_CODEX_TOOL_CONTINUATION_ITERATIONS = 3;

export class VaultseerStudioView extends ItemView {
  private activeMode: StudioModeId | null = null;
  private chatState: CodexChatState = createEmptyChatState(null);
  private chatSending = false;
  private chatSendId = 0;
  private chatDraft = "";
  private chatDraftAttachments: ChatImageAttachment[] = [];
  private chatComposerFocusRequested = false;

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
    private readonly refreshIndexAfterActiveNoteWrite: () => Promise<void>,
    private readonly buildActiveNoteContext: () => Promise<ActiveNoteContextPacket>,
    private readonly chatAdapter: CodexChatAdapter,
    private readonly codexTools: CodexToolImplementations,
    private readonly writePort: VaultWritePort,
    private readonly readVaultBinaryFile: (path: string) => Promise<Uint8Array | ArrayBuffer>
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
    if (state.activeMode !== "chat") {
      contentEl.createEl("h2", { text: state.title });
      contentEl.createEl("p", { text: `Current note: ${state.activeNoteLabel}` });
      renderStudioStatusStrip(
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
    }
    this.renderSelectedMode(contentEl, state, writeOperations, writeDecisions, writeApplyResults);
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
        if (mode.id === "chat") {
          this.chatComposerFocusRequested = true;
        }
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
        if (card.modeId === "chat") {
          this.chatComposerFocusRequested = true;
        }
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
      this.chatComposerFocusRequested = true;
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
      surface?: "note" | "chat";
    }
  ): void {
    renderStudioCurrentNoteProposalCards(containerEl, input, (operationId, controlType) =>
      this.handleProposalControl(operationId, controlType)
    );
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
      ...this.getCodexModelSelection(),
      chatSending: this.chatSending
    });
    const composerState = buildStudioChatComposerState({
      chatSending: this.chatSending,
      draft: this.chatDraft,
      focusRequested: this.chatComposerFocusRequested
    });
    const shellEl = containerEl.createDiv({ cls: "vaultseer-codex-shell" });
    const contextBar = buildStudioChatContextBarState({
      activeNoteLabel: state.activeNoteLabel,
      activeNotePath: state.activeNotePath,
      activeNoteIndexed: state.activeNoteIndexed,
      activeProposalCount: writeOperations.filter((operation) => operation.targetPath === state.activeNotePath).length
    });
    renderStudioChatPanel(shellEl, {
      shellState,
      contextBar,
      chatState: this.chatState,
      activeNotePath: state.activeNotePath,
      chatSending: this.chatSending,
      onTools: (event) => {
        this.showStudioModeMenu(event, state);
      },
      onReset: async () => {
        this.chatSendId += 1;
        this.chatSending = false;
        this.chatState = applyChatEvent(this.chatState, { type: "clear" });
        this.chatDraftAttachments = [];
        await this.resetCodexSession();
        this.chatComposerFocusRequested = true;
        await this.refresh();
      },
      onContextBarAction: async () => {
        await this.handleContextBarAction(contextBar.action?.id ?? null, shellEl);
      },
      renderMarkdown: (content, bodyEl, sourcePath) => MarkdownRenderer.render(this.app, content, bodyEl, sourcePath, this),
      onRenderError: (error) => {
        console.warn("Vaultseer could not render chat Markdown.", error);
      }
    });

    this.renderPendingToolRequests(shellEl);
    const proposalAnchorEl = shellEl.createDiv({ cls: "vaultseer-codex-proposals-anchor" });
    this.renderCurrentNoteProposalCards(proposalAnchorEl, {
      activePath: state.activeNotePath,
      writeOperations,
      writeDecisions,
      writeApplyResults,
      showEmptyState: false,
      surface: "chat"
    });

    if (this.chatState.error) {
      shellEl.createEl("p", { text: this.chatState.error, cls: "vaultseer-codex-error" });
    }

    const form = shellEl.createEl("form", { cls: "vaultseer-codex-composer" });
    const composerBodyEl = form.createDiv({ cls: "vaultseer-codex-composer-body" });
    if (shellState.activeNoteMention !== null) {
      composerBodyEl.createEl("span", { text: shellState.activeNoteMention, cls: "vaultseer-codex-note-pill" });
    }
    this.renderChatAttachmentControls(composerBodyEl);

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
          this.chatComposerFocusRequested = true;
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
    input.addEventListener("keydown", (event) => {
      if (!shouldSubmitChatComposerKey(event)) {
        return;
      }

      event.preventDefault();
      requestFormSubmit(form);
    });
    composerBodyEl.createEl("span", { text: shellState.composerHint, cls: "vaultseer-codex-composer-hint" });

    const footerEl = form.createDiv({ cls: "vaultseer-codex-composer-footer" });
    renderStudioCommandPanel(footerEl, {
      shellState,
      composerState,
      chatSending: this.chatSending,
      onCommandMenu: (event) => {
        this.showCommandMenu(event);
      },
      onModelMenu: (event) => {
        this.showModelMenu(event);
      },
      onReasoningMenu: (event) => {
        this.showReasoningMenu(event);
      }
    });
    input.disabled = composerState.inputDisabled;
    if (composerState.shouldRestoreFocus) {
      this.chatComposerFocusRequested = false;
      restoreChatComposerFocus(input);
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (this.chatSending) return;

      const message = input.value.trim();
      if (!message) return;
      const attachments = this.chatDraftAttachments.map((attachment) => attachment.contentPart);
      const displayMessage = formatChatUserMessage(message, this.chatDraftAttachments);
      this.chatDraft = "";
      this.chatDraftAttachments = [];
      await this.submitChatMessage({ message, displayMessage, attachments });
    });
  }

  async submitExternalChatMessage(message: string, displayMessage?: string): Promise<void> {
    const normalized = message.trim();
    if (normalized.length === 0 || this.chatSending) {
      return;
    }

    this.activeMode = "chat";
    this.chatDraft = "";
    this.chatDraftAttachments = [];
    await this.submitChatMessage({
      message: normalized,
      displayMessage: displayMessage?.trim() || normalized,
      attachments: []
    });
  }

  private async submitChatMessage(input: {
    message: string;
    displayMessage: string;
    attachments: ChatImageAttachment["contentPart"][];
  }): Promise<void> {
    const { message, displayMessage, attachments } = input;
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
      this.chatComposerFocusRequested = true;
      await this.refresh();
      return;
    }

    const sendId = ++this.chatSendId;
    this.chatSending = true;
    const sendScope = createCodexChatSendScope(this.chatState, sendId, activePath);
    this.chatState = applyChatEvent(this.chatState, {
      type: "user_message",
      content: displayMessage,
      createdAt: new Date().toISOString()
    });

    const lastAssistantMarkdownSuggestion = extractLastAssistantMarkdownSuggestion(this.chatState.messages);
    const lastAssistantStageableMarkdownSuggestion = extractLastAssistantStageableMarkdownSuggestion(this.chatState.messages);
    const actionPlan = buildVaultseerChatActionPlan({
      message,
      activePath,
      lastAssistantMarkdownSuggestion,
      lastAssistantStageableMarkdownSuggestion
    });
    const actionPlanSplit = splitVaultseerChatActionPlan(actionPlan);

    if (this.chatAdapter.capabilities?.nativeToolLoop === true) {
      if (shouldHandleVaultseerActionPlanBeforeNativeToolLoop(actionPlan)) {
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
            content: buildVaultseerStagedProposalMessage(stagedProposalResults),
            createdAt: new Date().toISOString()
          });
        }

        this.chatSending = false;
        this.chatComposerFocusRequested = true;
        await this.refresh();
        return;
      }

      await this.refresh();

      try {
        const context = await this.buildActiveNoteContext();
        const response = await this.chatAdapter.send({
          message: buildVaultseerNativeToolLoopMessage({ originalMessage: message, actionPlan }),
          context,
          attachments
        });
        await this.applyCodexResponseAndAutoContinue(sendScope, response, 0);
      } catch (error) {
        if (this.isCurrentChatSend(sendScope)) {
          this.chatState = applyChatEvent(this.chatState, {
            type: "error",
            message: getCodexProviderErrorMessage(error)
          });
        }
      } finally {
        if (this.chatSendId === sendId) {
          this.chatSending = false;
          this.chatComposerFocusRequested = true;
        }
        await this.refresh();
      }
      return;
    }

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
        content: buildVaultseerStagedProposalMessage(stagedProposalResults),
        createdAt: new Date().toISOString()
      });
    }
    if (actionPlan.sendToCodex === false) {
      this.chatSending = false;
      this.chatComposerFocusRequested = true;
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
        context,
        attachments
      });
      await this.applyCodexResponseAndAutoContinue(sendScope, response, 0);
    } catch (error) {
      if (this.isCurrentChatSend(sendScope)) {
        this.chatState = applyChatEvent(this.chatState, {
          type: "error",
          message: getCodexProviderErrorMessage(error)
        });
      }
    } finally {
      if (this.chatSendId === sendId) {
        this.chatSending = false;
        this.chatComposerFocusRequested = true;
      }
      await this.refresh();
    }
  }

  private async applyCodexResponseAndAutoContinue(
    sendScope: CodexChatSendScope,
    response: Awaited<ReturnType<CodexChatAdapter["send"]>>,
    iteration: number
  ): Promise<void> {
    if (!this.isCurrentChatSend(sendScope)) {
      return;
    }

    const toolRequests = appendAssistantRequestedStageSuggestion({
      content: response.content,
      activePath: sendScope.activePath,
      toolRequests: response.toolRequests
    });
    const split = splitCodexToolRequestsForExecution(toolRequests);
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
        content: buildVaultseerStagedProposalMessage(stagedProposalResults),
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
          message: getCodexProviderErrorMessage(error)
        });
      }
    } finally {
      if (this.chatSendId === sendId) {
        this.chatSending = false;
        this.chatComposerFocusRequested = true;
      }
      await this.refresh();
    }
  }

  private async handleContextBarAction(
    actionId: "review-proposals" | "rebuild-index" | "draft-rewrite" | null,
    shellEl: HTMLElement
  ): Promise<void> {
    if (actionId === "review-proposals") {
      shellEl.querySelector(".vaultseer-codex-proposals-anchor")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
      return;
    }

    if (actionId === "draft-rewrite") {
      await this.submitExternalChatMessage("review this note and make it clearer, better structured, and easier to read");
      return;
    }

    if (actionId !== "rebuild-index") {
      return;
    }

    const command = this.getVaultseerCommands().find((item) => item.id === "rebuild-index");
    if (command === undefined) {
      new Notice("Vaultseer index command is not available.");
      return;
    }

    const activePath = this.getActivePath();
    this.chatState = applyActiveNoteChangeToChatState(this.chatState, activePath);
    this.chatState = queueVaultseerStudioCommandRequest(this.chatState, command, new Date().toISOString());
    this.chatComposerFocusRequested = true;
    await this.refresh();
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
    renderStudioPendingToolRequests(containerEl, this.chatState.pendingToolRequests, (displayId, controlType) =>
      this.handlePendingToolRequestControl(displayId, controlType)
    );
  }

  private async handlePendingToolRequestControl(
    displayId: string,
    controlType: StudioPendingToolRequestControlType
  ): Promise<void> {
    if (controlType === "run") {
      await this.handleToolRequestRun(displayId);
      return;
    }

    if (controlType === "stage") {
      await this.handleToolRequestStage(displayId);
      return;
    }

    await this.handleToolRequestDismiss(displayId);
  }

  private async handleToolRequestRun(displayId: string): Promise<void> {
    const activePath = this.getActivePath();
    this.chatState = applyActiveNoteChangeToChatState(this.chatState, activePath);
    const request = this.chatState.pendingToolRequests.find((pendingRequest) => pendingRequest.displayId === displayId);
    if (!request || !isRunnableCodexTool(request.tool) || request.executionStatus !== undefined) {
      this.chatComposerFocusRequested = true;
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

    this.chatComposerFocusRequested = true;
    await this.refresh();
  }

  private async handleToolRequestStage(displayId: string): Promise<void> {
    const activePath = this.getActivePath();
    this.chatState = applyActiveNoteChangeToChatState(this.chatState, activePath);
    const request = this.chatState.pendingToolRequests.find((pendingRequest) => pendingRequest.displayId === displayId);
    if (!request || !isProposalCodexTool(request.tool) || request.tool !== "stage_suggestion" || request.executionStatus !== undefined) {
      this.chatComposerFocusRequested = true;
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

    this.chatComposerFocusRequested = true;
    await this.refresh();
  }

  private async handleToolRequestDismiss(displayId: string): Promise<void> {
    this.chatState = applyChatEvent(this.chatState, {
      type: "dismiss_tool_request",
      displayId
    });
    this.chatComposerFocusRequested = true;
    await this.refresh();
  }

  private renderChatAttachmentControls(containerEl: HTMLElement): void {
    const rowEl = containerEl.createDiv({ cls: "vaultseer-codex-attachment-row" });
    const nativeAttachmentsEnabled = this.chatAdapter.capabilities?.nativeToolLoop === true;
    const attachButton = rowEl.createEl("button", {
      text: "Attach image",
      attr: {
        type: "button",
        "aria-label": "Attach vault image"
      },
      cls: "vaultseer-codex-attach-button"
    });
    attachButton.disabled =
      this.chatSending ||
      !nativeAttachmentsEnabled ||
      !canAttachMoreChatImages(this.chatDraftAttachments.length);
    attachButton.title = nativeAttachmentsEnabled
      ? `Attach up to ${MAX_CHAT_IMAGE_ATTACHMENT_COUNT} vault images to the next message`
      : "Image attachments require the OpenAI provider in Vaultseer settings";
    attachButton.addEventListener("click", async () => {
      await this.handleImageAttachPick();
    });

    for (const attachment of this.chatDraftAttachments) {
      const chipEl = rowEl.createDiv({ cls: "vaultseer-codex-attachment-chip" });
      chipEl.createEl("span", { text: attachment.filename });
      const removeButton = chipEl.createEl("button", {
        text: "x",
        attr: {
          type: "button",
          "aria-label": `Remove ${attachment.filename}`
        }
      });
      removeButton.disabled = this.chatSending;
      removeButton.addEventListener("click", async () => {
        this.chatDraftAttachments = this.chatDraftAttachments.filter((item) => item.id !== attachment.id);
        this.chatComposerFocusRequested = true;
        await this.refresh();
      });
    }
  }

  private async handleImageAttachPick(): Promise<void> {
    if (this.chatAdapter.capabilities?.nativeToolLoop !== true) {
      new Notice("Vaultseer image attachments require the OpenAI provider in settings.");
      return;
    }

    if (!canAttachMoreChatImages(this.chatDraftAttachments.length)) {
      new Notice(`Vaultseer can attach up to ${MAX_CHAT_IMAGE_ATTACHMENT_COUNT} images per message.`);
      return;
    }

    const assets = readVaultAssetRecords(this.app as unknown as VaultAssetReaderApp, {
      extensions: [...CHAT_IMAGE_ATTACHMENT_EXTENSIONS]
    });
    new VaultseerChatImageAttachmentModal(this.app, assets, async (asset) => {
      await this.attachVaultImageToDraft(asset);
    }).open();
  }

  private async attachVaultImageToDraft(asset: VaultAssetRecord): Promise<void> {
    if (!canAttachMoreChatImages(this.chatDraftAttachments.length)) {
      new Notice(`Vaultseer can attach up to ${MAX_CHAT_IMAGE_ATTACHMENT_COUNT} images per message.`);
      return;
    }

    if (this.chatDraftAttachments.some((attachment) => attachment.path === asset.path)) {
      new Notice(`${asset.filename} is already attached.`);
      return;
    }

    try {
      const attachment = await createChatImageAttachment({
        asset,
        readVaultBinaryFile: this.readVaultBinaryFile
      });
      this.chatDraftAttachments = [...this.chatDraftAttachments, attachment];
      new Notice(`Attached ${attachment.filename} to the next Vaultseer message.`);
      this.chatComposerFocusRequested = true;
    } catch (error) {
      new Notice(`Vaultseer could not attach ${asset.filename}: ${getErrorMessage(error)}`);
    }

    await this.refresh();
  }

  private async handleProposalControl(operationId: string, controlType: StudioNoteProposalControlType): Promise<void> {
    if (controlType === "accept") {
      await this.handleProposalAccept(operationId);
      return;
    }

    if (controlType === "edit") {
      await this.handleProposalEdit(operationId);
      return;
    }

    const decision = proposalControlToDecision(controlType);
    if (decision === null) {
      this.chatComposerFocusRequested = true;
      await this.refresh();
      return;
    }

    await this.handleProposalDecision(operationId, decision);
  }

  private async handleProposalAccept(operationId: string): Promise<void> {
    try {
      const operation = await this.loadProposalOperation(operationId);
      if (operation === null) {
        new Notice("Vaultseer proposal is no longer available.");
        this.chatComposerFocusRequested = true;
        await this.refresh();
        return;
      }

      const operationToAccept = await this.refreshRewriteBeforeAccept(operation);
      const summary = await acceptWriteReviewQueueOperation({
        store: this.store,
        writePort: this.writePort,
        operation: operationToAccept,
        now: () => new Date().toISOString()
      });
      new Notice(summary.message);
      if (
        shouldRefreshIndexAfterAcceptedWrite({
          status: summary.status,
          targetPath: summary.targetPath,
          activePath: this.getActivePath()
        })
      ) {
        await this.refreshIndexAfterActiveNoteWrite();
      }
    } catch (error) {
      new Notice(`Vaultseer could not accept the proposal: ${getErrorMessage(error)}`);
    }

    this.chatComposerFocusRequested = true;
    await this.refresh();
  }

  private async handleProposalDecision(operationId: string, decision: VaultWriteDecision): Promise<void> {
    try {
      const operation = await this.loadProposalOperation(operationId);
      if (operation === null) {
        new Notice("Vaultseer proposal is no longer available.");
        this.chatComposerFocusRequested = true;
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

    this.chatComposerFocusRequested = true;
    await this.refresh();
  }

  private async handleProposalEdit(operationId: string): Promise<void> {
    try {
      const operation = await this.loadProposalOperation(operationId);
      if (operation === null) {
        new Notice("Vaultseer proposal is no longer available.");
        this.chatComposerFocusRequested = true;
        await this.refresh();
        return;
      }

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
          new Notice(`Updated proposal for ${operation.targetPath}.`);
          this.chatComposerFocusRequested = true;
          await this.refresh();
        }
      }).open();
    } catch (error) {
      new Notice(`Vaultseer could not edit the proposal: ${getErrorMessage(error)}`);
    }
  }

  private async loadProposalOperation(operationId: string): Promise<GuardedVaultWriteOperation | null> {
    const operations = await this.store.getVaultWriteOperations();
    return operations.find((operation) => operation.id === operationId) ?? null;
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

  private async readVaultTextFile(path: string): Promise<string> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      throw new Error(`Could not find ${path} in the vault.`);
    }
    return await this.app.vault.read(file);
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
          this.chatComposerFocusRequested = true;
          await this.refresh();
        });
      });
    }

    menu.showAtMouseEvent(event);
  }

  private showStudioModeMenu(event: MouseEvent, state: PluginStudioState): void {
    event.preventDefault();
    const menu = new Menu();

    for (const mode of state.modes) {
      menu.addItem((item) => {
        item.setTitle(mode.selected ? `Current: ${mode.label}` : mode.label);
        item.onClick(async () => {
          this.activeMode = mode.id;
          if (mode.id === "chat") {
            this.chatComposerFocusRequested = true;
          }
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
            this.chatComposerFocusRequested = true;
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
          this.chatComposerFocusRequested = true;
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
    const previousActivePath = this.chatState.activePath;
    this.chatState = applyActiveNoteChangeToChatState(this.chatState, activePath);
    if (previousActivePath !== activePath) {
      this.chatDraftAttachments = [];
    }
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
    case "defer":
      return "deferred";
    case "reject":
      return "rejected";
    case "accept":
    case "edit":
      return null;
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getCodexProviderErrorMessage(error: unknown): string {
  return formatCodexRuntimeFailure(getErrorMessage(error));
}

function formatReasoningEffort(value: string): string {
  return value.length > 0 ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}

function formatChatUserMessage(message: string, attachments: ChatImageAttachment[]): string {
  if (attachments.length === 0) {
    return message;
  }

  return [
    message,
    "",
    `Attached image${attachments.length === 1 ? "" : "s"}: ${attachments.map((item) => item.filename).join(", ")}`
  ].join("\n");
}

function requestFormSubmit(form: HTMLFormElement): void {
  if (typeof form.requestSubmit === "function") {
    form.requestSubmit();
    return;
  }

  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}
