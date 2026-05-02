export type CodexChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string | undefined;
};

export type CodexChatToolRequest = {
  tool: string;
  input: unknown;
};

export type CodexPendingToolRequest = {
  id: string;
  tool: string;
  input: unknown;
  createdAt: string | undefined;
  status: "pending_review";
};

export type CodexChatState = {
  activePath: string | null;
  messages: CodexChatMessage[];
  pendingToolRequests: CodexPendingToolRequest[];
  persistToVault: false;
  error: string | null;
};

export type CodexChatEvent =
  | { type: "user_message"; content: string; createdAt: string }
  | { type: "assistant_message"; content: string; createdAt: string; toolRequests?: CodexChatToolRequest[] }
  | { type: "error"; message: string }
  | { type: "active_note_changed"; activePath: string | null }
  | { type: "dismiss_tool_request"; id: string }
  | { type: "clear" };

export function createEmptyChatState(activePath: string | null): CodexChatState {
  return {
    activePath,
    messages: [],
    pendingToolRequests: [],
    persistToVault: false,
    error: null
  };
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
    case "error":
      return { ...state, error: event.message };
    case "active_note_changed":
      if (event.activePath === state.activePath) {
        return state;
      }

      return createEmptyChatState(event.activePath);
    case "dismiss_tool_request": {
      const pendingToolRequests = state.pendingToolRequests.filter((request) => request.id !== event.id);
      return pendingToolRequests.length === state.pendingToolRequests.length ? state : { ...state, pendingToolRequests };
    }
    case "clear":
      return createEmptyChatState(state.activePath);
  }
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
      ...toolRequests.map((request, index) => ({
        id: `codex-tool-request-${messageOrdinal}-${index + 1}`,
        tool: request.tool,
        input: request.input,
        createdAt,
        status: "pending_review" as const
      }))
    ]
  };
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
