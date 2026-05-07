export type CodexReadOnlyTool =
  | "inspect_current_note"
  | "inspect_index_health"
  | "inspect_current_note_chunks"
  | "search_notes"
  | "semantic_search_notes"
  | "search_sources"
  | "inspect_pdf_source_extraction_queue"
  | "list_vault_images"
  | "read_vault_image"
  | "suggest_current_note_tags"
  | "suggest_current_note_links"
  | "inspect_note_quality"
  | "list_current_note_proposals";
export type CodexCommandTool =
  | "run_vaultseer_command"
  | "rebuild_note_index"
  | "plan_semantic_index"
  | "run_semantic_index_batch"
  | "import_vault_text_source"
  | "plan_pdf_source_extraction"
  | "run_pdf_source_extraction_batch"
  | "plan_source_semantic_index"
  | "run_source_semantic_index_batch";
export type CodexProposalTool = "stage_suggestion" | "review_current_note_proposal";
export type AllowedCodexTool = CodexReadOnlyTool | CodexCommandTool | CodexProposalTool;
export type CodexToolRequestClass = "read-only" | "command" | "proposal";

const READ_ONLY_CODEX_TOOLS = new Set<string>([
  "inspect_current_note",
  "inspect_index_health",
  "inspect_current_note_chunks",
  "search_notes",
  "semantic_search_notes",
  "search_sources",
  "inspect_pdf_source_extraction_queue",
  "list_vault_images",
  "read_vault_image",
  "suggest_current_note_tags",
  "suggest_current_note_links",
  "inspect_note_quality",
  "list_current_note_proposals"
]);
const COMMAND_CODEX_TOOLS = new Set<string>([
  "run_vaultseer_command",
  "rebuild_note_index",
  "plan_semantic_index",
  "run_semantic_index_batch",
  "import_vault_text_source",
  "plan_pdf_source_extraction",
  "run_pdf_source_extraction_batch",
  "plan_source_semantic_index",
  "run_source_semantic_index_batch"
]);
const PROPOSAL_CODEX_TOOLS = new Set<string>(["stage_suggestion", "review_current_note_proposal"]);
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
  inspectIndexHealth?(): Promise<unknown>;
  inspectCurrentNoteChunks?(input: unknown): Promise<unknown>;
  searchNotes(input: unknown): Promise<unknown>;
  semanticSearchNotes?(input: unknown): Promise<unknown>;
  searchSources(input: unknown): Promise<unknown>;
  inspectPdfSourceExtractionQueue?(): Promise<unknown>;
  listVaultImages?(input: unknown): Promise<unknown>;
  readVaultImage?(input: unknown): Promise<unknown>;
  suggestCurrentNoteTags?(): Promise<unknown>;
  suggestCurrentNoteLinks?(): Promise<unknown>;
  inspectNoteQuality?(): Promise<unknown>;
  listCurrentNoteProposals?(): Promise<unknown>;
  runVaultseerCommand?(input: unknown): Promise<unknown>;
  importVaultTextSource?(input: unknown): Promise<unknown>;
  rebuildNoteIndex?(): Promise<unknown>;
  planSemanticIndex?(): Promise<unknown>;
  runSemanticIndexBatch?(): Promise<unknown>;
  planPdfSourceExtraction?(): Promise<unknown>;
  runPdfSourceExtractionBatch?(): Promise<unknown>;
  planSourceSemanticIndex?(): Promise<unknown>;
  runSourceSemanticIndexBatch?(): Promise<unknown>;
  stageSuggestion(input: unknown, context?: CodexProposalToolExecutionContext): Promise<unknown>;
  reviewCurrentNoteProposal?(input: unknown, context?: CodexProposalToolExecutionContext): Promise<unknown>;
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

