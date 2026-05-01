import type { RelationshipGraph } from "../relationships/types";
import type { NoteRecord } from "../types";

export type NoteQualityIssueKind =
  | "missing_frontmatter_field"
  | "duplicate_alias"
  | "empty_title"
  | "malformed_tag"
  | "broken_internal_link";

export type NoteQualityIssueSeverity = "low" | "medium";

export type NoteQualityIssueEvidence =
  | { type: "frontmatter_field"; field: string }
  | { type: "alias_value"; alias: string }
  | { type: "tag_value"; tag: string }
  | { type: "unresolved_link"; raw: string; target: string };

export type NoteQualityIssue = {
  id: string;
  kind: NoteQualityIssueKind;
  severity: NoteQualityIssueSeverity;
  message: string;
  evidence: NoteQualityIssueEvidence[];
};

export type DetectNoteQualityIssuesInput = {
  currentNote: NoteRecord;
  graph?: RelationshipGraph;
};

export function detectNoteQualityIssues(input: DetectNoteQualityIssuesInput): NoteQualityIssue[] {
  return [
    ...detectMissingFrontmatterFields(input.currentNote),
    ...detectEmptyTitle(input.currentNote),
    ...detectDuplicateAliases(input.currentNote),
    ...detectMalformedTags(input.currentNote),
    ...detectBrokenInternalLinks(input)
  ].sort(compareIssues);
}

function detectMissingFrontmatterFields(note: NoteRecord): NoteQualityIssue[] {
  if (hasFrontmatterField(note.frontmatter, "tags") || hasFrontmatterField(note.frontmatter, "tag") || note.tags.length > 0) {
    return [];
  }

  return [
    {
      id: "missing_frontmatter_field:tags",
      kind: "missing_frontmatter_field",
      severity: "low",
      message: "This note has no frontmatter tags field.",
      evidence: [{ type: "frontmatter_field", field: "tags" }]
    }
  ];
}

function detectEmptyTitle(note: NoteRecord): NoteQualityIssue[] {
  if (note.title.trim().length > 0) return [];

  return [
    {
      id: "empty_title",
      kind: "empty_title",
      severity: "medium",
      message: "This note has no usable title.",
      evidence: []
    }
  ];
}

function detectDuplicateAliases(note: NoteRecord): NoteQualityIssue[] {
  const aliases = frontmatterAliasValues(note);
  const values = aliases.length > 0 ? aliases : note.aliases;
  const aliasesByKey = new Map<string, string[]>();

  for (const alias of values) {
    const key = normalizeComparableText(alias);
    if (!key) continue;
    aliasesByKey.set(key, [...(aliasesByKey.get(key) ?? []), alias]);
  }

  return [...aliasesByKey.entries()]
    .filter(([, duplicateAliases]) => duplicateAliases.length > 1)
    .map(([key, duplicateAliases]) => ({
      id: `duplicate_alias:${key}`,
      kind: "duplicate_alias" as const,
      severity: "low" as const,
      message: `This note repeats the alias "${duplicateAliases[0]}".`,
      evidence: duplicateAliases.map((alias) => ({ type: "alias_value" as const, alias }))
    }));
}

function detectMalformedTags(note: NoteRecord): NoteQualityIssue[] {
  return frontmatterTagValues(note)
    .filter((tag) => !isValidTag(tag))
    .map((tag) => ({
      id: `malformed_tag:${tag.trim()}`,
      kind: "malformed_tag" as const,
      severity: "medium" as const,
      message: `This note has a malformed tag: ${tag.trim()}.`,
      evidence: [{ type: "tag_value" as const, tag }]
    }));
}

function detectBrokenInternalLinks(input: DetectNoteQualityIssuesInput): NoteQualityIssue[] {
  const unresolvedLinks = input.graph?.unresolvedLinksByPath[input.currentNote.path] ?? [];

  return unresolvedLinks.map((link) => ({
    id: `broken_internal_link:${link.target}`,
    kind: "broken_internal_link" as const,
    severity: "medium" as const,
    message: `This note has an unresolved internal link: ${link.target}.`,
    evidence: [{ type: "unresolved_link" as const, raw: link.raw, target: link.target }]
  }));
}

function frontmatterTagValues(note: NoteRecord): string[] {
  return [
    ...stringValues(note.frontmatter["tags"]),
    ...stringValues(note.frontmatter["tag"])
  ];
}

function frontmatterAliasValues(note: NoteRecord): string[] {
  return [
    ...stringValues(note.frontmatter["aliases"]),
    ...stringValues(note.frontmatter["alias"])
  ];
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

function hasFrontmatterField(frontmatter: Record<string, unknown>, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(frontmatter, field);
}

function isValidTag(value: string): boolean {
  const tag = value.trim().replace(/^#+/, "");
  if (!tag || /\s/.test(tag) || tag.startsWith("/") || tag.endsWith("/") || tag.includes("//")) return false;
  return /^[\p{L}\p{N}][\p{L}\p{N}/_-]*$/u.test(tag);
}

function normalizeComparableText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function compareIssues(left: NoteQualityIssue, right: NoteQualityIssue): number {
  return severityRank(right.severity) - severityRank(left.severity) || left.id.localeCompare(right.id);
}

function severityRank(severity: NoteQualityIssueSeverity): number {
  switch (severity) {
    case "medium":
      return 2;
    case "low":
      return 1;
  }
}
