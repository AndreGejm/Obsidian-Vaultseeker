export type ActiveNoteContextStatus = "ready" | "blocked";

export type ActiveNoteContextPacket = {
  status: ActiveNoteContextStatus;
  message: string;
  note: {
    path: string;
    title: string;
    aliases: string[];
    tags: string[];
    headings: string[];
    links: string[];
  } | null;
  noteChunks: Array<{
    chunkId: string;
    headingPath: string[];
    text: string;
  }>;
  relatedNotes: Array<{
    path: string;
    title: string;
    reason: string;
  }>;
  sourceExcerpts: Array<{
    sourceId: string;
    sourcePath: string;
    chunkId: string;
    text: string;
    evidenceLabel: string;
  }>;
};
