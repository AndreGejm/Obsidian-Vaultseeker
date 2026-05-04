export type ApprovedScriptPermission = "read-only" | "active-note-proposal" | "manual-approval";

export type ApprovedScriptScope = "active-note" | "vault-read" | "source-workspace";

export type ApprovedScriptInputSchema = {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

export type ApprovedScriptDefinition = {
  id: string;
  title: string;
  description: string;
  scope: ApprovedScriptScope;
  permission: ApprovedScriptPermission;
  inputSchema: ApprovedScriptInputSchema;
  enabled: boolean;
  timeoutSeconds: number;
};

export type ApprovedScriptRunRequest = {
  scriptId: string;
  input?: unknown;
};

export type ApprovedScriptRunResult = {
  status: "completed";
  scriptId: string;
  output: unknown;
};

export type ApprovedScriptHandlerInput = {
  definition: ApprovedScriptDefinition;
  input: unknown;
};

export type ApprovedScriptHandler = (input: ApprovedScriptHandlerInput) => Promise<ApprovedScriptRunResult>;

export type ApprovedScriptRegistry = {
  list(): ApprovedScriptDefinition[];
  run(request: ApprovedScriptRunRequest): Promise<ApprovedScriptRunResult>;
};

export class ApprovedScriptRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApprovedScriptRegistryError";
  }
}

const DEFAULT_SCHEMA: ApprovedScriptInputSchema = {
  type: "object",
  properties: {},
  additionalProperties: false
};

const APPROVED_SCRIPT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const EXECUTABLE_SHAPED_KEYS = new Set([
  "arg",
  "args",
  "bin",
  "cmd",
  "command",
  "entry",
  "entrypoint",
  "exec",
  "executable",
  "file",
  "path",
  "script",
  "shell"
]);

const ALLOWED_DEFINITION_KEYS = new Set([
  "id",
  "title",
  "description",
  "scope",
  "permission",
  "inputSchema",
  "enabled",
  "timeoutSeconds"
]);

export function normalizeApprovedScriptDefinitions(raw: unknown): ApprovedScriptDefinition[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const definitions: ApprovedScriptDefinition[] = [];
  for (const item of raw) {
    const definition = normalizeApprovedScriptDefinition(item);
    if (definition !== null && !definitions.some((existing) => existing.id === definition.id)) {
      definitions.push(definition);
    }
  }
  return definitions;
}

export function createApprovedScriptRegistry(input: {
  definitions: ApprovedScriptDefinition[];
  handlers: Record<string, ApprovedScriptHandler | undefined>;
}): ApprovedScriptRegistry {
  const definitionsById = new Map(input.definitions.map((definition) => [definition.id, definition]));

  return {
    list: () => input.definitions.filter((definition) => definition.enabled).map(cloneDefinition),
    run: async (request) => {
      const definition = definitionsById.get(request.scriptId);
      if (definition === undefined || !definition.enabled) {
        throw new ApprovedScriptRegistryError(`Approved script '${request.scriptId}' is not registered.`);
      }

      const handler = input.handlers[definition.id];
      if (handler === undefined) {
        throw new ApprovedScriptRegistryError(`Approved script '${definition.id}' has no trusted handler installed.`);
      }

      return handler({
        definition: cloneDefinition(definition),
        input: request.input ?? {}
      });
    }
  };
}

function normalizeApprovedScriptDefinition(raw: unknown): ApprovedScriptDefinition | null {
  if (!isRecord(raw) || hasUnsafeKey(raw)) {
    return null;
  }

  const id = normalizeScriptId(raw.id);
  if (id === null) {
    return null;
  }

  return {
    id,
    title: normalizeNonEmptyString(raw.title, id),
    description: normalizeNonEmptyString(raw.description, "Approved Vaultseer note-management script."),
    scope: normalizeScope(raw.scope),
    permission: normalizePermission(raw.permission),
    inputSchema: normalizeInputSchema(raw.inputSchema),
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : true,
    timeoutSeconds: normalizeTimeoutSeconds(raw.timeoutSeconds)
  };
}

function hasUnsafeKey(raw: Record<string, unknown>): boolean {
  for (const key of Object.keys(raw)) {
    const lower = key.toLowerCase();
    if (!ALLOWED_DEFINITION_KEYS.has(key) || EXECUTABLE_SHAPED_KEYS.has(lower)) {
      return true;
    }
  }
  return false;
}

function normalizeScriptId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const id = value.trim();
  return APPROVED_SCRIPT_ID_PATTERN.test(id) ? id : null;
}

function normalizeScope(value: unknown): ApprovedScriptScope {
  return value === "vault-read" || value === "source-workspace" || value === "active-note" ? value : "active-note";
}

function normalizePermission(value: unknown): ApprovedScriptPermission {
  return value === "read-only" || value === "active-note-proposal" || value === "manual-approval"
    ? value
    : "manual-approval";
}

function normalizeInputSchema(value: unknown): ApprovedScriptInputSchema {
  if (!isRecord(value) || value.type !== "object") {
    return { ...DEFAULT_SCHEMA };
  }

  return {
    type: "object",
    properties: isRecord(value.properties) ? { ...value.properties } : {},
    ...(Array.isArray(value.required) && value.required.every((item) => typeof item === "string")
      ? { required: [...value.required] }
      : {}),
    additionalProperties:
      typeof value.additionalProperties === "boolean" ? value.additionalProperties : false
  };
}

function normalizeTimeoutSeconds(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 10;
  }
  return Math.min(120, Math.max(1, Math.floor(value)));
}

function normalizeNonEmptyString(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
