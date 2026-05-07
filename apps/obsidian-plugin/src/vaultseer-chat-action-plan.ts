import type { CodexChatToolRequest } from "./codex-chat-state";
import { VAULTSEER_STUDIO_COMMAND_DEFINITIONS } from "./studio-command-catalog";
import { buildVaultseerCommandListMessage } from "./vaultseer-studio-command-request";

export type BuildVaultseerChatActionPlanInput = {
  message: string;
  activePath: string | null;
  lastAssistantMarkdownSuggestion?: string | null;
  lastAssistantStageableMarkdownSuggestion?: string | null;
};

export type VaultseerChatActionPlan = {
  content: string | null;
  toolRequests: CodexChatToolRequest[];
  autoStageToolRequests?: CodexChatToolRequest[];
  sendToCodex?: boolean;
  agentMessage?: string;
};

export function buildVaultseerChatActionPlan(input: BuildVaultseerChatActionPlanInput): VaultseerChatActionPlan {
  const message = input.message.trim();
  const normalized = normalize(message);

  if (mentionsVaultseerCapabilities(normalized)) {
    return {
      content: buildVaultseerCapabilitiesMessage(),
      toolRequests: [],
      sendToCodex: false
    };
  }

  if (mentionsHealthyNativeBridge(normalized)) {
    return {
      content: buildHealthyNativeBridgeMessage(),
      toolRequests: [],
      sendToCodex: false
    };
  }

  const draftToStage = chooseMarkdownDraftToStage({
    message: normalized,
    lastAssistantMarkdownSuggestion: input.lastAssistantMarkdownSuggestion ?? null,
    lastAssistantStageableMarkdownSuggestion: input.lastAssistantStageableMarkdownSuggestion ?? null
  });

  if (input.activePath !== null && isNonblank(draftToStage)) {
    return {
      content: "Vaultseer staged the previous draft. Review the redline card below, then press Write to note.",
      toolRequests: [],
      autoStageToolRequests: [
        {
          tool: "stage_suggestion",
          input: {
            kind: "rewrite",
            targetPath: input.activePath,
            markdown: draftToStage.trim(),
            reason: "User explicitly asked Vaultseer chat to write the previous assistant draft to the active note."
          }
        }
      ],
      sendToCodex: false
    };
  }

  if (mentionsStageForReview(normalized)) {
    const tags = parseExplicitTagsToStage(message);
    if (tags.length > 0 && input.activePath !== null) {
      return {
        content: "Vaultseer prepared a tag suggestion for review.",
        toolRequests: [
          {
            tool: "stage_suggestion",
            input: {
              kind: "tag",
              targetPath: input.activePath,
              tags,
              reason: "User asked Vaultseer chat to stage these tags."
            }
          }
        ],
        sendToCodex: false
      };
    }

    if (input.activePath === null) {
      return {
        content: "Open a note first, then I can stage a reviewable Vaultseer proposal for it.",
        toolRequests: [],
        sendToCodex: false
      };
    }

    return {
      content: "Vaultseer is preparing an active-note proposal for review.",
      toolRequests: [
        { tool: "inspect_current_note", input: null },
        { tool: "inspect_current_note_chunks", input: { limit: 8 } },
        { tool: "inspect_note_quality", input: null },
        { tool: "search_notes", input: { query: message, limit: 8 } }
      ],
      agentMessage: buildStageSuggestionProposalAgentMessage(message)
    };
  }

  if (mentionsActiveNoteRewriteProposal(normalized) && input.activePath !== null) {
    return {
      content: "Vaultseer is preparing an active-note rewrite proposal.",
      toolRequests: [
        { tool: "inspect_current_note", input: null },
        { tool: "inspect_current_note_chunks", input: { limit: 8 } },
        { tool: "inspect_note_quality", input: null },
        { tool: "search_notes", input: { query: message, limit: 8 } }
      ],
      agentMessage: buildActiveNoteRewriteProposalAgentMessage(message)
    };
  }

  if (mentionsDraftSuggestions(normalized)) {
    if (input.activePath === null) {
      return {
        content: "Open a note first, then I can draft tag, link, and cleanup suggestions for it.",
        toolRequests: [],
        sendToCodex: false
      };
    }

    return {
      content: "Vaultseer is drafting suggestions from current-note evidence.",
      toolRequests: [
        { tool: "inspect_current_note", input: null },
        { tool: "inspect_current_note_chunks", input: { limit: 8 } },
        { tool: "suggest_current_note_tags", input: null },
        { tool: "suggest_current_note_links", input: null },
        { tool: "inspect_note_quality", input: null },
        { tool: "search_notes", input: { query: message, limit: 8 } }
      ],
      agentMessage: buildDraftSuggestionsAgentMessage(message)
    };
  }

  if (mentionsNoteIndexRebuild(normalized)) {
    return {
      content: "Vaultseer prepared the note index rebuild command.",
      toolRequests: [{ tool: "rebuild_note_index", input: null }]
    };
  }

  if (mentionsCurrentNoteChunks(normalized)) {
    return {
      content: "Vaultseer prepared current-note chunk inspection.",
      toolRequests: [{ tool: "inspect_current_note_chunks", input: { limit: 12 } }]
    };
  }

  if (mentionsPdfSourceExtractionBatch(normalized)) {
    return {
      content: "Vaultseer prepared one native PDF extraction batch.",
      toolRequests: [
        { tool: "inspect_pdf_source_extraction_queue", input: null },
        { tool: "run_pdf_source_extraction_batch", input: null }
      ]
    };
  }

  if (mentionsSourceExtraction(normalized)) {
    return {
      content: "Vaultseer prepared native PDF source extraction planning.",
      toolRequests: [
        { tool: "inspect_pdf_source_extraction_queue", input: null },
        { tool: "plan_pdf_source_extraction", input: null }
      ]
    };
  }

  if (mentionsSourceSemanticIndexBatch(normalized)) {
    return {
      content: "Vaultseer prepared one source semantic indexing batch.",
      toolRequests: [{ tool: "run_source_semantic_index_batch", input: null }]
    };
  }

  if (mentionsSourceSemanticIndexing(normalized)) {
    return {
      content: "Vaultseer prepared native source semantic indexing.",
      toolRequests: [{ tool: "plan_source_semantic_index", input: null }]
    };
  }

  if (mentionsSemanticIndexing(normalized)) {
    return {
      content: "Vaultseer prepared the semantic indexing command.",
      toolRequests: [{ tool: "plan_semantic_index", input: null }]
    };
  }

  if (mentionsSemanticSearch(normalized)) {
    return {
      content: "Vaultseer prepared native semantic note search.",
      toolRequests: [{ tool: "semantic_search_notes", input: { query: message, limit: 8 } }]
    };
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
      toolRequests: [
        { tool: "inspect_current_note", input: null },
        { tool: "inspect_current_note_chunks", input: { limit: 8 } },
        { tool: "inspect_note_quality", input: null }
      ]
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

function mentionsActiveNoteRewriteProposal(message: string): boolean {
  return (
    /\b(rewrite|refactor|reformat|format|make|improve|polish|clean up|cleanup)\b.*\b(note|this note|current note|active note)\b/.test(
      message
    ) ||
    /\b(write|draft|create)\b.*\b(detailed|complete|full|new)\b.*\b(notes?|nores?)\b/.test(message) ||
    /\b(write|draft|create)\s+(a|an|the)\s+.*\b(notes?|nores?)\b.*\b(for|about|on)\b/.test(message) ||
    /\b(note|this note|current note|active note)\b.*\b(readable|refactored|reformatted|structured|headers?|subheaders?)\b/.test(
      message
    ) ||
    /\b(write|draft|create)\b.*\b(proposal|suggestions?|rewrite)\b.*\b(review writes|write review|review queue)\b/.test(
      message
    )
  );
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

function mentionsNoteIndexRebuild(message: string): boolean {
  return /\b(rebuild|refresh|update|run)\b.*\b(notes?|vault)?\s*index\b/.test(message) || /\bindex my notes\b/.test(message);
}

function mentionsCurrentNoteChunks(message: string): boolean {
  return /\b(show|inspect|list|check)\b.*\bchunks?\b.*\b(this note|current note|active note|note)\b/.test(message);
}

function mentionsSemanticSearch(message: string): boolean {
  return /\bsemantic search\b/.test(message) || /\b(find|search|show)\b.*\b(adjacent|similar|nearby|semantically related)\b.*\b(topics?|notes?)\b/.test(message);
}

function mentionsSourceSearch(message: string): boolean {
  return /\b(search|find|check|look)\b.*\b(sources?|literature|datasheets?|papers?|books?|presentations?)\b/.test(message);
}

function mentionsSemanticIndexing(message: string): boolean {
  return /\b(vectori[sz]e|semantic index|embedding|embeddings|chunk and vectori[sz]e)\b/.test(message);
}

function mentionsSourceSemanticIndexing(message: string): boolean {
  return (
    /\b(vectori[sz]e|semantic index|embedding|embeddings|chunk and vectori[sz]e)\b.*\b(sources?|source workspaces?|extracted sources?|literature|datasheets?|papers?|books?)\b/.test(
      message
    ) ||
    /\b(sources?|source workspaces?|extracted sources?|literature|datasheets?|papers?|books?)\b.*\b(vectori[sz]e|semantic index|embedding|embeddings|chunk and vectori[sz]e)\b/.test(
      message
    )
  );
}

function mentionsSourceSemanticIndexBatch(message: string): boolean {
  return (
    /\brun\b.*\b(source|sources|source semantic|extracted sources?)\b.*\b(semantic|embedding|embeddings|indexing)\b.*\bbatch\b/.test(
      message
    ) ||
    /\brun\b.*\b(source semantic indexing|source embedding)\s+batch\b/.test(message)
  );
}

function mentionsSourceExtraction(message: string): boolean {
  return /\b(extract|convert|import)\b.*\b(pdf|source|datasheet|paper|book|docx|presentation)\b/.test(message);
}

function mentionsPdfSourceExtractionBatch(message: string): boolean {
  return /\brun\b.*\b(pdf|source)\b.*\b(extraction|extract)\b.*\bbatch\b/.test(message);
}

function mentionsDraftSuggestions(message: string): boolean {
  return (
    /\bdraft\b.*\bsuggestions?\b/.test(message) ||
    /\bsuggest\b.*\b(tags?|links?|aliases?|formatting|format|cleanup|structure)\b/.test(message) ||
    /\b(organi[sz]e|clean up|polish)\b.*\b(this note|current note|active note|note)\b/.test(message)
  );
}

function mentionsActiveNoteWriteIntent(message: string): boolean {
  return (
    /\b(write|apply|use|stage|queue|save|replace)\b.*\b(this|it|draft|suggestion|rewrite|actual note|active note|current note)\b/.test(
      message
    ) ||
    /\b(write|apply|stage|queue|save|replace)\b.*\b(to|in|into)\b.*\b(actual note|active note|current note|note)\b/.test(
      message
    ) ||
    /\b(stage|queue)\b.*\b(review writes|write review|review queue)\b/.test(message)
  );
}

function mentionsDraftConfirmation(message: string): boolean {
  return (
    /^(yes|ok|okay|approved|accepted|looks good|sounds good)(,|\.)?\s*(proceed|go ahead|do it|stage it|queue it)?$/.test(
      message
    ) ||
    /^(proceed|go ahead|do it|stage it|queue it|make it so)$/.test(message)
  );
}

function mentionsVaultseerCapabilities(message: string): boolean {
  return (
    /\bwhat can you do\b/.test(message) ||
    /\bavailable (commands|actions|tools)\b/.test(message) ||
    /\bvaultseer (commands|actions|tools)\b/.test(message) ||
    /\b(do you have|have you got|can you use)\b.*\bvaultseer\b/.test(message) ||
    /\baccess\b.*\bvaultseer\b.*\b(commands|actions|tools)\b/.test(message)
  );
}

function mentionsHealthyNativeBridge(message: string): boolean {
  return (
    /\bvaultsee[rt]\b.*\bnative\b.*\bcodex\b.*\b(success|successful|healthy|ready|connected|working)\b/.test(
      message
    ) ||
    /\b(acp|native codex|native bridge|bridge|setup)\b.*\b(success|successful|healthy|ready|connected|working)\b/.test(
      message
    )
  );
}

function mentionsStageForReview(message: string): boolean {
  return /\b(stage|queue|prepare|propose)\b.*\b(review|approval|approve|suggestion|suggestions|tags?|links?)\b/.test(
    message
  );
}

function parseExplicitTagsToStage(message: string): string[] {
  const match = /\btags?\b\s*:?\s*(?<tags>.+)$/i.exec(message);
  const rawTags = match?.groups?.["tags"];
  if (!rawTags) {
    return [];
  }

  return uniqueStrings(
    rawTags
      .replace(/\b(for review|for approval|to review|please|now)\b.*$/i, "")
      .split(/[,;]/)
      .flatMap((part) => part.split(/\s+\band\b\s+/i))
      .map(cleanTag)
      .filter((tag) => tag.length > 0)
  );
}

function cleanTag(value: string): string {
  return value
    .trim()
    .replace(/^#+/, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/[.?!]+$/g, "")
    .trim();
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function isNonblank(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export type ExtractLastAssistantMarkdownSuggestionMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type BuildAssistantRequestedStageSuggestionInput = {
  content: string;
  activePath: string | null;
  allowUnfencedRewriteDraft?: boolean;
};

export function extractLastAssistantMarkdownSuggestion(
  messages: ExtractLastAssistantMarkdownSuggestionMessage[]
): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message === undefined || message.role !== "assistant") {
      continue;
    }

    const markdown = extractLastMarkdownFence(message.content);
    if (markdown !== null) {
      return markdown;
    }
  }

  return null;
}

export function extractLastAssistantStageableMarkdownSuggestion(
  messages: ExtractLastAssistantMarkdownSuggestionMessage[]
): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message === undefined || message.role !== "assistant" || !mentionsStageableAssistantDraft(message.content)) {
      continue;
    }

    const markdown = extractLastMarkdownFence(message.content) ?? extractLikelyUnfencedMarkdownNoteDraft(message.content);
    if (markdown !== null) {
      return markdown;
    }
  }

  return null;
}

