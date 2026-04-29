import {
  createStableChunkId,
  hashString,
  normalizeTextForHash,
  partitionIntoBlocks
} from "../chunking/text-chunking";
import type { SourceChunkRecord, SourceRecord } from "./types";

export type SourceChunkingOptions = {
  includeEmptySections?: boolean;
};

type SourceSectionSeed = {
  sectionPath: string[];
  lines: string[];
};

type MarkdownHeading = {
  level: number;
  heading: string;
  line: number;
  path: string[];
};

export function chunkSourceRecords(
  sources: SourceRecord[],
  options: SourceChunkingOptions = {}
): SourceChunkRecord[] {
  return [...sources]
    .sort((left, right) => left.sourcePath.localeCompare(right.sourcePath))
    .flatMap((source) => chunkSourceRecord(source, options));
}

export function chunkSourceRecord(
  source: SourceRecord,
  options: SourceChunkingOptions = {}
): SourceChunkRecord[] {
  if (source.status !== "extracted") return [];

  const sections = createSourceSectionSeeds(source, options);
  const seenOrdinals = new Map<string, number>();
  const chunks: SourceChunkRecord[] = [];

  for (const section of sections) {
    for (const text of partitionIntoBlocks(section.lines)) {
      const normalizedTextHash = hashString(normalizeTextForHash(text));
      const ordinalKey = `${source.id}\n${section.sectionPath.join("\u001f")}\n${normalizedTextHash}`;
      const ordinal = seenOrdinals.get(ordinalKey) ?? 0;
      seenOrdinals.set(ordinalKey, ordinal + 1);

      chunks.push({
        id: createStableChunkId("source-chunk", ordinalKey, ordinal),
        sourceId: source.id,
        sourcePath: source.sourcePath,
        sectionPath: section.sectionPath,
        normalizedTextHash,
        ordinal,
        text,
        provenance: {
          kind: "section",
          sectionPath: section.sectionPath
        }
      });
    }
  }

  return chunks;
}

function createSourceSectionSeeds(source: SourceRecord, options: SourceChunkingOptions): SourceSectionSeed[] {
  const lines = source.extractedMarkdown.replace(/\r\n/g, "\n").split("\n");
  const headings = extractMarkdownHeadings(lines);

  if (headings.length === 0) {
    return [{ sectionPath: [source.filename], lines }];
  }

  const sections: SourceSectionSeed[] = [];
  const firstHeadingLine = headings[0]!.line;
  if (firstHeadingLine > 0 || options.includeEmptySections) {
    sections.push({
      sectionPath: [source.filename],
      lines: lines.slice(0, Math.max(0, firstHeadingLine))
    });
  }

  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index]!;
    const nextHeading = headings[index + 1];
    const startLine = clampLine(heading.line + 1, lines.length);
    const endLine = nextHeading ? clampLine(nextHeading.line, lines.length) : lines.length;

    sections.push({
      sectionPath: heading.path,
      lines: lines.slice(startLine, endLine)
    });
  }

  return sections.filter((section) => options.includeEmptySections || section.lines.some((line) => line.trim().length > 0));
}

function extractMarkdownHeadings(lines: string[]): MarkdownHeading[] {
  const headings: MarkdownHeading[] = [];
  const stack: Array<{ level: number; heading: string }> = [];
  let inCodeFence = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (/^\s*```/.test(line)) {
      inCodeFence = !inCodeFence;
      continue;
    }

    if (inCodeFence) continue;

    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (!match) continue;

    const level = match[1]!.length;
    const heading = normalizeHeading(match[2]!);
    if (!heading) continue;

    while (stack.length > 0 && stack[stack.length - 1]!.level >= level) {
      stack.pop();
    }

    stack.push({ level, heading });
    headings.push({
      level,
      heading,
      line: index,
      path: stack.map((item) => item.heading)
    });
  }

  return headings;
}

function normalizeHeading(value: string): string {
  return value.replace(/\s+#+\s*$/u, "").trim();
}

function clampLine(line: number, lineCount: number): number {
  return Math.max(0, Math.min(line, lineCount));
}
