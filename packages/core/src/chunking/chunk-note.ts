import type { ChunkRecord } from "../storage/types";
import type { NoteRecordInput, NormalizedHeading } from "../types";
import { normalizeNoteRecord } from "../vault/normalize";

export type ChunkingOptions = {
  includeEmptySections?: boolean;
};

type SectionSeed = {
  headingPath: string[];
  lines: string[];
};

export function chunkVaultInputs(inputs: NoteRecordInput[], options: ChunkingOptions = {}): ChunkRecord[] {
  return [...inputs]
    .sort((left, right) => left.path.localeCompare(right.path))
    .flatMap((input) => chunkNoteInput(input, options));
}

export function chunkNoteInput(input: NoteRecordInput, options: ChunkingOptions = {}): ChunkRecord[] {
  const note = normalizeNoteRecord(input);
  const sections = createSectionSeeds(note.title, input.content, note.headings, options);
  const seenOrdinals = new Map<string, number>();
  const chunks: ChunkRecord[] = [];

  for (const section of sections) {
    for (const text of partitionIntoBlocks(section.lines)) {
      const normalizedTextHash = hashString(normalizeTextForHash(text));
      const ordinalKey = `${input.path}\n${section.headingPath.join("\u001f")}\n${normalizedTextHash}`;
      const ordinal = seenOrdinals.get(ordinalKey) ?? 0;
      seenOrdinals.set(ordinalKey, ordinal + 1);

      chunks.push({
        id: createChunkId(ordinalKey, ordinal),
        notePath: input.path,
        headingPath: section.headingPath,
        normalizedTextHash,
        ordinal,
        text
      });
    }
  }

  return chunks;
}

function createSectionSeeds(
  title: string,
  content: string,
  headings: NormalizedHeading[],
  options: ChunkingOptions
): SectionSeed[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const positionedHeadings = headings
    .filter((heading) => Number.isInteger(heading.position?.line))
    .sort((left, right) => left.position!.line - right.position!.line);

  if (positionedHeadings.length === 0) {
    return [{ headingPath: [title], lines }];
  }

  const sections: SectionSeed[] = [];
  const firstHeadingLine = positionedHeadings[0]!.position!.line;
  if (firstHeadingLine > 0 || options.includeEmptySections) {
    sections.push({
      headingPath: [title],
      lines: lines.slice(0, Math.max(0, firstHeadingLine))
    });
  }

  for (let index = 0; index < positionedHeadings.length; index += 1) {
    const heading = positionedHeadings[index]!;
    const nextHeading = positionedHeadings[index + 1];
    const startLine = clampLine(heading.position!.line + 1, lines.length);
    const endLine = nextHeading ? clampLine(nextHeading.position!.line, lines.length) : lines.length;

    sections.push({
      headingPath: [title, ...heading.path],
      lines: lines.slice(startLine, endLine)
    });
  }

  return sections.filter((section) => options.includeEmptySections || section.lines.some((line) => line.trim().length > 0));
}

function clampLine(line: number, lineCount: number): number {
  return Math.max(0, Math.min(line, lineCount));
}

function partitionIntoBlocks(lines: string[]): string[] {
  const blocks: string[] = [];
  let currentLines: string[] = [];
  let inCodeFence = false;

  const flush = (): void => {
    const value = currentLines.join("\n").trim();
    if (value) {
      blocks.push(value);
    }
    currentLines = [];
  };

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inCodeFence = !inCodeFence;
      currentLines.push(line);
      continue;
    }

    if (!inCodeFence && line.trim() === "") {
      flush();
      continue;
    }

    currentLines.push(line);
  }

  flush();
  return blocks;
}

function createChunkId(ordinalKey: string, ordinal: number): string {
  return `chunk:${hashString(ordinal === 0 ? ordinalKey : `${ordinalKey}\n${ordinal}`)}`;
}

function normalizeTextForHash(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

function hashString(value: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}
