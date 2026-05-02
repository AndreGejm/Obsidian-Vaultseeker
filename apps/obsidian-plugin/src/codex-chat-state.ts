export type CodexChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
};

export type CodexChatState = {
  activePath: string | null;
  messages: CodexChatMessage[];
  persistToVault: false;
  error: string | null;
};

export type CodexChatEvent =
  | { type: "user_message"; content: string }
  | { type: "assistant_message"; content: string }
  | { type: "error"; message: string }
  | { type: "active_note_changed"; activePath: string | null }
  | { type: "clear" };

export function createEmptyChatState(activePath: string | null): CodexChatState {
  return {
    activePath,
    messages: [],
    persistToVault: false,
    error: null
  };
}

export function applyChatEvent(state: CodexChatState, event: CodexChatEvent): CodexChatState {
  switch (event.type) {
    case "user_message":
      return appendMessage(state, "user", event.content);
    case "assistant_message":
      return appendMessage(state, "assistant", event.content);
    case "error":
      return { ...state, error: event.message };
    case "active_note_changed":
      return createEmptyChatState(event.activePath);
    case "clear":
      return createEmptyChatState(state.activePath);
  }
}

function appendMessage(state: CodexChatState, role: CodexChatMessage["role"], content: string): CodexChatState {
  return {
    ...state,
    messages: [
      ...state.messages,
      {
        role,
        content,
        createdAt: new Date().toISOString()
      }
    ],
    error: null
  };
}
