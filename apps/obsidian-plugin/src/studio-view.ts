import { ItemView, Notice, type App, type WorkspaceLeaf } from "obsidian";
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
  createEmptyChatState,
  isCurrentCodexChatSend,
  type CodexChatSendScope,
  type CodexChatState
} from "./codex-chat-state";
import type { CodexChatAdapter } from "./codex-chat-adapter";
import { buildCodexPendingToolRequestDisplayItems } from "./codex-pending-tool-request-display";
import { buildInlineApprovalState } from "./inline-approval-state";
import { buildPluginStudioState, type PluginStudioState } from "./studio-state";

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
    private readonly buildActiveNoteContext: () => Promise<ActiveNoteContextPacket>,
    private readonly chatAdapter: CodexChatAdapter
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

    body.createEl("h3", { text: selectedMode?.label ?? "Note" });
    body.createEl("p", { text: selectedMode?.message ?? "Mode is ready." });

    if (selectedMode?.id === "note") {
      this.renderNoteMode(body, state, writeOperations);
    }

    if (selectedMode?.id === "chat") {
      this.renderChatMode(body);
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

  private renderChatMode(containerEl: HTMLElement): void {
    const messagesEl = containerEl.createDiv({ cls: "vaultseer-studio-chat-messages" });

    if (this.chatState.messages.length === 0) {
      messagesEl.createEl("p", { text: "No chat messages yet." });
    } else {
      for (const message of this.chatState.messages) {
        const messageEl = messagesEl.createDiv({ cls: `vaultseer-studio-chat-message vaultseer-chat-${message.role}` });
        messageEl.createEl("strong", { text: `${capitalize(message.role)}: ` });
        messageEl.createSpan({ text: message.content });
      }
    }

    this.renderPendingToolRequests(containerEl);

    if (this.chatState.error) {
      containerEl.createEl("p", { text: this.chatState.error, cls: "vaultseer-studio-chat-error" });
    }

    const form = containerEl.createEl("form", { cls: "vaultseer-studio-chat-form" });
    const input = form.createEl("textarea", {
      attr: {
        rows: "3",
        placeholder: "Ask about the active note"
      }
    });
    const sendButton = form.createEl("button", {
      text: this.chatSending ? "Sending..." : "Send",
      attr: {
        type: "submit"
      }
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
        const dismissButton = requestEl.createEl("button", {
          text: control.label,
          attr: {
            type: "button"
          }
        });
        dismissButton.addEventListener("click", async () => {
          this.chatState = applyChatEvent(this.chatState, {
            type: "dismiss_tool_request",
            displayId: control.displayId
          });
          await this.refresh();
        });
      }
    }
  }

  private isCurrentChatSend(scope: CodexChatSendScope): boolean {
    return isCurrentCodexChatSend(this.chatState, this.getActivePath(), scope, this.chatSendId);
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