export function buildAssistantRequestedStageSuggestion(
  input: BuildAssistantRequestedStageSuggestionInput
): CodexChatToolRequest | null {
  if (input.activePath === null) {
    return null;
  }

  const fencedMarkdown = extractLastMarkdownFence(input.content);
  const markdown = mentionsAssistantStageSuggestion(input.content)
    ? fencedMarkdown
    : input.allowUnfencedRewriteDraft === true
      ? fencedMarkdown ?? extractLikelyUnfencedMarkdownNoteDraft(input.content)
      : null;
  if (!isNonblank(markdown)) {
    return null;
  }

  return {
    tool: "stage_suggestion",
    input: {
      kind: "rewrite",
      targetPath: input.activePath,
      markdown: markdown.trim(),
      reason: mentionsAssistantStageSuggestion(input.content)
        ? "Assistant requested Vaultseer stage_suggestion for the active note."
        : "Assistant returned a stageable active-note draft during a rewrite or create-note task."
    }
  };
}

function extractLastMarkdownFence(content: string): string | null {
  const matches = [...content.matchAll(/```(?:markdown|md)?[ \t]*(?:\r?\n)?([\s\S]*?)```/gi)];
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const candidate = matches[index]?.[1]?.trim();
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function extractLikelyUnfencedMarkdownNoteDraft(content: string): string | null {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const startIndex = findLikelyMarkdownNoteStart(lines);
  if (startIndex < 0) {
    return null;
  }

  const draftLines: string[] = [];
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (index > startIndex && startsPostDraftInstruction(line)) {
      break;
    }

    draftLines.push(line);
  }

  const draft = draftLines.join("\n").trim();
  if (!looksLikeFullNoteDraft(draft)) {
    return null;
  }

  return draft;
}

