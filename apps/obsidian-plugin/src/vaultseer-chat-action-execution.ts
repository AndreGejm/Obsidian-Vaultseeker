import type { CodexChatToolRequest } from "./codex-chat-state";
import { formatCodexToolResultMessage } from "./codex-tool-result-message";
import type { CodexToolResult } from "./codex-tool-dispatcher";
import { isReadOnlyCodexTool } from "./codex-tool-dispatcher";
import type { VaultseerChatActionPlan } from "./vaultseer-chat-action-plan";

export type VaultseerChatActionPlanSplit = {
  autoRunToolRequests: CodexChatToolRequest[];
  approvalToolRequests: CodexChatToolRequest[];
};

export function splitVaultseerChatActionPlan(plan: VaultseerChatActionPlan): VaultseerChatActionPlanSplit {
  return {
    autoRunToolRequests: plan.toolRequests.filter((request) => isReadOnlyCodexTool(request.tool)),
    approvalToolRequests: plan.toolRequests.filter((request) => !isReadOnlyCodexTool(request.tool))
  };
}

export function buildVaultseerActionEvidenceMessage(message: string, results: CodexToolResult[]): string {
  if (results.length === 0) {
    return message;
  }

  return [
    message,
    "",
    "Vaultseer automatic read-only evidence",
    "BEGIN_VAULTSEER_AUTOMATIC_TOOL_RESULTS",
    ...results.map((result) => formatCodexToolResultMessage(result)),
    "END_VAULTSEER_AUTOMATIC_TOOL_RESULTS"
  ].join("\n");
}
