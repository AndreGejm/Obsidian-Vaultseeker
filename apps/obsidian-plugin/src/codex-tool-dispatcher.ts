export type CodexReadOnlyTool = "inspect_current_note" | "search_notes" | "search_sources";
export type CodexCommandTool = "run_vaultseer_command";
export type CodexProposalTool = "stage_suggestion";
export type AllowedCodexTool = CodexReadOnlyTool | CodexCommandTool | CodexProposalTool;
export type CodexToolRequestClass = "read-only" | "command" | "proposal";

const READ_ONLY_CODEX_TOOLS = new Set<string>(["inspect_current_note", "search_notes", "search_sources"]);
const COMMAND_CODEX_TOOLS = new Set<string>(["run_vaultseer_command"]);
const PROPOSAL_CODEX_TOOLS = new Set<string>(["stage_suggestion"]);
const ALLOWED_CODEX_TOOLS = new Set<string>([
  ...READ_ONLY_CODEX_TOOLS,
  ...COMMAND_CODEX_TOOLS,
  ...PROPOSAL_CODEX_TOOLS
]);

export type CodexToolRequest = {
  tool: string;
  input: unknown;
};

export type CodexToolResult =
  | { ok: true; tool: AllowedCodexTool; output: unknown }
  | { ok: false; tool: string; message: string };

export type CodexProposalToolExecutionContext = {
  beforeProposalCommit?: () => boolean | Promise<boolean>;
};

export type CodexToolImplementations = {
  inspectCurrentNote(): Promise<unknown>;
  searchNotes(input: unknown): Promise<unknown>;
  searchSources(input: unknown): Promise<unknown>;
  runVaultseerCommand?(input: unknown): Promise<unknown>;
  stageSuggestion(input: unknown, context?: CodexProposalToolExecutionContext): Promise<unknown>;
};

export function isAllowedCodexTool(tool: string): tool is AllowedCodexTool {
  return ALLOWED_CODEX_TOOLS.has(tool);
}

export function isReadOnlyCodexTool(tool: string): tool is CodexReadOnlyTool {
  return READ_ONLY_CODEX_TOOLS.has(tool);
}

export function isProposalCodexTool(tool: string): tool is CodexProposalTool {
  return PROPOSAL_CODEX_TOOLS.has(tool);
}

export function isCommandCodexTool(tool: string): tool is CodexCommandTool {
  return COMMAND_CODEX_TOOLS.has(tool);
}

export function getCodexToolRequestClass(tool: string): CodexToolRequestClass | null {
  if (isReadOnlyCodexTool(tool)) {
    return "read-only";
  }

  if (isCommandCodexTool(tool)) {
    return "command";
  }

  if (isProposalCodexTool(tool)) {
    return "proposal";
  }

  return null;
}

async function runAllowedCodexTool(tool: AllowedCodexTool, implementation: () => Promise<unknown>): Promise<CodexToolResult> {
  try {
    return { ok: true, tool, output: await implementation() };
  } catch (error) {
    return {
      ok: false,
      tool,
      message: error instanceof Error ? error.message : `Codex tool '${tool}' failed.`
    };
  }
}

export async function dispatchCodexToolRequest(input: {
  request: CodexToolRequest;
  tools: CodexToolImplementations;
  allowProposalTools?: boolean;
  beforeProposalCommit?: () => boolean | Promise<boolean>;
}): Promise<CodexToolResult> {
  switch (input.request.tool) {
    case "inspect_current_note":
      return runAllowedCodexTool("inspect_current_note", () => input.tools.inspectCurrentNote());
    case "search_notes":
      return runAllowedCodexTool("search_notes", () => input.tools.searchNotes(input.request.input));
    case "search_sources":
      return runAllowedCodexTool("search_sources", () => input.tools.searchSources(input.request.input));
    case "run_vaultseer_command":
      {
        const runVaultseerCommand = input.tools.runVaultseerCommand;
        if (runVaultseerCommand === undefined) {
          return {
            ok: false,
            tool: input.request.tool,
            message: "Codex tool 'run_vaultseer_command' is not available in this Vaultseer session."
          };
        }

        return runAllowedCodexTool("run_vaultseer_command", () => runVaultseerCommand(input.request.input));
      }
    case "stage_suggestion":
      if (input.allowProposalTools !== true) {
        return {
          ok: false,
          tool: input.request.tool,
          message: "Codex tool 'stage_suggestion' requires explicit proposal approval."
        };
      }

      return runAllowedCodexTool("stage_suggestion", () =>
        input.beforeProposalCommit
          ? input.tools.stageSuggestion(input.request.input, {
              beforeProposalCommit: input.beforeProposalCommit
            })
          : input.tools.stageSuggestion(input.request.input)
      );
    default:
      return {
        ok: false,
        tool: input.request.tool,
        message: `Codex tool '${input.request.tool}' is not allowed by Vaultseer.`
      };
  }
}
