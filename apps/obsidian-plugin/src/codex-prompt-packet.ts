import type { ActiveNoteContextPacket } from "@vaultseer/core";

const DEFAULT_MAX_CONTEXT_CHARACTERS = 12_000;
const TRUNCATION_MARKER = "\n[truncated]";

export type CodexPromptPacket = {
  displayContent: string;
  agentContent: string;
  contextSummary: CodexPromptPacketContextSummary;
};

export type CodexPromptPacketContextSummary = {
  notePath: string | null;
  noteTitle: string | null;
  tagCount: number;
  aliasCount: number;
  headingCount: number;
  linkCount: number;
  noteChunkCount: number;
  relatedNoteCount: number;
  sourceExcerptCount: number;
  truncated: boolean;
};

export type BuildCodexPromptPacketInput = {
  message: string;
  context: ActiveNoteContextPacket;
  maxContextCharacters?: number;
};

export function buildCodexPromptPacket(input: BuildCodexPromptPacketInput): CodexPromptPacket {
  const { message, context } = input;

  if (context.status !== "ready") {
    throw new Error("Cannot build Codex prompt packet from blocked active note context.");
  }

  const maxContextCharacters = normalizeMaxContextCharacters(input.maxContextCharacters);
  const contextBody = buildContextBody(context);
  const summaryBase = buildContextSummary(context);
  const fixedPrefix = [
    "Vaultseer Codex Prompt Packet",
    "",
    "Vaultseer Instruction",
    "Obsidian is the source of truth. Codex may inspect, search, propose, and stage suggestions through Vaultseer-controlled tools, but must not write files directly.",
    ""
  ].join("\n");
  const userMessageSection = ["", "User Message", message].join("\n");
  const availableContextCharacters = maxContextCharacters - fixedPrefix.length - userMessageSection.length - 2;
  const boundedContext = boundText(contextBody, availableContextCharacters);
  const agentContent = [fixedPrefix, boundedContext.text, userMessageSection]
    .filter((part) => part.length > 0)
    .join("\n");

  return {
    displayContent: message,
    agentContent,
    contextSummary: {
      ...summaryBase,
      truncated: boundedContext.truncated || agentContent.length > maxContextCharacters
    }
  };
}

function buildContextSummary(context: ActiveNoteContextPacket): Omit<CodexPromptPacketContextSummary, "truncated"> {
  return {
    notePath: context.note?.path ?? null,
    noteTitle: context.note?.title ?? null,
    tagCount: context.note?.tags.length ?? 0,
    aliasCount: context.note?.aliases.length ?? 0,
    headingCount: context.note?.headings.length ?? 0,
    linkCount: context.note?.links.length ?? 0,
    noteChunkCount: context.noteChunks.length,
    relatedNoteCount: context.relatedNotes.length,
    sourceExcerptCount: context.sourceExcerpts.length
  };
}

function buildContextBody(context: ActiveNoteContextPacket): string {
  return [
    buildCurrentNoteSection(context),
    buildNoteChunksSection(context),
    buildRelatedNotesSection(context),
    buildSourceExcerptsSection(context)
  ].join("\n\n");
}

function buildCurrentNoteSection(context: ActiveNoteContextPacket): string {
  if (!context.note) {
    return ["Current Note", "None"].join("\n");
  }

  return [
    "Current Note",
    `Path: ${context.note.path}`,
    `Title: ${context.note.title}`,
    `Tags: ${formatList(context.note.tags)}`,
    `Aliases: ${formatList(context.note.aliases)}`,
    `Headings: ${formatList(context.note.headings)}`,
    `Links: ${formatList(context.note.links)}`
  ].join("\n");
}

function buildNoteChunksSection(context: ActiveNoteContextPacket): string {
  const lines = ["Note Chunks"];

  if (context.noteChunks.length === 0) {
    lines.push("None");
    return lines.join("\n");
  }

  for (const chunk of context.noteChunks) {
    lines.push(
      `[note-chunk:${chunk.chunkId}]`,
      `Heading Path: ${formatList(chunk.headingPath)}`,
      chunk.text
    );
  }

  return lines.join("\n");
}

function buildRelatedNotesSection(context: ActiveNoteContextPacket): string {
  const lines = ["Related Notes"];

  if (context.relatedNotes.length === 0) {
    lines.push("None");
    return lines.join("\n");
  }

  context.relatedNotes.forEach((note, index) => {
    lines.push(
      `[related-note:${index + 1}]`,
      `Path: ${note.path}`,
      `Title: ${note.title}`,
      `Reason: ${note.reason}`
    );
  });

  return lines.join("\n");
}

function buildSourceExcerptsSection(context: ActiveNoteContextPacket): string {
  const lines = ["Source Excerpts"];

  if (context.sourceExcerpts.length === 0) {
    lines.push("None");
    return lines.join("\n");
  }

  for (const excerpt of context.sourceExcerpts) {
    lines.push(
      `[source-excerpt:${excerpt.sourceId}#${excerpt.chunkId}]`,
      `Source Path: ${excerpt.sourcePath}`,
      `Evidence Label: ${excerpt.evidenceLabel}`,
      excerpt.text
    );
  }

  return lines.join("\n");
}

function formatList(values: string[]): string {
  return values.length === 0 ? "None" : values.join(", ");
}

function normalizeMaxContextCharacters(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return DEFAULT_MAX_CONTEXT_CHARACTERS;
  }

  return Math.max(1, Math.floor(value));
}

function boundText(value: string, maxCharacters: number): { text: string; truncated: boolean } {
  if (maxCharacters <= 0) {
    return { text: TRUNCATION_MARKER.trimStart(), truncated: true };
  }

  if (value.length <= maxCharacters) {
    return { text: value, truncated: false };
  }

  const available = Math.max(0, maxCharacters - TRUNCATION_MARKER.length);

  return {
    text: `${value.slice(0, available).trimEnd()}${TRUNCATION_MARKER}`,
    truncated: true
  };
}
