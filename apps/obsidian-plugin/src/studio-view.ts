import { ItemView, Notice, type App, type WorkspaceLeaf } from "obsidian";
import type {
  ActiveNoteContextPacket,
  CodexRuntimeStatus,
  IndexHealth,
  NoteRecord,
  StudioModeId,
  VaultseerStore
} from "@vaultseer/core";
import { applyChatEvent, createEmptyChatState, type CodexChatState } from "./codex-chat-state";
import type { CodexChatAdapter } from "./codex-chat-adapter";
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
    this.registerEvent(this.app.workspace.on("file-open", () => void this.refresh()));
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
      const [health, notes] = await Promise.all([this.store.getHealth(), this.store.getNoteRecords()]);
      this.render(health, notes);
    } catch (error) {
      contentEl.empty();
      contentEl.createEl("h2", { text: "Vaultseer Studio" });
      contentEl.createEl("p", { text: `Could not load Studio state: ${getErrorMessage(error)}` });
      new Notice("Vaultseer Studio could not load.");
    }
  }

  private render(health: IndexHealth, notes: NoteRecord[]): void {
    const activePath = this.getActivePath();
    this.chatState = applyChatEvent(this.chatState, { type: "active_note_changed", activePath });

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
    this.renderSelectedMode(contentEl, state);
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

  private renderSelectedMode(containerEl: HTMLElement, state: PluginStudioState): void {
    const selectedMode = state.modes.find((mode) => mode.selected) ?? state.modes[0];
    const body = containerEl.createDiv({ cls: "vaultseer-studio-body" });

    body.createEl("h3", { text: selectedMode?.label ?? "Note" });
    body.createEl("p", { text: selectedMode?.message ?? "Mode is ready." });

    if (selectedMode?.id === "chat") {
      this.renderChatMode(body);
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
      this.chatState = applyChatEvent(this.chatState, {
        type: "active_note_changed",
        activePath
      });
      this.chatState = applyChatEvent(this.chatState, {
        type: "user_message",
        content: message,
        createdAt: new Date().toISOString()
      });
      await this.refresh();

      try {
        const context = await this.buildActiveNoteContext();
        const response = await this.chatAdapter.send({ message, context });
        if (this.isCurrentChatSend(sendId, activePath)) {
          this.chatState = applyChatEvent(this.chatState, {
            type: "assistant_message",
            content: response.content,
            createdAt: new Date().toISOString()
          });
        }
      } catch (error) {
        if (this.isCurrentChatSend(sendId, activePath)) {
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

  private isCurrentChatSend(sendId: number, activePath: string | null): boolean {
    return this.chatSendId === sendId && this.chatState.activePath === activePath && this.getActivePath() === activePath;
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
