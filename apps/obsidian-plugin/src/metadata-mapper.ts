import type { HeadingInput, LinkInput, NoteRecordInput, SourcePosition } from "@vaultseer/core";

export type ObsidianLikeFile = {
  path: string;
  basename: string;
  stat: {
    ctime: number;
    mtime: number;
    size: number;
  };
};

export type ObsidianLikeCache = {
  frontmatter?: Record<string, unknown>;
  tags?: Array<{
    tag: string;
    position?: ObsidianLikePosition;
  }>;
  links?: Array<{
    link: string;
    original?: string;
    displayText?: string;
    position?: ObsidianLikePosition;
  }>;
  headings?: Array<{
    heading: string;
    level: number;
    position?: ObsidianLikePosition;
  }>;
};

type ObsidianLikePosition = {
  start?: {
    line: number;
    col?: number;
  };
};

export function mapObsidianFileToNoteInput(
  file: ObsidianLikeFile,
  content: string,
  cache: ObsidianLikeCache | null | undefined
): NoteRecordInput {
  const frontmatter = cache?.frontmatter ?? {};

  return {
    path: file.path,
    basename: file.basename,
    content,
    stat: { ...file.stat },
    metadata: {
      frontmatter,
      tags: (cache?.tags ?? []).map((tag) => tag.tag),
      aliases: extractAliases(frontmatter),
      links: (cache?.links ?? []).map(mapLink),
      headings: (cache?.headings ?? []).map(mapHeading)
    }
  };
}

function mapLink(link: NonNullable<ObsidianLikeCache["links"]>[number]): LinkInput {
  const target = splitTarget(link.link);
  const mapped: LinkInput = {
    raw: link.original ?? link.link,
    target: target.path
  };

  if (target.heading) mapped.heading = target.heading;
  if (link.displayText) mapped.displayText = link.displayText;

  const position = mapPosition(link.position);
  if (position) mapped.position = position;

  return mapped;
}

function mapHeading(heading: NonNullable<ObsidianLikeCache["headings"]>[number]): HeadingInput {
  const mapped: HeadingInput = {
    heading: heading.heading,
    level: heading.level
  };

  const position = mapPosition(heading.position);
  if (position) mapped.position = position;

  return mapped;
}

function mapPosition(position: ObsidianLikePosition | undefined): SourcePosition | undefined {
  if (!position?.start) return undefined;

  const mapped: SourcePosition = {
    line: position.start.line
  };

  if (typeof position.start.col === "number") {
    mapped.column = position.start.col;
  }

  return mapped;
}

function splitTarget(rawTarget: string): { path: string; heading?: string } {
  const [path, heading] = rawTarget.split("#", 2);
  const trimmedPath = (path ?? rawTarget).trim();
  const trimmedHeading = heading?.trim();

  return trimmedHeading ? { path: trimmedPath, heading: trimmedHeading } : { path: trimmedPath };
}

function extractAliases(frontmatter: Record<string, unknown>): string[] {
  return [...stringValues(frontmatter["aliases"]), ...stringValues(frontmatter["alias"])];
}

function stringValues(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => stringValues(item));
  }

  return [];
}

