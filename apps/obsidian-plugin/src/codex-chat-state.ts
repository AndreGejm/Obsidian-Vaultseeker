import type { CodexToolResult } from "./codex-tool-dispatcher";
import { formatCodexToolResultMessage } from "./codex-tool-result-message";

export type CodexToolExecutionStatus = "running" | "completed" | "failed";

export type CodexChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string | undefined;
};

export type CodexChatToolRequest = {
  tool: string;
  input: unknown;
  toolCallId?: string;
  sessionId?: string;
  status?: string;
  requestClass?: string;
  kind?: string;
};

export type CodexPendingToolRequest = {
  displayId: string;
  tool: string;
  input: unknown;
  createdAt: string | undefined;
  reviewStatus: "pending_review";
  toolCallId?: string;
  sessionId?: string;
  status?: string;
  requestClass?: string;
  kind?: string;
  executionStatus?: CodexToolExecutionStatus;
};

export type CodexChatState = {
  activePath: string | null;
  chatScopeId: number;
  messages: CodexChatMessage[];
  pendingToolRequests: CodexPendingToolRequest[];
  persistToVault: false;
  error: string | null;
};

export type CodexChatSendScope = {
  sendId: number;
  activePath: string | null;
  chatScopeId: number;
};

export type CodexToolRequestScope = {
  displayId: string;
  activePath: string | null;
  chatScopeId: number;
};

export type CodexChatEvent =
  | { type: "user_message"; content: string; createdAt: string }
  | { type: "assistant_message"; content: string; createdAt: string; toolRequests?: CodexChatToolRequest[] }
  | { type: "system_message"; content: string; createdAt: string }
  | { type: "error"; message: string }
  | { type: "active_note_changed"; activePath: string | null }
  | { type: "dismiss_tool_request"; displayId: string }
  | { type: "start_tool_request"; displayId: string; scope: CodexToolRequestScope }
  | { type: "complete_tool_request"; displayId: string; scope: CodexToolRequestScope; result: CodexToolResult; createdAt: string }
  | { type: "fail_tool_request"; displayId: string; scope: CodexToolRequestScope; result: CodexToolResult; createdAt: string }
  | { type: "clear" };

export function createEmptyChatState(activePath: string | null, chatScopeId = 0): CodexChatState {
  return {
    activePath,
    chatScopeId,
    messages: [],
    pendingToolRequests: [],
    persistToVault: false,
    error: null
  };
}

export function createCodexChatSendScope(
  state: CodexChatState,
  sendId: number,
  activePath: string | null
): CodexChatSendScope {
  return {
    sendId,
    activePath,
    chatScopeId: state.chatScopeId
  };
}

export function isCurrentCodexChatSend(
  state: CodexChatState,
  currentActivePath: string | null,
  scope: CodexChatSendScope,
  currentSendId = scope.sendId
): boolean {
  return (
    currentSendId === scope.sendId &&
    state.chatScopeId === scope.chatScopeId &&
    state.activePath === scope.activePath &&
    currentActivePath === scope.activePath
  );
}

export function createCodexToolRequestScope(
  state: CodexChatState,
  displayId: string,
  activePath: string | null
): CodexToolRequestScope {
  return {
    displayId,
    activePath,
    chatScopeId: state.chatScopeId
  };
}

export function isCurrentCodexToolRequestScope(
  state: CodexChatState,
  currentActivePath: string | null,
  scope: CodexToolRequestScope
): boolean {
  return (
    state.chatScopeId === scope.chatScopeId &&
    state.activePath === scope.activePath &&
    currentActivePath === scope.activePath
  );
}

export function applyActiveNoteChangeToChatState(state: CodexChatState, activePath: string | null): CodexChatState {
  return applyChatEvent(state, { type: "active_note_changed", activePath });
}

export function applyChatEvent(state: CodexChatState, event: CodexChatEvent): CodexChatState {
  switch (event.type) {
    case "user_message":
      return appendMessage(state, "user", event.content, event.createdAt);
    case "assistant_message": {
      const createdAt = (event as { createdAt?: string }).createdAt;
      const messageOrdinal = state.messages.length + 1;
      const nextState = appendMessage(state, "assistant", event.content, createdAt);
      return appendPendingToolRequests(nextState, event.toolRequests, createdAt, messageOrdinal);
    }
    case "system_message":
      return appendMessage(state, "system", event.content, event.createdAt);
    case "error":
      return { ...state, error: event.message };
    case "active_note_changed":
      if (event.activePath === state.activePath) {
        return state;
      }

      return createEmptyChatState(event.activePath, state.chatScopeId + 1);
    case "dismiss_tool_request": {
      const pendingToolRequests = state.pendingToolRequests.filter((request) => request.displayId !== event.displayId);
      return pendingToolRequests.length === state.pendingToolRequests.length ? state : { ...state, pendingToolRequests };
    }
    case "start_tool_request":
      if (!isCurrentToolRequestEvent(state, event.scope) || event.displayId !== event.scope.displayId) {
        return state;
      }

      return updatePendingToolRequestExecutionStatus(state, event.displayId, "running");
    case "complete_tool_request":
      return applyToolRequestResultEvent(state, event.displayId, event.scope, "completed", event.result, event.createdAt);
    case "fail_tool_request":
      return applyToolRequestResultEvent(state, event.displayId, event.scope, "failed", event.result, event.createdAt);
    case "clear":
      return createEmptyChatState(state.activePath, state.chatScopeId + 1);
  }
}

