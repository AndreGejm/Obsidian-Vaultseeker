import type { StudioChatComposerState, StudioChatShellState } from "./studio-chat-shell-state";

export type StudioCommandPanelInput = {
  shellState: Pick<StudioChatShellState, "modeLabel" | "modelLabel" | "reasoningLabel">;
  composerState: Pick<StudioChatComposerState, "sendLabel" | "sendDisabled">;
  chatSending: boolean;
  onCommandMenu: (event: MouseEvent) => void;
  onModelMenu: (event: MouseEvent) => void;
  onReasoningMenu: (event: MouseEvent) => void;
};

export function renderStudioCommandPanel(containerEl: HTMLElement, input: StudioCommandPanelInput): void {
  const commandButton = containerEl.createEl("button", {
    text: input.shellState.modeLabel,
    attr: {
      type: "button",
      "aria-label": "Open Vaultseer commands"
    },
    cls: "vaultseer-codex-select-button"
  });
  commandButton.disabled = input.chatSending;
  commandButton.addEventListener("click", input.onCommandMenu);

  const modelButton = containerEl.createEl("button", {
    text: input.shellState.modelLabel,
    attr: {
      type: "button",
      "aria-label": "Change Codex model"
    },
    cls: "vaultseer-codex-select-button"
  });
  modelButton.disabled = input.chatSending;
  modelButton.addEventListener("click", input.onModelMenu);

  const reasoningButton = containerEl.createEl("button", {
    text: input.shellState.reasoningLabel,
    attr: {
      type: "button",
      "aria-label": "Change Codex reasoning effort"
    },
    cls: "vaultseer-codex-select-button"
  });
  reasoningButton.disabled = input.chatSending;
  reasoningButton.addEventListener("click", input.onReasoningMenu);

  const sendButton = containerEl.createEl("button", {
    text: input.composerState.sendLabel,
    attr: {
      type: "submit",
      "aria-label": "Send message"
    },
    cls: "vaultseer-codex-send-button"
  });
  sendButton.disabled = input.composerState.sendDisabled;
}
