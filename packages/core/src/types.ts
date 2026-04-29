export type NoteStat = {
  ctime: number;
  mtime: number;
  size: number;
};

export type SourcePosition = {
  line: number;
  column?: number;
};

export type LinkInput = {
  raw: string;
  target: string;
  heading?: string;
  displayText?: string;
  position?: SourcePosition;
};

export type HeadingInput = {
  level: number;
  heading: string;
  position?: SourcePosition;
};

export type AdapterMetadata = {
  frontmatter?: Record<string, unknown>;
  tags?: string[];
  links?: LinkInput[];
  headings?: HeadingInput[];
  aliases?: string[];
};

export type NoteRecordInput = {
  path: string;
  basename: string;
  content: string;
  stat: NoteStat;
  metadata?: AdapterMetadata;
};

export type NormalizedHeading = HeadingInput & {
  path: string[];
};

export type NoteRecord = {
  path: string;
  basename: string;
  title: string;
  contentHash: string;
  stat: NoteStat;
  frontmatter: Record<string, unknown>;
  tags: string[];
  aliases: string[];
  links: LinkInput[];
  headings: NormalizedHeading[];
};

export type VaultSnapshot = {
  notes: NoteRecord[];
  notesByPath: Record<string, NoteRecord>;
  notePathsByTag: Record<string, string[]>;
  outgoingLinksByPath: Record<string, string[]>;
};

