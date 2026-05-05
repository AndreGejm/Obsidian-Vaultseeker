import {
  buildCodexPendingToolRequestDisplayItems,
  type CodexPendingToolRequestDisplayControl
} from "./codex-pending-tool-request-display";
import type { CodexPendingToolRequest } from "./codex-chat-state";

export type StudioPendingToolRequestControlType = CodexPendingToolRequestDisplayControl["type"];

export function renderStudioPendingToolRequests(
  containerEl: HTMLElement,
  requests: CodexPendingToolRequest[],
  onControl: (displayId: string, controlType: StudioPendingToolRequestControlType) => Promise<void>
): void {
  if (requests.length === 0) {
    return;
  }

  const pendingEl = containerEl.createDiv({ cls: "vaultseer-studio-chat-tool-requests" });
  pendingEl.createEl("h4", { text: "Requested actions" });

  for (const request of buildCodexPendingToolRequestDisplayItems(requests)) {
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
        await onControl(control.displayId, control.type);
      });
    }
  }
}
