import {
  buildActiveNoteContextPacket,
  type ActiveNoteContextPacket,
  type VaultseerStore
} from "@vaultseer/core";

export type BuildActiveNoteContextFromStoreInput = {
  store: VaultseerStore;
  activePath: string | null;
};

export async function buildActiveNoteContextFromStore(
  input: BuildActiveNoteContextFromStoreInput
): Promise<ActiveNoteContextPacket> {
  const [notes, chunks] = await Promise.all([input.store.getNoteRecords(), input.store.getChunkRecords()]);

  return buildActiveNoteContextPacket({
    activePath: input.activePath,
    notes,
    chunks,
    relatedNotes: [],
    sourceExcerpts: []
  });
}
