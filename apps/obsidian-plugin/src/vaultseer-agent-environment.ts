import type { ActiveNoteContextPacket } from "@vaultseer/core";
import type { CodexChatAdapter, CodexChatAdapterRequest, CodexChatAdapterResponse } from "./codex-chat-adapter";
import {
  runVaultseerAgentTurn,
  type VaultseerAgentMessage,
  type VaultseerAgentProvider,
  type VaultseerAgentToolEvent
} from "./vaultseer-agent-runtime";
import {
  listAutonomousVaultseerAgentToolDefinitions,
  type VaultseerAgentToolRegistry
} from "./vaultseer-agent-tool-registry";
import { buildVaultseerAgentProfileReference, buildVaultseerAgentSystemMessage } from "./vaultseer-agent-profile";

const DEFAULT_CONTEXT_MAX_CHARACTERS = 16_000;
const VAULTSEER_AGENT_SYSTEM_MESSAGE = buildVaultseerAgentSystemMessage();

export type VaultseerAgentEnvironmentOptions = {
  providerFactory: () => VaultseerAgentProvider;
  registry: VaultseerAgentToolRegistry;
  maxToolIterations?: number;
  maxContextCharacters?: number;
};

export class VaultseerAgentEnvironment implements CodexChatAdapter {
  readonly capabilities = {
    nativeToolLoop: true
  };

  private conversation: VaultseerAgentMessage[] = [
    {
      role: "system",
      content: VAULTSEER_AGENT_SYSTEM_MESSAGE
    }
  ];

  constructor(private readonly options: VaultseerAgentEnvironmentOptions) {}

  async send(request: CodexChatAdapterRequest): Promise<CodexChatAdapterResponse> {
    if (request.context.status !== "ready") {
      return {
        content: request.context.message,
        toolRequests: [],
        toolEvents: []
      };
    }

    const contextMessageInput: Parameters<typeof buildVaultseerAgentContextMessage>[0] = {
      userMessage: request.message,
      context: request.context
    };
    if (this.options.maxContextCharacters !== undefined) {
      contextMessageInput.maxCharacters = this.options.maxContextCharacters;
    }

    const allowProposalReviewTools = isExplicitProposalApplyRequest(request.message);
    const turnInput: Parameters<typeof runVaultseerAgentTurn>[0] = {
      provider: this.options.providerFactory(),
      registry: this.options.registry,
      messages: this.conversation,
      toolDefinitions: allowProposalReviewTools
        ? this.options.registry.definitions
        : listAutonomousVaultseerAgentToolDefinitions(),
      userMessage: buildVaultseerAgentContextMessage(contextMessageInput),
      allowProposalTools: true,
      allowProposalReviewTools
    };
    if (request.attachments !== undefined) {
      turnInput.userAttachments = request.attachments;
    }
    if (this.options.maxToolIterations !== undefined) {
      turnInput.maxToolIterations = this.options.maxToolIterations;
    }

    const result = await runVaultseerAgentTurn(turnInput);

    this.conversation = compactConversationForNextTurn(result.messages);

    return {
      content: result.assistantMessage,
      toolRequests: [],
      toolEvents: result.toolEvents
    };
  }

  reset(): void {
    this.conversation = [
      {
        role: "system",
        content: VAULTSEER_AGENT_SYSTEM_MESSAGE
      }
    ];
  }
}

export function buildVaultseerAgentContextMessage(input: {
  userMessage: string;
  context: ActiveNoteContextPacket;
  maxCharacters?: number;
}): string {
  const payload = {
    instruction:
      "Use liveNote.text as the active-note body when present, even when the persisted index has zero chunks.",
    profileReference: buildVaultseerAgentProfileReference(input.userMessage),
    currentNote: input.context.note,
    liveNote: input.context.liveNote ?? null,
    indexSummary: {
      noteChunkCount: input.context.noteChunks.length,
      relatedNoteCount: input.context.relatedNotes.length,
      sourceExcerptCount: input.context.sourceExcerpts.length
    },
    noteChunks: input.context.noteChunks,
    relatedNotes: input.context.relatedNotes,
    sourceExcerpts: input.context.sourceExcerpts
  };
  const message = [
    "Vaultseer turn context",
    "BEGIN_VAULTSEER_USER_REQUEST",
    input.userMessage,
    "END_VAULTSEER_USER_REQUEST",
    "",
    "BEGIN_VAULTSEER_CONTEXT_JSON",
    JSON.stringify(payload, null, 2),
    "END_VAULTSEER_CONTEXT_JSON"
  ].join("\n");

  return boundText(message, input.maxCharacters ?? DEFAULT_CONTEXT_MAX_CHARACTERS);
}

function compactConversationForNextTurn(messages: VaultseerAgentMessage[]): VaultseerAgentMessage[] {
  const compacted = messages.filter((message) => message.role === "system" || message.role === "user" || message.role === "assistant");
  const system = compacted.find((message) => message.role === "system");
  const tail = compacted.filter((message) => message.role !== "system").slice(-8);
  return system === undefined ? tail : [system, ...tail];
}

function boundText(value: string, maxCharacters: number): string {
  const limit = Math.max(1, Math.floor(maxCharacters));
  if (value.length <= limit) {
    return value;
  }

  const marker = "\n[truncated]";
  if (limit <= marker.length) {
    return marker.slice(0, limit);
  }

  return `${value.slice(0, limit - marker.length).trimEnd()}${marker}`;
}

function isExplicitProposalApplyRequest(message: string): boolean {
  const normalized = message.toLowerCase().replace(/\s+/g, " ").trim();
  if (!normalized) {
    return false;
  }

  if (/\b(apply|approve|accept)\b/.test(normalized)) {
    return /\b(it|this|that|proposal|suggestion|staged|change|changes|rewrite|draft|edit|edits)\b/.test(normalized);
  }

  if (/\b(yes|ok|okay|approved|accepted|looks good)\b/.test(normalized)) {
    return /\b(apply|write|save|use)\b/.test(normalized);
  }

  return /\b(write|save)\s+(this|it|that|the draft|the proposal|the suggestion|the staged change|the staged rewrite|the rewrite)\s+(to|into|in)\s+(the\s+)?(actual\s+)?(active\s+)?note\b/.test(
    normalized
  );
}

export type { VaultseerAgentToolEvent };
