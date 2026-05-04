import type {
  ApprovedScriptDefinition,
  ApprovedScriptHandler,
  ApprovedScriptInputSchema
} from "./approved-script-registry";
import type { CodexToolImplementations } from "./codex-tool-dispatcher";

const EMPTY_SCHEMA: ApprovedScriptInputSchema = {
  type: "object",
  properties: {},
  additionalProperties: false
};

const REWRITE_SCHEMA: ApprovedScriptInputSchema = {
  type: "object",
  properties: {
    markdown: { type: "string" },
    content: { type: "string" },
    reason: { type: "string" }
  },
  additionalProperties: false
};

const TAGS_SCHEMA: ApprovedScriptInputSchema = {
  type: "object",
  properties: {
    tags: { type: "array", items: { type: "string" } },
    suggestions: { type: "array", items: { type: "object" } },
    reason: { type: "string" },
    confidence: { type: "number" }
  },
  additionalProperties: true
};

const LINKS_SCHEMA: ApprovedScriptInputSchema = {
  type: "object",
  properties: {
    links: { type: "array", items: { type: "object" } }
  },
  additionalProperties: true
};

export const BUILT_IN_APPROVED_SCRIPT_DEFINITIONS: ApprovedScriptDefinition[] = [
  {
    id: "review-active-note",
    title: "Review active note",
    description: "Gather current-note context, chunks, tag/link suggestions, quality issues, and staged proposals.",
    scope: "active-note",
    permission: "read-only",
    inputSchema: EMPTY_SCHEMA,
    enabled: true,
    timeoutSeconds: 10
  },
  {
    id: "stage-active-note-rewrite",
    title: "Stage active-note rewrite",
    description: "Stage a full Markdown rewrite proposal for the active note through guarded review.",
    scope: "active-note",
    permission: "active-note-proposal",
    inputSchema: REWRITE_SCHEMA,
    enabled: true,
    timeoutSeconds: 10
  },
  {
    id: "stage-active-note-tags",
    title: "Stage active-note tags",
    description: "Stage tag suggestions for the active note through guarded review.",
    scope: "active-note",
    permission: "active-note-proposal",
    inputSchema: TAGS_SCHEMA,
    enabled: true,
    timeoutSeconds: 10
  },
  {
    id: "stage-active-note-links",
    title: "Stage active-note links",
    description: "Stage internal link suggestions for the active note through guarded review.",
    scope: "active-note",
    permission: "active-note-proposal",
    inputSchema: LINKS_SCHEMA,
    enabled: true,
    timeoutSeconds: 10
  }
];

export function mergeApprovedScriptDefinitions(configured: ApprovedScriptDefinition[]): ApprovedScriptDefinition[] {
  const definitions = new Map<string, ApprovedScriptDefinition>();
  for (const definition of BUILT_IN_APPROVED_SCRIPT_DEFINITIONS) {
    definitions.set(definition.id, cloneDefinition(definition));
  }

  for (const definition of configured) {
    const existing = definitions.get(definition.id);
    definitions.set(definition.id, existing ? { ...existing, ...cloneDefinition(definition) } : cloneDefinition(definition));
  }

  return [...definitions.values()];
}

export function createBuiltInApprovedScriptHandlers(
  getTools: () => CodexToolImplementations
): Record<string, ApprovedScriptHandler> {
  return {
    "review-active-note": async () => {
      const tools = getTools();
      const [currentNote, chunks, quality, tags, links, proposals] = await Promise.all([
        tools.inspectCurrentNote(),
        tools.inspectCurrentNoteChunks?.({ limit: 8 }) ?? null,
        tools.inspectNoteQuality?.() ?? null,
        tools.suggestCurrentNoteTags?.() ?? null,
        tools.suggestCurrentNoteLinks?.() ?? null,
        tools.listCurrentNoteProposals?.() ?? null
      ]);

      return {
        status: "completed",
        scriptId: "review-active-note",
        output: {
          currentNote,
          chunks,
          quality,
          tags,
          links,
          proposals
        }
      };
    },
    "stage-active-note-rewrite": async ({ input }) => {
      const tools = getTools();
      const request = parseRewriteInput(input);
      return {
        status: "completed",
        scriptId: "stage-active-note-rewrite",
        output: await tools.stageSuggestion({
          kind: "rewrite",
          markdown: request.markdown,
          ...(request.reason === null ? {} : { reason: request.reason })
        })
      };
    },
    "stage-active-note-tags": async ({ input }) => {
      const tools = getTools();
      return {
        status: "completed",
        scriptId: "stage-active-note-tags",
        output: await tools.stageSuggestion({
          kind: "tag",
          ...parseObjectInput(input, "Codex stage-active-note-tags input must be an object.")
        })
      };
    },
    "stage-active-note-links": async ({ input }) => {
      const tools = getTools();
      return {
        status: "completed",
        scriptId: "stage-active-note-links",
        output: await tools.stageSuggestion({
          kind: "link",
          ...parseObjectInput(input, "Codex stage-active-note-links input must be an object.")
        })
      };
    }
  };
}

function parseRewriteInput(input: unknown): { markdown: string; reason: string | null } {
  const record = parseObjectInput(input, "Codex stage-active-note-rewrite input must be an object.");
  const content = stringProperty(record, "markdown") ?? stringProperty(record, "content");
  if (content === null || content.trim().length === 0) {
    throw new Error("Codex stage-active-note-rewrite input must include nonblank markdown.");
  }

  return {
    markdown: content,
    reason: stringProperty(record, "reason")?.trim() || null
  };
}

function parseObjectInput(input: unknown, message: string): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error(message);
  }
  return input as Record<string, unknown>;
}

function stringProperty(value: Record<string, unknown>, key: string): string | null {
  const property = value[key];
  return typeof property === "string" ? property : null;
}

function cloneDefinition(definition: ApprovedScriptDefinition): ApprovedScriptDefinition {
  return {
    ...definition,
    inputSchema: {
      ...definition.inputSchema,
      properties: { ...(definition.inputSchema.properties ?? {}) },
      ...(definition.inputSchema.required ? { required: [...definition.inputSchema.required] } : {})
    }
  };
}
