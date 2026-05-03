import { ItemView, Menu, Notice, type App, type WorkspaceLeaf } from "obsidian";
import type {
  ActiveNoteContextPacket,
  CodexRuntimeStatus,
  GuardedVaultWriteOperation,
  IndexHealth,
  NoteRecord,
  StudioModeId,
  VaultseerStore
} from "@vaultseer/core";
import {
  applyChatEvent,
  applyActiveNoteChangeToChatState,
  createCodexChatSendScope,
  createCodexToolRequestScope,
  createEmptyChatState,
  isCurrentCodexToolRequestScope,
  isCurrentCodexChatSend,
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
import { buildStudioChatShellState } from "./studio-chat-shell-state";
import { buildInlineApprovalState } from "./inline-approval-state";
import { buildPluginStudioState, type PluginStudioState } from "./studio-state";
import { CODEX_MODEL_OPTIONS, CODEX_REASONING_EFFORT_OPTIONS, type CodexReasoningEffort } from "./settings-model";
import type { VaultseerStudioCommand } from "./studio-command-catalog";
import { buildVaultseerChatActionPlan } from "./vaultseer-chat-action-plan";

export const VAULTSEER_STUDIO_VIEW_TYPE = "vaultseer-studio";

export class VaultseerStudioView extends ItemView {
  private activeMode: StudioModeId | null = null;
  private chatState: CodexChatState = createEmptyChatState(null);
  private chatSending = false;
  private chatSendId = 0;

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
    private readonly codexTools: CodexToolImplementations
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
      const [health, notes, writeOperations] = await Promise.all([
        this.store.getHealth(),
        this.store.getNoteRecords(),
        this.store.getVaultWriteOperations()
      ]);
      this.render(health, notes, writeOperations);
    } catch (error) {
      contentEl.empty();
      contentEl.createEl("h2", { text: "Vaultseer Studio" });
      contentEl.createEl("p", { text: `Could not load Studio state: ${getErrorMessage(error)}` });
      new Notice("Vaultseer Studio could not load.");
    }
  }

  private render(health: IndexHealth, notes: NoteRecord[], writeOperations: GuardedVaultWriteOperation[]): void {
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
    this.renderModeButtons(contentEl, state);
    this.renderSelectedMode(contentEl, state, writeOperations);
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
    writeOperations: GuardedVaultWriteOperation[]
  ): void {
    const selectedMode = state.modes.find((mode) => mode.selected) ?? state.modes[0];
    const body = containerEl.createDiv({ cls: "vaultseer-studio-body" });

    if (selectedMode?.id === "chat") {
      this.renderChatMode(body, state);
      return;
    }

    body.createEl("h3", { text: selectedMode?.label ?? "Note" });
    body.createEl("p", { text: selectedMode?.message ?? "Mode is ready." });

    if (selectedMode?.id === "note") {
      this.renderNoteMode(body, state, writeOperations);
    }
  }

  private renderNoteMode(
    containerEl: HTMLElement,
    state: PluginStudioState,
    writeOperations: GuardedVaultWriteOperation[]
  ): void {
    const activePath = state.activeNotePath;
    if (!activePath) {
      containerEl.createEl("p", { text: "Open a Markdown note to review current-note proposals." });
      return;
    }

    const currentNoteOperations = writeOperations.filter((operation) => operation.targetPath === activePath);
    if (currentNoteOperations.length === 0) {
      containerEl.createEl("p", { text: "There are no current-note proposals to review." });
      containerEl.createEl("p", {
        text: "Stage note changes through the guarded proposal flow before approving them from the review queue."
      });
      return;
    }

    for (const operation of currentNoteOperations) {
      const approvalState = buildInlineApprovalState({
        operationType: operation.type,
        targetPath: operation.targetPath,
        activePath,
        touchesMultipleFiles: false
      });
      containerEl.createEl("p", {
        text: `${formatOperationType(operation.type)} for ${operation.targetPath}: ${approvalState.message}`
      });
    }
  }

  private renderChatMode(containerEl: HTMLElement, state: PluginStudioState): void {
    const shellState = buildStudioChatShellState({
      activeNoteLabel: state.activeNoteLabel,
      activeNotePath: state.activeNotePath,
      codexRuntimeStatus: this.getCodexRuntimeStatus(),
      ...this.getCodexModelSelection()
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

    if (this.chatState.error) {
      shellEl.createEl("p", { text: this.chatState.error, cls: "vaultseer-codex-error" });
    }

    const form = shellEl.createEl("form", { cls: "vaultseer-codex-composer" });
    const composerBodyEl = form.createDiv({ cls: "vaultseer-codex-composer-body" });
    if (shellState.activeNoteMention !== null) {
      composerBodyEl.createEl("span", { text: shellState.activeNoteMention, cls: "vaultseer-codex-note-pill" });
    }
    const input = composerBodyEl.createEl("textarea", {
      attr: {
        rows: "3",
        placeholder: shellState.composerPlaceholder
      }
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
      text: this.chatSending ? "..." : ">",
      attr: {
        type: "submit",
        "aria-label": "Send message"
      },
      cls: "vaultseer-codex-send-button"
    });
    input.disabled = this.chatSending;
    sendButton.disabled = this.chatSending;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (this.chatSending) return;

      const message = input.value.trim();
      if (!message) return;

      const sendId = ++this.chatSendId;
      const activePath = this.getActivePath();
      this.chatSending = true;
      this.chatState = applyActiveNoteChangeToChatState(this.chatState, activePath);
      const sendScope = createCodexChatSendScope(this.chatState, sendId, activePath);
      this.chatState = applyChatEvent(this.chatState, {
        type: "user_message",
        content: message,
        createdAt: new Date().toISOString()
      });
      const actionPlan = buildVaultseerChatActionPlan({ message, activePath });
      if (actionPlan.content !== null || actionPlan.toolRequests.length > 0) {
        this.chatState = applyChatEvent(this.chatState, {
          type: "assistant_message",
          content: actionPlan.content ?? "Vaultseer prepared actions for this request.",
          createdAt: new Date().toISOString(),
          toolRequests: actionPlan.toolRequests
        });
      }
      await this.refresh();

      try {
        const context = await this.buildActiveNoteContext();
        const response = await this.chatAdapter.send({ message, context });
        if (this.isCurrentChatSend(sendScope)) {
          this.chatState = applyChatEvent(this.chatState, {
            type: "assistant_message",
            content: response.content,
            createdAt: new Date().toISOString(),
            toolRequests: response.toolRequests
          });
        }
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

  private renderPendingToolRequests(containerEl: HTMLElement): void {
    if (this.chatState.pendingToolRequests.length === 0) {
      return;
    }

    const pendingEl = containerEl.createDiv({ cls: "vaultseer-studio-chat-tool-requests" });
    pendingEl.createEl("h4", { text: "Requested actions" });

    for (const request of buildCodexPendingToolRequestDisplayItems(this.chatState.pendingToolRequests)) {
      const requestEl = pendingEl.createDiv({ cls: "vaultseer-studio-chat-tool-request" });
      requestEl.createEl("strong", { text: request.tool });
      requestEl.createSpan({
        text: ` - ${request.statusLabel} - ${request.inputPreview}`
      });

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

    for (const command of this.getVaultseerCommands()) {
      menu.addItem((item) => {
        item.setTitle(command.name);
        item.onClick(async () => {
          await command.run();
          await this.refresh();
        });
      });
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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function capitalize(value: string): string {
  return value.length > 0 ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}

function formatOperationType(type: GuardedVaultWriteOperation["type"]): string {
  return type.replace(/_/g, " ");
}

function formatReasoningEffort(value: string): string {
  return value.length > 0 ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}
