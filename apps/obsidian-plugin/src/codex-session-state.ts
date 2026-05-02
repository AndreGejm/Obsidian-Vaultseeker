import { isAllowedCodexTool } from "./codex-tool-dispatcher";

export type CodexSessionMessageRole = "user" | "assistant";

export type CodexSessionPlan = {
  entries: unknown[];
};

export type CodexSessionToolCallStatus = "pending" | "running" | "completed" | "failed" | "cancelled" | string;

export type CodexSessionToolCall = {
  toolCallId: string;
  toolName?: string;
  isAllowed: boolean;
  status?: CodexSessionToolCallStatus;
  input?: unknown;
  output?: unknown;
  error?: string;
  title?: string;
  kind?: string;
  updatedAt?: string;
};

export type CodexSessionMessage = {
  id: string;
  role: CodexSessionMessageRole;
  content: string;
  thoughts: string;
  plan: CodexSessionPlan | null;
  toolCalls: CodexSessionToolCall[];
  createdAt?: string;
  updatedAt?: string;
};

export type CodexSessionMetadata = {
  title?: string;
  [key: string]: unknown;
};

export type CodexSessionState = {
  sessionId: string | null;
  messages: CodexSessionMessage[];
  toolCallIndex: Record<string, number>;
  metadata: CodexSessionMetadata;
  updatedAt: string | null;
};

type BaseCodexSessionUpdate = {
  sessionId?: string | null;
  updatedAt?: string;
};

export type CodexSessionUpdate =
  | (BaseCodexSessionUpdate & { type: "agent_message_chunk"; text: string })
  | (BaseCodexSessionUpdate & { type: "agent_thought_chunk"; text: string })
  | (BaseCodexSessionUpdate & { type: "user_message_chunk"; text: string })
  | (BaseCodexSessionUpdate & {
      type: "tool_call";
      toolCallId: string;
      toolName?: string;
      status?: CodexSessionToolCallStatus;
      input?: unknown;
      output?: unknown;
      error?: string;
      title?: string;
      kind?: string;
    })
  | (BaseCodexSessionUpdate & {
      type: "tool_call_update";
      toolCallId: string;
      toolName?: string;
      status?: CodexSessionToolCallStatus;
      input?: unknown;
      output?: unknown;
      error?: string;
      title?: string;
      kind?: string;
    })
  | (BaseCodexSessionUpdate & { type: "plan"; entries: unknown[] })
  | (BaseCodexSessionUpdate & { type: "session_metadata"; title?: string; metadata?: CodexSessionMetadata })
  | (BaseCodexSessionUpdate & { type: "noop" });

export function createCodexSessionState(sessionId: string | null): CodexSessionState {
  return {
    sessionId,
    messages: [],
    toolCallIndex: {},
    metadata: {},
    updatedAt: null
  };
}

export function applyCodexSessionUpdate(
  state: CodexSessionState,
  update: CodexSessionUpdate
): CodexSessionState {
  if (hasMismatchedSessionId(state, update)) {
    return state;
  }

  switch (update.type) {
    case "agent_message_chunk":
      return updateLastAssistantMessage(state, update.sessionId, update.updatedAt, (message) => ({
        ...message,
        content: message.content + update.text
      }));
    case "agent_thought_chunk":
      return updateLastAssistantMessage(state, update.sessionId, update.updatedAt, (message) => ({
        ...message,
        thoughts: message.thoughts + update.text
      }));
    case "user_message_chunk":
      return updateLastUserMessage(state, update.sessionId, update.updatedAt, (message) => ({
        ...message,
        content: message.content + update.text
      }));
    case "plan":
      return updateLastAssistantMessage(state, update.sessionId, update.updatedAt, (message) => ({
        ...message,
        plan: { entries: update.entries }
      }));
    case "tool_call":
    case "tool_call_update":
      return upsertToolCall(state, update);
    case "session_metadata":
      return {
        ...withSessionId(state, update.sessionId),
        metadata: {
          ...state.metadata,
          ...update.metadata,
          ...(update.title === undefined ? {} : { title: update.title })
        },
        updatedAt: update.updatedAt ?? state.updatedAt
      };
    case "noop":
      return state;
  }
}

function hasMismatchedSessionId(state: CodexSessionState, update: BaseCodexSessionUpdate): boolean {
  return state.sessionId !== null && update.sessionId != null && update.sessionId !== state.sessionId;
}

function withSessionId(state: CodexSessionState, sessionId: string | null | undefined): CodexSessionState {
  if (state.sessionId !== null || sessionId == null) {
    return state;
  }

  return { ...state, sessionId };
}

function updateLastAssistantMessage(
  state: CodexSessionState,
  sessionId: string | null | undefined,
  updatedAt: string | undefined,
  updateMessage: (message: CodexSessionMessage) => CodexSessionMessage
): CodexSessionState {
  return updateLastMessage(state, "assistant", sessionId, updatedAt, updateMessage);
}

function updateLastUserMessage(
  state: CodexSessionState,
  sessionId: string | null | undefined,
  updatedAt: string | undefined,
  updateMessage: (message: CodexSessionMessage) => CodexSessionMessage
): CodexSessionState {
  return updateLastMessage(state, "user", sessionId, updatedAt, updateMessage);
}

