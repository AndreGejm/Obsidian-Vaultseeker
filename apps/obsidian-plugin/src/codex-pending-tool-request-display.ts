import {
  formatCodexToolRequestInputPreview,
  type CodexPendingToolRequest
} from "./codex-chat-state";
import { isProposalCodexTool, isRunnableCodexTool } from "./codex-tool-dispatcher";
import { VAULTSEER_STUDIO_COMMAND_DEFINITIONS } from "./studio-command-catalog";

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
  title: string;
  description: string;
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
    if (isRunnableCodexTool(request.tool) && request.executionStatus === undefined) {
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

    const description = describeToolRequest(request);

    return {
      displayId: request.displayId,
      title: description.title,
      description: description.description,
      tool: request.tool,
      inputPreview: formatCodexToolRequestInputPreview(request.input),
      statusLabel: getStatusLabel(request),
      controls
    };
  });
}

function describeToolRequest(request: CodexPendingToolRequest): { title: string; description: string } {
  switch (request.tool) {
    case "inspect_current_note":
      return {
        title: "Inspect current note",
        description: "Reads the active note, tags, links, and related context before Codex answers."
      };
    case "inspect_index_health":
      return {
        title: "Inspect index health",
        description: "Checks Vaultseer note, chunk, vector, source, and queue counts."
      };
    case "inspect_current_note_chunks":
      return {
        title: "Inspect current-note chunks",
        description: "Shows how Vaultseer currently chunks the active note for search and context."
      };
    case "search_notes":
      return {
        title: "Search notes",
        description: "Searches the read-only Vaultseer note index before Codex answers."
      };
    case "semantic_search_notes":
      return {
        title: "Semantic search notes",
        description: "Searches embedded note chunks for similar or adjacent topics."
      };
    case "search_sources":
      return {
        title: "Search sources",
        description: "Searches extracted source workspaces before Codex answers."
      };
    case "suggest_current_note_tags":
      return {
        title: "Suggest current-note tags",
        description: "Drafts deterministic tag suggestions from Vaultseer note relationships."
      };
    case "suggest_current_note_links":
      return {
        title: "Suggest current-note links",
        description: "Drafts deterministic internal-link suggestions from unresolved links and note matches."
      };
    case "inspect_note_quality":
      return {
        title: "Inspect note quality",
        description: "Checks the active note for narrow metadata and link quality issues."
      };
    case "rebuild_note_index":
      return {
        title: "Rebuild note index",
        description: "Rebuilds Vaultseer read-only note records, chunks, and lexical search data."
      };
    case "plan_semantic_index":
      return {
        title: "Plan semantic indexing",
        description: "Plans embedding jobs for note chunks so semantic search can use current vectors."
      };
    case "run_semantic_index_batch":
      return {
        title: "Run semantic index batch",
        description: "Runs one approved embedding batch for queued note chunks."
      };
    case "stage_suggestion":
      return {
        title: "Stage suggestion",
        description: "Stores a proposed tag, link, or note rewrite for review before anything is written."
      };
    case "run_vaultseer_command":
      return {
        title: getVaultseerCommandName(request.input),
        description: "Queues a Vaultseer command. Review it here, then press Run when you want it executed."
      };
    default:
      return {
        title: request.tool,
        description: "Review this requested action before allowing it."
      };
  }
}

function getVaultseerCommandName(input: unknown): string {
  if (!isObject(input) || typeof input.commandId !== "string") {
    return "Vaultseer command";
  }

  return (
    VAULTSEER_STUDIO_COMMAND_DEFINITIONS.find((command) => command.id === input.commandId)?.name ??
    "Vaultseer command"
  );
}

function isObject(value: unknown): value is { commandId?: unknown } {
  return typeof value === "object" && value !== null;
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
