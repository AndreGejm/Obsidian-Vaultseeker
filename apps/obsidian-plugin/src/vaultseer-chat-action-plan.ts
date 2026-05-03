import type { CodexChatToolRequest } from "./codex-chat-state";

export type BuildVaultseerChatActionPlanInput = {
  message: string;
  activePath: string | null;
};

export type VaultseerChatActionPlan = {
  content: string | null;
  toolRequests: CodexChatToolRequest[];
};

export function buildVaultseerChatActionPlan(input: BuildVaultseerChatActionPlanInput): VaultseerChatActionPlan {
  const message = input.message.trim();
  const normalized = normalize(message);

  if (mentionsSourceExtraction(normalized)) {
    return commandPlan("Vaultseer prepared the source extraction queue command.", "plan-source-extraction-queue");
  }

  if (mentionsSemanticIndexing(normalized)) {
    return commandPlan("Vaultseer prepared the semantic indexing command.", "plan-semantic-index");
  }

  if (mentionsSourceSearch(normalized)) {
    return {
      content: "Vaultseer prepared a source workspace search.",
      toolRequests: [{ tool: "search_sources", input: { query: message, limit: 8 } }]
    };
  }

  if (mentionsRelatedNoteSearch(normalized)) {
    return {
      content: "Vaultseer prepared a note search for related context.",
      toolRequests: [{ tool: "search_notes", input: { query: message, limit: 8 } }]
    };
  }

  if (mentionsCurrentNoteReview(normalized) && input.activePath !== null) {
    return {
      content: "Vaultseer prepared current-note inspection before answering.",
      toolRequests: [{ tool: "inspect_current_note", input: null }]
    };
  }

  return {
    content: null,
    toolRequests: []
  };
}

function commandPlan(content: string, commandId: string): VaultseerChatActionPlan {
  return {
    content,
    toolRequests: [{ tool: "run_vaultseer_command", input: { commandId } }]
  };
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function mentionsCurrentNoteReview(message: string): boolean {
  return (
    /\b(review|sanity check|check|improve|format|summari[sz]e)\b/.test(message) &&
    /\b(current note|active note|this note|note)\b/.test(message)
  ) || /\b(suggest|create)\b.*\b(tags?|links?|aliases?)\b/.test(message);
}

function mentionsRelatedNoteSearch(message: string): boolean {
  return /\b(find|search|show|list)\b.*\b(related|similar|nearby|connected)\b.*\b(notes?|context)\b/.test(message);
}

function mentionsSourceSearch(message: string): boolean {
  return /\b(search|find|check|look)\b.*\b(sources?|literature|datasheets?|papers?|books?|presentations?)\b/.test(message);
}

function mentionsSemanticIndexing(message: string): boolean {
  return /\b(vectori[sz]e|semantic index|embedding|embeddings|chunk and vectori[sz]e)\b/.test(message);
}

function mentionsSourceExtraction(message: string): boolean {
  return /\b(extract|convert|import)\b.*\b(pdf|source|datasheet|paper|book|docx|presentation)\b/.test(message);
}
