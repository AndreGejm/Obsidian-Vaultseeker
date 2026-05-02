export type AllowedCodexTool = "inspect_current_note" | "search_notes" | "search_sources" | "stage_suggestion";

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

export async function dispatchCodexToolRequest(input: {
  request: CodexToolRequest;
  tools: CodexToolImplementations;
}): Promise<CodexToolResult> {
  switch (input.request.tool) {
    case "inspect_current_note":
      return { ok: true, tool: "inspect_current_note", output: await input.tools.inspectCurrentNote() };
    case "search_notes":
      return { ok: true, tool: "search_notes", output: await input.tools.searchNotes(input.request.input) };
    case "search_sources":
      return { ok: true, tool: "search_sources", output: await input.tools.searchSources(input.request.input) };
    case "stage_suggestion":
      return { ok: true, tool: "stage_suggestion", output: await input.tools.stageSuggestion(input.request.input) };
    default:
      return {
        ok: false,
        tool: input.request.tool,
        message: `Codex tool '${input.request.tool}' is not allowed by Vaultseer.`
      };
  }
}
