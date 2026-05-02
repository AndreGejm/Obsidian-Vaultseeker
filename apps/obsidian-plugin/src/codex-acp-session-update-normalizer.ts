import type { CodexSessionToolCallStatus, CodexSessionUpdate } from "./codex-session-state";

type BaseCodexAcpSessionUpdate = {
  sessionId?: string | null;
  sessionUpdate?: string;
  updatedAt?: unknown;
};

export type CodexAcpTextSessionUpdate = BaseCodexAcpSessionUpdate & {
  type: "agent_message_chunk" | "agent_thought_chunk" | "user_message_chunk";
  text?: string;
  content?: unknown;
};

export type CodexAcpToolCallSessionUpdate = BaseCodexAcpSessionUpdate & {
  type: "tool_call" | "tool_call_update";
  toolCallId: string;
  title?: string;
  toolName?: string;
  status?: CodexSessionToolCallStatus;
  kind?: string;
  rawInput?: unknown;
  rawOutput?: unknown;
  output?: unknown;
  content?: unknown;
  error?: string;
};

export type CodexAcpPlanSessionUpdate = BaseCodexAcpSessionUpdate & {
  type: "plan";
  entries: unknown[];
};

export type CodexAcpSessionInfoUpdate = BaseCodexAcpSessionUpdate & {
  type: "session_info_update";
  title?: string | null;
};

export type CodexAcpUsageUpdate = BaseCodexAcpSessionUpdate & {
  type: "usage_update";
  used: number;
  size: number;
  cost?: unknown;
};

export type CodexAcpAvailableCommandsUpdate = BaseCodexAcpSessionUpdate & {
  type: "available_commands_update";
  commands: unknown[];
};

export type CodexAcpCurrentModeUpdate = BaseCodexAcpSessionUpdate & {
  type: "current_mode_update";
  currentModeId: string;
};

export type CodexAcpConfigOptionUpdate = BaseCodexAcpSessionUpdate & {
  type: "config_option_update";
  configOptions: unknown[];
};

export type CodexAcpProcessErrorUpdate = BaseCodexAcpSessionUpdate & {
  type: "process_error";
  error: unknown;
};

export type CodexAcpUnknownSessionUpdate = BaseCodexAcpSessionUpdate & {
  type: string;
  [key: string]: unknown;
};

export type CodexAcpRawSessionUpdate = BaseCodexAcpSessionUpdate & {
  type?: never;
  sessionUpdate: string;
  [key: string]: unknown;
};

export type CodexAcpKnownSessionUpdate =
  | CodexAcpTextSessionUpdate
  | CodexAcpToolCallSessionUpdate
  | CodexAcpPlanSessionUpdate
  | CodexAcpSessionInfoUpdate
  | CodexAcpUsageUpdate
  | CodexAcpAvailableCommandsUpdate
  | CodexAcpCurrentModeUpdate
  | CodexAcpConfigOptionUpdate
  | CodexAcpProcessErrorUpdate;

export type CodexAcpSessionUpdate = CodexAcpKnownSessionUpdate | CodexAcpUnknownSessionUpdate | CodexAcpRawSessionUpdate;

type CodexToolCallSessionUpdate = Extract<CodexSessionUpdate, { type: "tool_call" | "tool_call_update" }>;

