import {
  dispatchCodexToolRequest,
  type CodexProposalToolExecutionContext,
  type CodexToolImplementations,
  type CodexToolResult
} from "./codex-tool-dispatcher";
import {
  listVaultseerAgentToolDefinitions,
  type VaultseerAgentToolDefinition
} from "./vaultseer-agent-tool-definitions";

export {
  listAutonomousVaultseerAgentToolDefinitions,
  listVaultseerAgentToolDefinitions,
  toOpenAiFunctionTools,
  type JsonSchemaObject,
  type OpenAiFunctionToolDefinition,
  type VaultseerAgentToolDefinition,
  type VaultseerAgentToolSafety
} from "./vaultseer-agent-tool-definitions";

export type VaultseerAgentToolRegistry = {
  definitions: VaultseerAgentToolDefinition[];
  execute(
    tool: string,
    input: unknown,
    options?: {
      allowProposalTools?: boolean;
      allowProposalReviewTools?: boolean;
      beforeProposalCommit?: CodexProposalToolExecutionContext["beforeProposalCommit"];
    }
  ): Promise<CodexToolResult>;
};

export function createVaultseerAgentToolRegistry(input: {
  tools: CodexToolImplementations;
}): VaultseerAgentToolRegistry {
  return {
    definitions: listVaultseerAgentToolDefinitions(),
    execute: (tool, toolInput, options = {}) => {
      const dispatchInput: Parameters<typeof dispatchCodexToolRequest>[0] = {
        request: { tool, input: toolInput },
        tools: input.tools
      };
      if (options.allowProposalTools !== undefined) {
        dispatchInput.allowProposalTools = options.allowProposalTools;
      }
      if (options.allowProposalReviewTools !== undefined) {
        dispatchInput.allowProposalReviewTools = options.allowProposalReviewTools;
      }
      if (options.beforeProposalCommit !== undefined) {
        dispatchInput.beforeProposalCommit = options.beforeProposalCommit;
      }
      return dispatchCodexToolRequest(dispatchInput);
    }
  };
}