export function isRunnableCodexTool(tool: string): tool is CodexReadOnlyTool | CodexCommandTool {
  return isReadOnlyCodexTool(tool) || isCommandCodexTool(tool);
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

async function runOptionalAllowedCodexTool(
  tool: AllowedCodexTool,
  implementation: (() => Promise<unknown>) | undefined
): Promise<CodexToolResult> {
  if (implementation === undefined) {
    return {
      ok: false,
      tool,
      message: `Codex tool '${tool}' is not available in this Vaultseer session.`
    };
  }

  return runAllowedCodexTool(tool, implementation);
}

export async function dispatchCodexToolRequest(input: {
  request: CodexToolRequest;
  tools: CodexToolImplementations;
  allowProposalTools?: boolean;
  allowProposalReviewTools?: boolean;
  beforeProposalCommit?: () => boolean | Promise<boolean>;
}): Promise<CodexToolResult> {
  switch (input.request.tool) {
    case "inspect_current_note":
      return runAllowedCodexTool("inspect_current_note", () => input.tools.inspectCurrentNote());
    case "inspect_index_health":
      return runOptionalAllowedCodexTool("inspect_index_health", input.tools.inspectIndexHealth);
    case "inspect_current_note_chunks":
      return runOptionalAllowedCodexTool(
        "inspect_current_note_chunks",
        input.tools.inspectCurrentNoteChunks === undefined
          ? undefined
          : () => input.tools.inspectCurrentNoteChunks!(input.request.input)
      );
    case "search_notes":
      return runAllowedCodexTool("search_notes", () => input.tools.searchNotes(input.request.input));
    case "semantic_search_notes":
      return runOptionalAllowedCodexTool(
        "semantic_search_notes",
        input.tools.semanticSearchNotes === undefined
          ? undefined
          : () => input.tools.semanticSearchNotes!(input.request.input)
      );
    case "search_sources":
      return runAllowedCodexTool("search_sources", () => input.tools.searchSources(input.request.input));
    case "inspect_pdf_source_extraction_queue":
      return runOptionalAllowedCodexTool(
        "inspect_pdf_source_extraction_queue",
        input.tools.inspectPdfSourceExtractionQueue
      );
    case "list_vault_images":
      return runOptionalAllowedCodexTool(
        "list_vault_images",
        input.tools.listVaultImages === undefined ? undefined : () => input.tools.listVaultImages!(input.request.input)
      );
    case "read_vault_image":
      return runOptionalAllowedCodexTool(
        "read_vault_image",
        input.tools.readVaultImage === undefined ? undefined : () => input.tools.readVaultImage!(input.request.input)
      );
    case "suggest_current_note_tags":
      return runOptionalAllowedCodexTool("suggest_current_note_tags", input.tools.suggestCurrentNoteTags);
    case "suggest_current_note_links":
      return runOptionalAllowedCodexTool("suggest_current_note_links", input.tools.suggestCurrentNoteLinks);
    case "inspect_note_quality":
      return runOptionalAllowedCodexTool("inspect_note_quality", input.tools.inspectNoteQuality);
    case "list_current_note_proposals":
      return runOptionalAllowedCodexTool("list_current_note_proposals", input.tools.listCurrentNoteProposals);
    case "rebuild_note_index":
      return runOptionalAllowedCodexTool("rebuild_note_index", input.tools.rebuildNoteIndex);
    case "plan_semantic_index":
      return runOptionalAllowedCodexTool("plan_semantic_index", input.tools.planSemanticIndex);
    case "run_semantic_index_batch":
      return runOptionalAllowedCodexTool("run_semantic_index_batch", input.tools.runSemanticIndexBatch);
    case "import_vault_text_source":
      return runOptionalAllowedCodexTool(
        "import_vault_text_source",
        input.tools.importVaultTextSource === undefined
          ? undefined
          : () => input.tools.importVaultTextSource!(input.request.input)
      );
    case "plan_pdf_source_extraction":
      return runOptionalAllowedCodexTool("plan_pdf_source_extraction", input.tools.planPdfSourceExtraction);
    case "run_pdf_source_extraction_batch":
      return runOptionalAllowedCodexTool(
        "run_pdf_source_extraction_batch",
        input.tools.runPdfSourceExtractionBatch
      );
    case "plan_source_semantic_index":
      return runOptionalAllowedCodexTool("plan_source_semantic_index", input.tools.planSourceSemanticIndex);
    case "run_source_semantic_index_batch":
      return runOptionalAllowedCodexTool(
        "run_source_semantic_index_batch",
        input.tools.runSourceSemanticIndexBatch
      );
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
    case "review_current_note_proposal":
      if (input.allowProposalReviewTools !== true) {
        return {
          ok: false,
          tool: input.request.tool,
          message: "Codex tool 'review_current_note_proposal' requires explicit user approval."
        };
      }

      return runOptionalAllowedCodexTool(
        "review_current_note_proposal",
        input.tools.reviewCurrentNoteProposal === undefined
          ? undefined
          : () =>
              input.beforeProposalCommit
                ? input.tools.reviewCurrentNoteProposal!(input.request.input, {
                    beforeProposalCommit: input.beforeProposalCommit
                  })
                : input.tools.reviewCurrentNoteProposal!(input.request.input)
      );
    default:
      return {
        ok: false,
        tool: input.request.tool,
        message: `Codex tool '${input.request.tool}' is not allowed by Vaultseer.`
      };
  }
}