function findLikelyMarkdownNoteStart(lines: string[]): number {
  return lines.findIndex((line, index) => {
    const trimmed = line.trim();
    if (/^#\s+\S/.test(trimmed)) {
      return true;
    }

    return (
      trimmed === "---" &&
      lines.slice(index + 1, index + 12).some((candidate) => /^#\s+\S/.test(candidate.trim()))
    );
  });
}

function startsPostDraftInstruction(line: string): boolean {
  return /^(if you want|once (it|this)|after (it|this)|tell me|please run|open the|you can now)\b/i.test(
    line.trim()
  );
}

function looksLikeFullNoteDraft(markdown: string): boolean {
  return /^#\s+\S/m.test(markdown) && markdown.length >= 60;
}

function mentionsAssistantStageSuggestion(content: string): boolean {
  return /\bstage_suggestion\b/i.test(content);
}

function mentionsStageableAssistantDraft(content: string): boolean {
  const normalized = normalize(content);
  return (
    /\bstage_suggestion\b/.test(normalized) ||
    /\b(stage|queue|approve|approval|review)\b.*\b(suggestion|proposal|draft|rewrite|write review|review queue)\b/.test(
      normalized
    ) ||
    /\bstage\b.*\b(for review|for approval|this)\b/.test(
      normalized
    )
  );
}

function chooseMarkdownDraftToStage(input: {
  message: string;
  lastAssistantMarkdownSuggestion?: string | null;
  lastAssistantStageableMarkdownSuggestion?: string | null;
}): string | null {
  if (mentionsActiveNoteWriteIntent(input.message)) {
    return input.lastAssistantMarkdownSuggestion ?? input.lastAssistantStageableMarkdownSuggestion ?? null;
  }

  if (mentionsDraftConfirmation(input.message)) {
    return input.lastAssistantStageableMarkdownSuggestion ?? null;
  }

  return null;
}

function buildVaultseerCapabilitiesMessage(): string {
  return [
    "Yes. Vaultseer commands are available in this chat.",
    "",
    "I can inspect the active note, search notes and extracted sources, queue indexing or extraction jobs, and stage guarded suggestions for your approval.",
    "Native agent tools include note search, semantic search, indexing, chunk inspection, and suggestion drafting.",
    "",
    buildVaultseerCommandListMessage(VAULTSEER_STUDIO_COMMAND_DEFINITIONS)
  ].join("\n");
}

function buildHealthyNativeBridgeMessage(): string {
  return [
    "Vaultseer-native setup is healthy.",
    "",
    "This chat is the control surface for Vaultseer: read-only inspections and searches can run before Codex answers, and write-like changes are staged for approval instead of being written directly.",
    "",
    "Useful examples: `review current note`, `search sources for timing claims`, `stage tags electronics, components`, or open the Commands menu for every Vaultseer action."
  ].join("\n");
}

function buildActiveNoteRewriteProposalAgentMessage(message: string): string {
  return [
    message,
    "",
    "Vaultseer active-note rewrite proposal task",
    "Use liveNote.text as the active note body even if indexed chunks are empty.",
    "If liveNote.text is empty or only a title/tags stub, create a useful first draft from the active note title, path, and available Vaultseer evidence.",
    "If the user asks for readability, formatting, headers, subheaders, cleanup, refactoring, or a write-review proposal, produce a complete replacement Markdown draft for the active note.",
    "When the draft is ready, request stage_suggestion with kind=rewrite, markdown set to the full replacement Markdown, and a concise reason.",
    "A successful answer for this task stages a proposal; do not end with only instructions for the user to copy, paste, or manually run stage_suggestion.",
    "Do not ask the user to run stage_suggestion, paste content manually, rebuild the index, or open another panel before staging the proposal.",
    "Do not apply the proposal directly. Vaultseer will stage it into the guarded review flow so the user can inspect the diff."
  ].join("\n");
}

function buildStageSuggestionProposalAgentMessage(message: string): string {
  return [
    message,
    "",
    "Vaultseer active-note staging task",
    "Create or refine the smallest useful active-note proposal that satisfies the user's request.",
    "Use liveNote.text as the active note body even if indexed chunks are empty.",
    "If the user refers to a prior draft, reuse that intent, but do not ask them to copy, paste, or manually run commands.",
    "If the request is broad or ambiguous, prefer a safe active-note rewrite or small cleanup proposal over stopping for exact tags or links.",
    "When the proposal is ready, request stage_suggestion with kind=rewrite, markdown set to the full replacement Markdown, and a concise reason.",
    "Do not ask the user to run stage_suggestion, rebuild the index, or open another panel before staging the proposal.",
    "Do not apply the proposal directly. Vaultseer will show the redline and wait for the user to press Write to note."
  ].join("\n");
}

function buildDraftSuggestionsAgentMessage(message: string): string {
  return [
    message,
    "",
    "Vaultseer draft-suggestions task",
    "Draft concise Vaultseer suggestions for the active note using the provided Vaultseer evidence.",
    "Return a short grouped answer with: tag suggestions, link suggestions, chunk/structure observations, and note cleanup or formatting suggestions.",
    "Each suggestion should include a reason or evidence reference from the active note, related notes, or source excerpts.",
    "Do not write directly. For specific tag or link changes that are ready to review, request stage_suggestion so Vaultseer Studio can show an approval card.",
    "Keep the first response compact and useful for a small personal Obsidian vault."
  ].join("\n");
}