function updateLastMessage(
  state: CodexSessionState,
  role: CodexSessionMessageRole,
  sessionId: string | null | undefined,
  updatedAt: string | undefined,
  updateMessage: (message: CodexSessionMessage) => CodexSessionMessage
): CodexSessionState {
  const baseState = withSessionId(state, sessionId);
  const lastMessage = baseState.messages[baseState.messages.length - 1];
  const messages =
    lastMessage?.role === role
      ? replaceMessage(baseState.messages, baseState.messages.length - 1, stampMessage(updateMessage(lastMessage), updatedAt))
      : [
          ...baseState.messages,
          stampMessage(
            updateMessage(createCodexSessionMessage(role, baseState.messages.length, updatedAt)),
            updatedAt
          )
        ];

  return {
    ...baseState,
    messages,
    updatedAt: updatedAt ?? baseState.updatedAt
  };
}

function upsertToolCall(
  state: CodexSessionState,
  update: Extract<CodexSessionUpdate, { type: "tool_call" | "tool_call_update" }>
): CodexSessionState {
  const existingMessageIndex = state.toolCallIndex[update.toolCallId];
  const messageIndex = existingMessageIndex ?? findToolCallMessageIndex(state.messages, update.toolCallId);
  const targetIndex =
    messageIndex === undefined ? findOrCreateAssistantMessageIndex(state.messages) : messageIndex;
  const messages =
    targetIndex === state.messages.length
      ? [...state.messages, createCodexSessionMessage("assistant", state.messages.length, update.updatedAt)]
      : [...state.messages];
  const targetMessage = messages[targetIndex];
  if (!targetMessage) {
    return state;
  }

  const toolCalls = upsertToolCallInMessage(targetMessage.toolCalls, update);
  messages[targetIndex] = stampMessage({ ...targetMessage, toolCalls }, update.updatedAt);

  return {
    ...withSessionId(state, update.sessionId),
    messages,
    toolCallIndex: {
      ...state.toolCallIndex,
      [update.toolCallId]: targetIndex
    },
    updatedAt: update.updatedAt ?? state.updatedAt
  };
}

function upsertToolCallInMessage(
  toolCalls: CodexSessionToolCall[],
  update: Extract<CodexSessionUpdate, { type: "tool_call" | "tool_call_update" }>
): CodexSessionToolCall[] {
  const existingIndex = toolCalls.findIndex((toolCall) => toolCall.toolCallId === update.toolCallId);
  const existing = existingIndex >= 0 ? toolCalls[existingIndex] : undefined;
  const toolName = update.toolName ?? existing?.toolName;
  const merged: CodexSessionToolCall = {
    ...existing,
    toolCallId: update.toolCallId,
    isAllowed: toolName !== undefined && isAllowedCodexTool(toolName)
  };
  assignOptional(merged, "toolName", toolName);
  assignOptional(merged, "status", update.status ?? existing?.status);
  assignOptional(merged, "input", update.input ?? existing?.input);
  assignOptional(merged, "output", update.output ?? existing?.output);
  assignOptional(merged, "error", update.error ?? existing?.error);
  assignOptional(merged, "title", update.title ?? existing?.title);
  assignOptional(merged, "kind", update.kind ?? existing?.kind);

  if (existingIndex < 0) {
    return [...toolCalls, merged];
  }

  const next = [...toolCalls];
  next[existingIndex] = merged;
  return next;
}

function findToolCallMessageIndex(messages: CodexSessionMessage[], toolCallId: string): number | undefined {
  const index = messages.findIndex((message) =>
    message.toolCalls.some((toolCall) => toolCall.toolCallId === toolCallId)
  );
  return index >= 0 ? index : undefined;
}

function findOrCreateAssistantMessageIndex(messages: CodexSessionMessage[]): number {
  const lastMessage = messages[messages.length - 1];
  return lastMessage?.role === "assistant" ? messages.length - 1 : messages.length;
}

function createCodexSessionMessage(
  role: CodexSessionMessageRole,
  index: number,
  createdAt: string | undefined
): CodexSessionMessage {
  const message: CodexSessionMessage = {
    id: `${role}-${index + 1}`,
    role,
    content: "",
    thoughts: "",
    plan: null,
    toolCalls: []
  };
  assignOptional(message, "createdAt", createdAt);
  assignOptional(message, "updatedAt", createdAt);
  return message;
}

function replaceMessage(
  messages: CodexSessionMessage[],
  index: number,
  message: CodexSessionMessage
): CodexSessionMessage[] {
  const next = [...messages];
  next[index] = message;
  return next;
}

function stampMessage(message: CodexSessionMessage, updatedAt: string | undefined): CodexSessionMessage {
  if (updatedAt === undefined) {
    return message;
  }

  return { ...message, updatedAt };
}

function assignOptional<T extends object, K extends keyof T>(target: T, key: K, value: T[K] | undefined): void {
  if (value !== undefined) {
    target[key] = value;
  }
}