export function normalizeCodexAcpSessionUpdate(input: CodexAcpSessionUpdate): CodexSessionUpdate {
  const updateType = sessionUpdateType(input);

  switch (updateType) {
    case "agent_message_chunk":
    case "agent_thought_chunk":
    case "user_message_chunk": {
      const textInput = input as CodexAcpTextSessionUpdate;
      return {
        type: updateType,
        ...sessionIdField(textInput.sessionId),
        text: textContent(textInput),
        ...stringUpdatedAt(textInput.updatedAt)
      };
    }
    case "plan": {
      const planInput = input as CodexAcpPlanSessionUpdate;
      return {
        type: "plan",
        ...sessionIdField(planInput.sessionId),
        entries: Array.isArray(planInput.entries) ? planInput.entries : [],
        ...stringUpdatedAt(planInput.updatedAt)
      };
    }
    case "tool_call":
    case "tool_call_update":
      return normalizeToolCallUpdate(input as CodexAcpToolCallSessionUpdate, updateType);
    case "session_info_update": {
      const sessionInfoInput = input as CodexAcpSessionInfoUpdate;
      return {
        type: "session_metadata",
        ...sessionIdField(sessionInfoInput.sessionId),
        ...(typeof sessionInfoInput.title === "string" ? { title: sessionInfoInput.title } : {}),
        metadata: {
          sessionInfo: {
            ...(sessionInfoInput.title === undefined ? {} : { title: sessionInfoInput.title }),
            ...(typeof sessionInfoInput.updatedAt === "string" ? { updatedAt: sessionInfoInput.updatedAt } : {})
          }
        },
        ...stringUpdatedAt(sessionInfoInput.updatedAt)
      };
    }
    case "usage_update": {
      const usageInput = input as CodexAcpUsageUpdate;
      return {
        type: "session_metadata",
        ...sessionIdField(usageInput.sessionId),
        metadata: {
          usage: {
            used: usageInput.used,
            size: usageInput.size,
            ...(usageInput.cost === undefined ? {} : { cost: usageInput.cost })
          }
        },
        ...stringUpdatedAt(usageInput.updatedAt)
      };
    }
    case "available_commands_update": {
      const commandsInput = input as CodexAcpAvailableCommandsUpdate;
      return {
        type: "session_metadata",
        ...sessionIdField(commandsInput.sessionId),
        metadata: { availableCommands: commandsInput.commands },
        ...stringUpdatedAt(commandsInput.updatedAt)
      };
    }
    case "current_mode_update": {
      const modeInput = input as CodexAcpCurrentModeUpdate;
      return {
        type: "session_metadata",
        ...sessionIdField(modeInput.sessionId),
        metadata: { currentModeId: modeInput.currentModeId },
        ...stringUpdatedAt(modeInput.updatedAt)
      };
    }
    case "config_option_update": {
      const configInput = input as CodexAcpConfigOptionUpdate;
      return {
        type: "session_metadata",
        ...sessionIdField(configInput.sessionId),
        metadata: { configOptions: configInput.configOptions },
        ...stringUpdatedAt(configInput.updatedAt)
      };
    }
    case "process_error": {
      const errorInput = input as CodexAcpProcessErrorUpdate;
      return {
        type: "session_metadata",
        ...sessionIdField(errorInput.sessionId),
        metadata: { processError: errorInput.error },
        ...stringUpdatedAt(errorInput.updatedAt)
      };
    }
    default:
      return {
        type: "noop",
        sessionId: input.sessionId ?? null
      };
  }
}

function normalizeToolCallUpdate(
  input: CodexAcpToolCallSessionUpdate,
  updateType: "tool_call" | "tool_call_update"
): CodexToolCallSessionUpdate | Extract<CodexSessionUpdate, { type: "noop" }> {
  if (stringValue(input.toolCallId) === undefined) {
    return {
      type: "noop",
      sessionId: input.sessionId ?? null
    };
  }

  const output = hasOwn(input, "rawOutput") ? input.rawOutput : hasOwn(input, "output") ? input.output : input.content;
  const update: CodexToolCallSessionUpdate = {
    type: updateType,
    ...sessionIdField(input.sessionId),
    toolCallId: input.toolCallId,
    ...stringUpdatedAt(input.updatedAt)
  };
  assignOptional(update, "title", input.title);
  assignOptional(update, "status", input.status);
  assignOptional(update, "kind", input.kind);
  assignOptional(update, "input", hasOwn(input, "rawInput") ? input.rawInput : undefined);
  assignOptional(update, "output", output);
  assignOptional(update, "error", input.error);
  assignOptional(update, "toolName", input.toolName ?? inferToolName(input.rawInput));
  return update;
}

function inferToolName(rawInput: unknown): string | undefined {
  if (!isRecord(rawInput)) {
    return undefined;
  }

  return (
    nestedStringField(rawInput, "invocation", "tool") ??
    nestedStringField(rawInput, "tool_call", "name")
  );
}

function textContent(input: CodexAcpTextSessionUpdate): string {
  if (typeof input.text === "string") {
    return input.text;
  }

  if (isRecord(input.content) && input.content.type === "text") {
    return stringField(input.content, "text") ?? "";
  }

  return "";
}

function sessionUpdateType(input: CodexAcpSessionUpdate): string {
  const record = input as { type?: unknown; sessionUpdate?: unknown };
  return typeof record.type === "string"
    ? record.type
    : typeof record.sessionUpdate === "string"
      ? record.sessionUpdate
      : "";
}

function nestedStringField(record: Record<string, unknown>, key: string, nestedKey: string): string | undefined {
  const nested = record[key];
  return isRecord(nested) ? stringField(nested, nestedKey) : undefined;
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  return stringValue(record[key]);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function stringUpdatedAt(updatedAt: unknown): { updatedAt?: string } {
  return typeof updatedAt === "string" ? { updatedAt } : {};
}

function sessionIdField(sessionId: string | null | undefined): { sessionId?: string | null } {
  return sessionId === undefined ? {} : { sessionId };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn<T extends object, K extends PropertyKey>(value: T, key: K): value is T & Record<K, unknown> {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function assignOptional<T extends object, K extends keyof T>(target: T, key: K, value: T[K] | undefined): void {
  if (value !== undefined) {
    target[key] = value;
  }
}
