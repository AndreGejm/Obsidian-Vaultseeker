import type { ChunkRecord } from "../storage/types";
import type { NoteRecord } from "../types";
import type { ActiveNoteContextPacket } from "./types";

export type BuildActiveNoteContextPacketInput = {
  activePath: string | null;
  notes: NoteRecord[];
  chunks: ChunkRecord[];
  relatedNotes: Array<{ path: string; title: string; reason: string }>;
  sourceExcerpts: Array<{ sourceId: string; sourcePath: string; chunkId: string; text: string; evidenceLabel: string }>;
  maxChunkCharacters?: number;
};

export function buildActiveNoteContextPacket(input: BuildActiveNoteContextPacketInput): ActiveNoteContextPacket {
  if (!input.activePath) {
    return blocked("Open a Markdown note before chatting with Vaultseer.");
  }

  const note = input.notes.find((candidate) => candidate.path === input.activePath);
  if (!note) {
    return blocked("The active note is not indexed. Rebuild the Vaultseer index before using note-aware chat.");
  }

  return {
    status: "ready",
    message: "Active note context is ready.",
    note: {
      path: note.path,
      title: note.title,
      aliases: note.aliases,
      tags: note.tags,
      headings: note.headings.map((heading) => heading.heading),
      links: note.links.map((link) => link.raw)
    },
    noteChunks: input.chunks
      .filter((chunk) => chunk.notePath === note.path)
      .map((chunk) => ({
        chunkId: chunk.id,
        headingPath: chunk.headingPath,
        text: truncate(chunk.text, input.maxChunkCharacters ?? 1200)
      })),
    relatedNotes: input.relatedNotes.slice(0, 8),
    sourceExcerpts: input.sourceExcerpts.slice(0, 8).map((excerpt) => ({
      ...excerpt,
      text: truncate(excerpt.text, input.maxChunkCharacters ?? 1200)
    }))
  };
}

function blocked(message: string): ActiveNoteContextPacket {
  return {
    status: "blocked",
    message,
    note: null,
    noteChunks: [],
    relatedNotes: [],
    sourceExcerpts: []
  };
}

function truncate(value: string, maxCharacters: number): string {
  if (maxCharacters <= 0) return "";
  if (value.length <= maxCharacters) return value;
  if (maxCharacters <= 3) return ".".repeat(maxCharacters);
  return `${value.slice(0, maxCharacters - 3).trimEnd()}...`;
}
