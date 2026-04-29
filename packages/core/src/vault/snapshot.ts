import type { NoteRecord, NoteRecordInput, VaultSnapshot } from "../types";
import { normalizeNoteRecord } from "./normalize";

export function buildVaultSnapshot(inputs: NoteRecordInput[]): VaultSnapshot {
  const notes = inputs.map((input) => normalizeNoteRecord(input)).sort(compareByPath);
  const notesByPath = Object.fromEntries(notes.map((note) => [note.path, note]));
  const notePathsByTag = buildTagLookup(notes);
  const outgoingLinksByPath = Object.fromEntries(
    notes.map((note) => [note.path, [...new Set(note.links.map((link) => link.target))].sort()])
  );

  return {
    notes,
    notesByPath,
    notePathsByTag,
    outgoingLinksByPath
  };
}

function buildTagLookup(notes: NoteRecord[]): Record<string, string[]> {
  const lookup: Record<string, string[]> = {};

  for (const note of notes) {
    for (const tag of note.tags) {
      lookup[tag] ??= [];
      lookup[tag].push(note.path);
    }
  }

  return Object.fromEntries(
    Object.entries(lookup)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([tag, paths]) => [tag, paths.sort()])
  );
}

function compareByPath(left: NoteRecord, right: NoteRecord): number {
  return left.path.localeCompare(right.path);
}

