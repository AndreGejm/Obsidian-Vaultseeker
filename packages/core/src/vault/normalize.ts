import type { HeadingInput, LinkInput, NormalizedHeading, NoteRecord, NoteRecordInput } from "../types";

export function normalizeNoteRecord(input: NoteRecordInput): NoteRecord {
  const frontmatter = input.metadata?.frontmatter ?? {};

  return {
    path: input.path,
    basename: input.basename,
    title: normalizeTitle(input.basename, frontmatter),
    contentHash: stableHash(input.content),
    stat: { ...input.stat },
    frontmatter: { ...frontmatter },
    tags: normalizeTags([
      ...extractFrontmatterTags(frontmatter),
      ...(input.metadata?.tags ?? [])
    ]),
    aliases: normalizeAliases(frontmatter, input.metadata?.aliases ?? []),
    links: normalizeLinks(input.metadata?.links ?? []),
    headings: normalizeHeadings(input.metadata?.headings ?? [])
  };
}

function normalizeTitle(basename: string, frontmatter: Record<string, unknown>): string {
  const title = frontmatter["title"];
  return typeof title === "string" && title.trim().length > 0 ? title.trim() : basename;
}

function extractFrontmatterTags(frontmatter: Record<string, unknown>): string[] {
  const values = [frontmatter["tags"], frontmatter["tag"]];
  return values.flatMap((value) => stringValues(value));
}

function normalizeTags(rawTags: string[]): string[] {
  const tags = new Set<string>();

  for (const rawTag of rawTags) {
    const cleaned = rawTag
      .trim()
      .replace(/^#+/, "")
      .replace(/^\/+|\/+$/g, "")
      .toLowerCase();

    if (!cleaned) continue;

    const parts = cleaned.split("/").filter(Boolean);
    for (let index = 1; index <= parts.length; index += 1) {
      tags.add(parts.slice(0, index).join("/"));
    }
  }

  return [...tags].sort((a, b) => a.localeCompare(b));
}

function normalizeAliases(frontmatter: Record<string, unknown>, adapterAliases: string[]): string[] {
  const aliases = [
    ...adapterAliases,
    ...stringValues(frontmatter["aliases"]),
    ...stringValues(frontmatter["alias"])
  ];

  return [...new Set(aliases.map((alias) => alias.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function normalizeLinks(links: LinkInput[]): LinkInput[] {
  return links
    .filter((link) => link.target.trim().length > 0)
    .map((link) => ({ ...link, target: link.target.trim() }));
}

function normalizeHeadings(headings: HeadingInput[]): NormalizedHeading[] {
  const stack: Array<{ level: number; heading: string }> = [];

  return headings.map((heading) => {
    while (stack.length > 0 && stack[stack.length - 1]!.level >= heading.level) {
      stack.pop();
    }

    stack.push({ level: heading.level, heading: heading.heading });

    return {
      ...heading,
      path: stack.map((item) => item.heading)
    };
  });
}

function stringValues(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => stringValues(item));
  }

  return [];
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

