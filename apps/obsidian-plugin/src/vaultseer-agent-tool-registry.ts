import {
  dispatchCodexToolRequest,
  type AllowedCodexTool,
  type CodexProposalToolExecutionContext,
  type CodexToolImplementations,
  type CodexToolRequestClass,
  type CodexToolResult
} from "./codex-tool-dispatcher";

export type VaultseerAgentToolSafety = "read" | "user-approved-command" | "active-note-proposal" | "approved-script";

export type JsonSchemaObject = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

export type VaultseerAgentToolDefinition = {
  id: AllowedCodexTool;
  title: string;
  description: string;
  safety: VaultseerAgentToolSafety;
  requestClass: CodexToolRequestClass;
  inputSchema: JsonSchemaObject;
};

export type OpenAiFunctionToolDefinition = {
  type: "function";
  name: string;
  description: string;
  parameters: JsonSchemaObject;
};

export type VaultseerAgentToolRegistry = {
  definitions: VaultseerAgentToolDefinition[];
  execute(
    tool: string,
    input: unknown,
    options?: {
      allowProposalTools?: boolean;
      beforeProposalCommit?: CodexProposalToolExecutionContext["beforeProposalCommit"];
    }
  ): Promise<CodexToolResult>;
};

const EMPTY_INPUT_SCHEMA: JsonSchemaObject = {
  type: "object",
  properties: {},
  additionalProperties: false
};

const LIMIT_ONLY_SCHEMA: JsonSchemaObject = {
  type: "object",
  properties: {
    limit: {
      type: "number",
      description: "Optional maximum number of items to return."
    }
  },
  additionalProperties: false
};

const SEARCH_SCHEMA: JsonSchemaObject = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description: "Search query text."
    },
    limit: {
      type: "number",
      description: "Optional maximum number of results to return."
    }
  },
  required: ["query"],
  additionalProperties: false
};

const RUN_COMMAND_SCHEMA: JsonSchemaObject = {
  type: "object",
  properties: {
    commandId: {
      type: "string",
      description: "Vaultseer Studio command id, such as rebuild-index or open-write-review-queue."
    }
  },
  required: ["commandId"],
  additionalProperties: false
};

const RUN_APPROVED_SCRIPT_SCHEMA: JsonSchemaObject = {
  type: "object",
  properties: {
    scriptId: {
      type: "string",
      description: "Approved Vaultseer script id from list_approved_scripts."
    },
    input: {
      type: "object",
      description: "JSON input for the approved script. It is validated by the script manifest and trusted handler."
    }
  },
  required: ["scriptId"],
  additionalProperties: false
};

const STAGE_SUGGESTION_SCHEMA: JsonSchemaObject = {
  type: "object",
  properties: {
    kind: {
      type: "string",
      enum: ["tag", "link", "rewrite"],
      description: "Proposal kind to stage for current-note review."
    },
    targetPath: {
      type: "string",
      description: "Optional active note path. If supplied, it must match the current note."
    },
    tags: {
      type: "array",
      items: { type: "string" },
      description: "Tags to propose when kind is tag."
    },
    links: {
      type: "array",
      items: { type: "object" },
      description: "Link replacement suggestions when kind is link."
    },
    markdown: {
      type: "string",
      description: "Full replacement Markdown when kind is rewrite."
    },
    content: {
      type: "string",
      description: "Alias for markdown when kind is rewrite."
    },
    reason: {
      type: "string",
      description: "Short reason shown to the user in the review surface."
    }
  },
  required: ["kind"],
  additionalProperties: true
};

const REVIEW_CURRENT_NOTE_PROPOSAL_SCHEMA: JsonSchemaObject = {
  type: "object",
  properties: {
    operationId: {
      type: "string",
      description: "Optional current-note proposal id. If omitted, Vaultseer uses the first active proposal for the current note."
    },
    decision: {
      type: "string",
      enum: ["approved", "deferred", "rejected"],
      description: "Review decision to record. Defaults to approved when apply is true."
    },
    apply: {
      type: "boolean",
      description: "When true, apply the approved current-note proposal after recording approval."
    }
  },
  additionalProperties: false
};

