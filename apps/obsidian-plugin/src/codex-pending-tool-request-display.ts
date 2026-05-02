import {
  formatCodexToolRequestInputPreview,
  type CodexPendingToolRequest
} from "./codex-chat-state";
import { isProposalCodexTool, isReadOnlyCodexTool } from "./codex-tool-dispatcher";

export type CodexPendingToolRequestDisplayControl =
  | {
      type: "run";
      label: "Run";
      displayId: string;
    }
  | {
      type: "stage";
      label: "Stage";
      displayId: string;
    }
  | {
      type: "dismiss";
      label: "Dismiss";
      displayId: string;
    };

export type CodexPendingToolRequestDisplayItem = {
  displayId: string;
  tool: string;
  inputPreview: string;
  statusLabel: "Pending review" | "Running" | "Completed" | "Failed";
  controls: CodexPendingToolRequestDisplayControl[];
};

export function buildCodexPendingToolRequestDisplayItems(
  requests: CodexPendingToolRequest[]
): CodexPendingToolRequestDisplayItem[] {
  return requests.map((request) => {
    const controls: CodexPendingToolRequestDisplayControl[] = [];
    if (isReadOnlyCodexTool(request.tool) && request.executionStatus === undefined) {
      controls.push({
        type: "run",
        label: "Run",
        displayId: request.displayId
      });
    }
    if (isProposalCodexTool(request.tool) && request.executionStatus === undefined) {
      controls.push({
        type: "stage",
        label: "Stage",
        displayId: request.displayId
      });
    }
    controls.push({
      type: "dismiss",
      label: "Dismiss",
      displayId: request.displayId
    });

    return {
      displayId: request.displayId,
      tool: request.tool,
      inputPreview: formatCodexToolRequestInputPreview(request.input),
      statusLabel: getStatusLabel(request),
      controls
    };
  });
}

function getStatusLabel(request: CodexPendingToolRequest): CodexPendingToolRequestDisplayItem["statusLabel"] {
  switch (request.executionStatus) {
    case "running":
      return "Running";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    default:
      return "Pending review";
  }
}
