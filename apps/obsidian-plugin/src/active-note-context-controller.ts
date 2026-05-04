import {
  buildActiveNoteContextPacket,
  chunkNoteInput,
  normalizeNoteRecord,
  type ActiveNoteContextPacket,
  type ChunkRecord,
  type NoteRecord,
  type NoteRecordInput,
  type VaultseerStore
} from "@vaultseer/core";

const DEFAULT_MAX_LIVE_NOTE_CHARACTERS = 12_000;

export type BuildActiveNoteContextFromStoreInput = {
  store: VaultseerStore;
  activePath: string | null;
  readActiveNoteInput?: (path: string) => Promise<NoteRecordInput | null>;
  maxLiveNoteCharacters?: number;
};

export async function buildActiveNoteContextFromStore(
  input: BuildActiveNoteContextFromStoreInput
): Promise<ActiveNoteContextPacket> {
  const [notes, chunks] = await Promise.all([input.store.getNoteRecords(), input.store.getChunkRecords()]);
  const liveInput = await readLiveActiveNoteInput(input);
  const liveNote = liveInput === null ? null : normalizeNoteRecord(liveInput);
  const liveChunks = liveInput === null ? [] : createLiveChunks(liveInput);
  const contextNotes = liveNote === null ? notes : upsertActiveNote(notes, liveNote);
  const contextChunks = liveNote === null ? chunks : upsertActiveNoteChunks(chunks, liveNote.path, liveChunks);

  const packet = buildActiveNoteContextPacket({
    activePath: input.activePath,
    notes: contextNotes,
    chunks: contextChunks,
    relatedNotes: [],
    sourceExcerpts: []
  });

  if (liveInput === null || liveNote === null || packet.status !== "ready") {
    return packet;
  }

  return {
    ...packet,
    message: "Active note context is ready from the open Obsidian note.",
    liveNote: {
      source: "active_file",
      contentHash: liveNote.contentHash,
      ...boundLiveNoteText(liveInput.content, input.maxLiveNoteCharacters)
    }
  };
}

async function readLiveActiveNoteInput(input: BuildActiveNoteContextFromStoreInput): Promise<NoteRecordInput | null> {
  if (!input.activePath || input.readActiveNoteInput === undefined) {
    return null;
  }

  try {
    const liveInput = await input.readActiveNoteInput(input.activePath);
    if (liveInput === null || liveInput.path !== input.activePath) {
      return null;
    }

    return liveInput;
  } catch {
    return null;
  }
}

function createLiveChunks(input: NoteRecordInput): ChunkRecord[] {
  return chunkNoteInput(input).map((chunk) => ({
    ...chunk,
    id: chunk.id.startsWith("chunk:") ? chunk.id.replace(/^chunk:/, "live-chunk:") : `live-${chunk.id}`
  }));
}

function upsertActiveNote(notes: NoteRecord[], liveNote: NoteRecord): NoteRecord[] {
  return [...notes.filter((note) => note.path !== liveNote.path), liveNote];
}

function upsertActiveNoteChunks(chunks: ChunkRecord[], activePath: string, liveChunks: ChunkRecord[]): ChunkRecord[] {
  return [...chunks.filter((chunk) => chunk.notePath !== activePath), ...liveChunks];
}

function boundLiveNoteText(content: string, maxCharacters = DEFAULT_MAX_LIVE_NOTE_CHARACTERS): {
  text: string;
  truncated: boolean;
} {
  const limit = Math.max(0, Math.floor(maxCharacters));
  if (content.length <= limit) {
    return { text: content, truncated: false };
  }

  return {
    text: content.slice(0, limit).trimEnd(),
    truncated: true
  };
}
