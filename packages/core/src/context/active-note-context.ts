import type { ChunkRecord } from "../storage/types";
import type { NoteRecord } from "../types";
import type { ActiveNoteContextPacket } from "./types";

const DEFAULT_MAX_NOTE_CHUNKS = 8;
const DEFAULT_MAX_METADATA_ITEMS = 32;
const DEFAULT_MAX_RELATED_NOTES = 8;
const DEFAULT_MAX_SOURCE_EXCERPTS = 8;
const DEFAULT_MAX_CHUNK_CHARACTERS = 1200;
const DEFAULT_MAX_FIELD_CHARACTERS = 240;

export type BuildActiveNoteContextPacketInput = {
  activePath: string | null;
  notes: NoteRecord[];
  chunks: ChunkRecord[];
  relatedNotes: Array<{ path: string; title: string; reason: string }>;
  sourceExcerpts: Array<{ sourceId: string; sourcePath: string; chunkId: string; text: string; evidenceLabel: string }>;
  maxChunkCharacters?: number;
  maxNoteChunks?: number;
  maxMetadataItems?: number;
  maxRelatedNotes?: number;
  maxSourceExcerpts?: number;
  maxFieldCharacters?: number;
};

export function buildActiveNoteContextPacket(input: BuildActiveNoteContextPacketInput): ActiveNoteContextPacket {
  if (!input.activePath) {
    return blocked("Open a Markdown note before chatting with Vaultseer.");
  }

  const note = input.notes.find((candidate) => candidate.path === input.activePath);
  if (!note) {
    return blocked("The active note is not indexed. Rebuild the Vaultseer index before using note-aware chat.");
  }

  const maxChunkCharacters = normalizeLimit(input.maxChunkCharacters, DEFAULT_MAX_CHUNK_CHARACTERS);
  const maxNoteChunks = normalizeLimit(input.maxNoteChunks, DEFAULT_MAX_NOTE_CHUNKS);
  const maxMetadataItems = normalizeLimit(input.maxMetadataItems, DEFAULT_MAX_METADATA_ITEMS);
  const maxRelatedNotes = normalizeLimit(input.maxRelatedNotes, DEFAULT_MAX_RELATED_NOTES);
  const maxSourceExcerpts = normalizeLimit(input.maxSourceExcerpts, DEFAULT_MAX_SOURCE_EXCERPTS);
  const maxFieldCharacters = normalizeLimit(input.maxFieldCharacters, DEFAULT_MAX_FIELD_CHARACTERS);

  return {
    status: "ready",
    message: "Active note context is ready.",
    note: {
      path: truncate(note.path, maxFieldCharacters),
      title: truncate(note.title, maxFieldCharacters),
      aliases: note.aliases.slice(0, maxMetadataItems).map((alias) => truncate(alias, maxFieldCharacters)),
      tags: note.tags.slice(0, maxMetadataItems).map((tag) => truncate(tag, maxFieldCharacters)),
      headings: note.headings.slice(0, maxMetadataItems).map((heading) => truncate(heading.heading, maxFieldCharacters)),
      links: note.links.slice(0, maxMetadataItems).map((link) => truncate(link.raw, maxFieldCharacters))
    },
    noteChunks: input.chunks
      .filter((chunk) => chunk.notePath === note.path)
      .slice(0, maxNoteChunks)
      .map((chunk) => ({
        chunkId: truncate(chunk.id, maxFieldCharacters),
        headingPath: chunk.headingPath.map((segment) => truncate(segment, maxFieldCharacters)),
        text: truncate(chunk.text, maxChunkCharacters)
      })),
    relatedNotes: input.relatedNotes.slice(0, maxRelatedNotes).map((relatedNote) => ({
      path: truncate(relatedNote.path, maxFieldCharacters),
      title: truncate(relatedNote.title, maxFieldCharacters),
      reason: truncate(relatedNote.reason, maxFieldCharacters)
    })),
    sourceExcerpts: input.sourceExcerpts.slice(0, maxSourceExcerpts).map((excerpt) => ({
      sourceId: truncate(excerpt.sourceId, maxFieldCharacters),
      sourcePath: truncate(excerpt.sourcePath, maxFieldCharacters),
      chunkId: truncate(excerpt.chunkId, maxFieldCharacters),
      text: truncate(excerpt.text, maxChunkCharacters),
      evidenceLabel: truncate(excerpt.evidenceLabel, maxFieldCharacters)
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

function normalizeLimit(value: number | undefined, defaultValue: number): number {
  if (value === undefined || !Number.isFinite(value)) return defaultValue;
  return Math.max(0, Math.floor(value));
}

function truncate(value: string, maxCharacters: number): string {
  if (maxCharacters <= 0) return "";
  if (value.length <= maxCharacters) return value;
  if (maxCharacters <= 3) return ".".repeat(maxCharacters);
  return `${value.slice(0, maxCharacters - 3).trimEnd()}...`;
}
