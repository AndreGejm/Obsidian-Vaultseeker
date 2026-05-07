import type { CodexChatState } from "./codex-chat-state";
import type { StudioChatContextBarState, StudioChatShellState } from "./studio-chat-shell-state";
import { renderStudioChatMessageBody } from "./studio-chat-message-view";

export type StudioChatPanelInput = {
  shellState: StudioChatShellState;
  contextBar: StudioChatContextBarState;
  chatState: CodexChatState;
  activeNotePath: string | null;
  chatSending: boolean;
  onTools: (event: MouseEvent) => void;
  onReset: () => Promise<void>;
  onContextBarAction: () => Promise<void>;
  renderMarkdown: (content: string, bodyEl: HTMLElement, sourcePath: string) => Promise<void>;
  onRenderError: (error: unknown) => void;
};

export function renderStudioChatPanel(containerEl: HTMLElement, input: StudioChatPanelInput): void {
  renderChatHeader(containerEl, input);
  renderContextBar(containerEl, input);
  renderMessages(containerEl, input);
}

function renderChatHeader(containerEl: HTMLElement, input: StudioChatPanelInput): void {
  const headerEl = containerEl.createDiv({ cls: "vaultseer-codex-header" });
  const titleEl = headerEl.createDiv({ cls: "vaultseer-codex-title" });
  titleEl.createEl("strong", { text: input.shellState.title });
  titleEl.createEl("span", { text: input.shellState.activeNoteTitle, cls: "vaultseer-codex-subtitle" });

  const controlsEl = headerEl.createDiv({ cls: "vaultseer-codex-controls" });
  const toolsButton = controlsEl.createEl("button", {
    text: "Tools",
    attr: {
      type: "button",
      "aria-label": "Open Vaultseer Studio tools"
    },
    cls: "vaultseer-codex-ghost-button"
  });
  toolsButton.disabled = input.chatSending;
  toolsButton.addEventListener("click", input.onTools);
  controlsEl.createEl("span", { text: input.shellState.profileLabel, cls: "vaultseer-codex-profile" });
  controlsEl.createEl("span", { text: input.shellState.runtimeLabel, cls: "vaultseer-codex-runtime" });
  const resetButton = controlsEl.createEl("button", {
    text: input.shellState.resetLabel,
    title: input.shellState.resetTitle,
    attr: {
      type: "button"
    },
    cls: "vaultseer-codex-ghost-button"
  });
  resetButton.disabled = input.chatSending;
  resetButton.addEventListener("click", () => {
    void input.onReset();
  });
}

function renderContextBar(containerEl: HTMLElement, input: StudioChatPanelInput): void {
  const contextEl = containerEl.createDiv({
    cls: `vaultseer-codex-context-bar vaultseer-codex-context-${input.contextBar.tone}`
  });
  contextEl.createEl("strong", { text: input.contextBar.title });
  contextEl.createEl("span", { text: input.contextBar.detail });
  if (input.contextBar.action === null) {
    return;
  }

  const actionButton = contextEl.createEl("button", {
    text: input.contextBar.action.label,
    title: input.contextBar.action.title,
    attr: {
      type: "button"
    },
    cls: "vaultseer-codex-context-action"
  });
  actionButton.disabled = input.chatSending;
  actionButton.addEventListener("click", () => {
    void input.onContextBarAction();
  });
}

function renderMessages(containerEl: HTMLElement, input: StudioChatPanelInput): void {
  const messagesEl = containerEl.createDiv({ cls: "vaultseer-codex-messages" });

  if (input.chatState.messages.length === 0) {
    messagesEl.createEl("p", { text: input.shellState.emptyStateText, cls: "vaultseer-codex-empty" });
    return;
  }

  for (const message of input.chatState.messages) {
    const messageEl = messagesEl.createDiv({ cls: `vaultseer-codex-message vaultseer-chat-${message.role}` });
    messageEl.createEl("strong", { text: capitalize(message.role) });
    renderStudioChatMessageBody(messageEl, {
      content: message.content,
      renderMarkdown: (content, bodyEl) =>
        input.renderMarkdown(content, bodyEl, input.activeNotePath ?? ""),
      onRenderError: input.onRenderError
    });
  }
}

function capitalize(value: string): string {
  return value.length > 0 ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}