function applyToolRequestResultEvent(
  state: CodexChatState,
  displayId: string,
  scope: CodexToolRequestScope,
  executionStatus: Extract<CodexToolExecutionStatus, "completed" | "failed">,
  result: CodexToolResult,
  createdAt: string
): CodexChatState {
  if (!isCurrentToolRequestEvent(state, scope) || displayId !== scope.displayId || !hasPendingToolRequest(state, displayId)) {
    return state;
  }

  return appendMessage(
    updatePendingToolRequestExecutionStatus(state, displayId, executionStatus),
    "system",
    formatCodexToolResultMessage(result),
    createdAt
  );
}

function isCurrentToolRequestEvent(state: CodexChatState, scope: CodexToolRequestScope): boolean {
  return state.chatScopeId === scope.chatScopeId && state.activePath === scope.activePath;
}

function hasPendingToolRequest(state: CodexChatState, displayId: string): boolean {
  return state.pendingToolRequests.some((request) => request.displayId === displayId);
}

function updatePendingToolRequestExecutionStatus(
  state: CodexChatState,
  displayId: string,
  executionStatus: CodexToolExecutionStatus
): CodexChatState {
  if (!hasPendingToolRequest(state, displayId)) {
    return state;
  }

  return {
    ...state,
    pendingToolRequests: state.pendingToolRequests.map((request) =>
      request.displayId === displayId ? { ...request, executionStatus } : request
    )
  };
}

function appendMessage(
  state: CodexChatState,
  role: CodexChatMessage["role"],
  content: string,
  createdAt: string | undefined
): CodexChatState {
  return {
    ...state,
    messages: [
      ...state.messages,
      {
        role,
        content,
        createdAt
      }
    ],
    error: null
  };
}

function appendPendingToolRequests(
  state: CodexChatState,
  toolRequests: CodexChatToolRequest[] | undefined,
  createdAt: string | undefined,
  messageOrdinal: number
): CodexChatState {
  if (!Array.isArray(toolRequests) || toolRequests.length === 0) {
    return state;
  }

  return {
    ...state,
    pendingToolRequests: [
      ...state.pendingToolRequests,
      ...toolRequests.map((request, index) => pendingToolRequestFromChatRequest(request, createdAt, messageOrdinal, index))
    ]
  };
}

function pendingToolRequestFromChatRequest(
  request: CodexChatToolRequest,
  createdAt: string | undefined,
  messageOrdinal: number,
  index: number
): CodexPendingToolRequest {
  const pendingRequest: CodexPendingToolRequest = {
    displayId: `codex-tool-request-${messageOrdinal}-${index + 1}`,
    tool: request.tool,
    input: request.input,
    createdAt,
    reviewStatus: "pending_review"
  };
  assignOptional(pendingRequest, "toolCallId", request.toolCallId);
  assignOptional(pendingRequest, "sessionId", request.sessionId);
  assignOptional(pendingRequest, "status", request.status);
  assignOptional(pendingRequest, "requestClass", request.requestClass);
  assignOptional(pendingRequest, "kind", request.kind);
  return pendingRequest;
}

export function formatCodexToolRequestInputPreview(input: unknown): string {
  const maxLength = 80;
  const preview = stringifyToolRequestInput(input);

  if (preview.length <= maxLength) {
    return preview;
  }

  return `${preview.slice(0, maxLength - 3)}...`;
}

function stringifyToolRequestInput(input: unknown): string {
  if (input === undefined) {
    return "No input";
  }

  if (input === null) {
    return "null";
  }

  if (typeof input === "string") {
    return input;
  }

  try {
    return JSON.stringify(input) ?? String(input);
  } catch {
    return String(input);
  }
}

function assignOptional<T extends object, K extends keyof T>(target: T, key: K, value: T[K] | undefined): void {
  if (value !== undefined) {
    target[key] = value;
  }
}
