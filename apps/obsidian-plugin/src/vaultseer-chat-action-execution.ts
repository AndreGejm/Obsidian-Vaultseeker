import type { CodexChatToolRequest } from "./codex-chat-state";
import { formatCodexToolResultMessage } from "./codex-tool-result-message";
import type { CodexToolResult } from "./codex-tool-dispatcher";
import { isReadOnlyCodexTool } from "./codex-tool-dispatcher";
import type { VaultseerChatActionPlan } from "./vaultseer-chat-action-plan";

export type VaultseerChatActionPlanSplit = {
  autoRunToolRequests: CodexChatToolRequest[];
  autoStageToolRequests: CodexChatToolRequest[];
  approvalToolRequests: CodexChatToolRequest[];
};

export function splitVaultseerChatActionPlan(plan: VaultseerChatActionPlan): VaultseerChatActionPlanSplit {
  return splitCodexToolRequestsForExecution(plan.toolRequests);
}

export function splitCodexToolRequestsForExecution(toolRequests: CodexChatToolRequest[]): VaultseerChatActionPlanSplit {
  return {
    autoRunToolRequests: toolRequests.filter((request) => isReadOnlyCodexTool(request.tool)),
    autoStageToolRequests: toolRequests.filter((request) => request.tool === "stage_suggestion"),
    approvalToolRequests: toolRequests.filter(
      (request) => !isReadOnlyCodexTool(request.tool) && request.tool !== "stage_suggestion"
    )
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

export type VaultseerToolLoopGuardInput = {
  iteration: number;
  maxIterations: number;
  resultCount: number;
};

export function shouldContinueVaultseerToolLoop(input: VaultseerToolLoopGuardInput): boolean {
  return input.resultCount > 0 && input.iteration < input.maxIterations;
}

export function buildVaultseerToolContinuationMessage(results: CodexToolResult[]): string {
  return [
    "Vaultseer completed approved native tool work.",
    "BEGIN_VAULTSEER_TOOL_RESULTS",
    ...results.map((result) => formatCodexToolResultMessage(result)),
    "END_VAULTSEER_TOOL_RESULTS",
    "",
    "Continue the same task using these results. If more Vaultseer work is useful, request the next native tool. If a write is needed, stage a proposal for review instead of claiming you cannot access Vaultseer."
  ].join("\n");
}
