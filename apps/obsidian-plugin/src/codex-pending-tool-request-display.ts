import {
  formatCodexToolRequestInputPreview,
  type CodexPendingToolRequest
} from "./codex-chat-state";

export type CodexPendingToolRequestDisplayControl = {
  type: "dismiss";
  label: "Dismiss";
  displayId: string;
};

export type CodexPendingToolRequestDisplayItem = {
  displayId: string;
  tool: string;
  inputPreview: string;
  statusLabel: "Pending review";
  controls: CodexPendingToolRequestDisplayControl[];
};

export function buildCodexPendingToolRequestDisplayItems(
  requests: CodexPendingToolRequest[]
): CodexPendingToolRequestDisplayItem[] {
  return requests.map((request) => ({
    displayId: request.displayId,
    tool: request.tool,
    inputPreview: formatCodexToolRequestInputPreview(request.input),
    statusLabel: "Pending review",
    controls: [
      {
        type: "dismiss",
        label: "Dismiss",
        displayId: request.displayId
      }
    ]
  }));
}