const VAULTSEER_AGENT_TOOL_DEFINITIONS: VaultseerAgentToolDefinition[] = [
  readTool("inspect_current_note", "Inspect current note", "Inspect the active note, chunks, links, tags, and related context.", EMPTY_INPUT_SCHEMA),
  readTool("inspect_index_health", "Inspect index health", "Inspect stored note, chunk, vector, source, suggestion, and queue counts.", EMPTY_INPUT_SCHEMA),
  readTool("inspect_current_note_chunks", "Inspect current note chunks", "Inspect active note chunk boundaries.", LIMIT_ONLY_SCHEMA),
  readTool("search_notes", "Search notes", "Search indexed vault notes using Vaultseer lexical and semantic search.", SEARCH_SCHEMA),
  readTool("semantic_search_notes", "Semantic search notes", "Search indexed vault notes by similar meaning.", SEARCH_SCHEMA),
  readTool("search_sources", "Search sources", "Search extracted or imported source workspaces.", SEARCH_SCHEMA),
  readTool("suggest_current_note_tags", "Suggest current note tags", "Draft deterministic tag suggestions for the active note.", EMPTY_INPUT_SCHEMA),
  readTool("suggest_current_note_links", "Suggest current note links", "Draft deterministic internal-link suggestions for the active note.", EMPTY_INPUT_SCHEMA),
  readTool("inspect_note_quality", "Inspect note quality", "Inspect narrow quality issues such as missing tags, duplicate aliases, malformed tags, and broken links.", EMPTY_INPUT_SCHEMA),
  readTool("list_current_note_proposals", "List current-note proposals", "List staged guarded-write proposals that target the active note.", EMPTY_INPUT_SCHEMA),
  readTool("list_approved_scripts", "List approved scripts", "List user-approved note-management scripts available to Vaultseer.", EMPTY_INPUT_SCHEMA),
  commandTool("rebuild_note_index", "Rebuild note index", "Request a read-only vault index rebuild.", EMPTY_INPUT_SCHEMA),
  commandTool("plan_semantic_index", "Plan semantic index", "Request semantic indexing queue planning.", EMPTY_INPUT_SCHEMA),
  commandTool("run_semantic_index_batch", "Run semantic index batch", "Request one semantic indexing batch.", EMPTY_INPUT_SCHEMA),
  commandTool("run_vaultseer_command", "Run Vaultseer command", "Request a named Vaultseer Studio command by commandId.", RUN_COMMAND_SCHEMA),
  approvedScriptTool("run_approved_script", "Run approved script", "Run a user-approved note-management script by script id.", RUN_APPROVED_SCRIPT_SCHEMA),
  proposalTool("stage_suggestion", "Stage suggestion", "Stage tag, link, or full current-note rewrite proposals for user review.", STAGE_SUGGESTION_SCHEMA),
  proposalTool("review_current_note_proposal", "Review current-note proposal", "Approve, defer, reject, or apply a staged proposal for the active note.", REVIEW_CURRENT_NOTE_PROPOSAL_SCHEMA)
];

export function listVaultseerAgentToolDefinitions(): VaultseerAgentToolDefinition[] {
  return VAULTSEER_AGENT_TOOL_DEFINITIONS.map((definition) => ({ ...definition }));
}

export function toOpenAiFunctionTools(
  definitions: VaultseerAgentToolDefinition[] = listVaultseerAgentToolDefinitions()
): OpenAiFunctionToolDefinition[] {
  return definitions.map((definition) => ({
    type: "function",
    name: definition.id,
    description: definition.description,
    parameters: definition.inputSchema
  }));
}

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
      if (options.beforeProposalCommit !== undefined) {
        dispatchInput.beforeProposalCommit = options.beforeProposalCommit;
      }
      return dispatchCodexToolRequest(dispatchInput);
    }
  };
}

function readTool(
  id: AllowedCodexTool,
  title: string,
  description: string,
  inputSchema: JsonSchemaObject
): VaultseerAgentToolDefinition {
  return {
    id,
    title,
    description,
    safety: "read",
    requestClass: "read-only",
    inputSchema
  };
}

function commandTool(
  id: AllowedCodexTool,
  title: string,
  description: string,
  inputSchema: JsonSchemaObject
): VaultseerAgentToolDefinition {
  return {
    id,
    title,
    description,
    safety: "user-approved-command",
    requestClass: "command",
    inputSchema
  };
}

function approvedScriptTool(
  id: AllowedCodexTool,
  title: string,
  description: string,
  inputSchema: JsonSchemaObject
): VaultseerAgentToolDefinition {
  return {
    id,
    title,
    description,
    safety: "approved-script",
    requestClass: "command",
    inputSchema
  };
}

function proposalTool(
  id: AllowedCodexTool,
  title: string,
  description: string,
  inputSchema: JsonSchemaObject
): VaultseerAgentToolDefinition {
  return {
    id,
    title,
    description,
    safety: "active-note-proposal",
    requestClass: "proposal",
    inputSchema
  };
}
