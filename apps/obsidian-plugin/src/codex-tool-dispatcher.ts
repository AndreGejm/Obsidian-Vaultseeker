export type AllowedCodexTool = "inspect_current_note" | "search_notes" | "search_sources" | "stage_suggestion";

const ALLOWED_CODEX_TOOLS = new Set<string>([
  "inspect_current_note",
  "search_notes",
  "search_sources",
  "stage_suggestion"
]);

export type CodexToolRequest = {
  tool: string;
  input: unknown;
};

export type CodexToolResult =
  | { ok: true; tool: AllowedCodexTool; output: unknown }
  | { ok: false; tool: string; message: string };

export type CodexToolImplementations = {
  inspectCurrentNote(): Promise<unknown>;
  searchNotes(input: unknown): Promise<unknown>;
  searchSources(input: unknown): Promise<unknown>;
  stageSuggestion(input: unknown): Promise<unknown>;
};

export function isAllowedCodexTool(tool: string): tool is AllowedCodexTool {
  return ALLOWED_CODEX_TOOLS.has(tool);
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
}): Promise<CodexToolResult> {
  switch (input.request.tool) {
    case "inspect_current_note":
      return runAllowedCodexTool("inspect_current_note", () => input.tools.inspectCurrentNote());
    case "search_notes":
      return runAllowedCodexTool("search_notes", () => input.tools.searchNotes(input.request.input));
    case "search_sources":
      return runAllowedCodexTool("search_sources", () => input.tools.searchSources(input.request.input));
    case "stage_suggestion":
      return runAllowedCodexTool("stage_suggestion", () => input.tools.stageSuggestion(input.request.input));
    default:
      return {
        ok: false,
        tool: input.request.tool,
        message: `Codex tool '${input.request.tool}' is not allowed by Vaultseer.`
      };
  }
}
