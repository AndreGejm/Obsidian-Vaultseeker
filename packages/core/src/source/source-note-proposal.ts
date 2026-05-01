import type { NoteRecord } from "../types";
import type { SourceChunkRecord, SourceRecord } from "./types";

export type SourceNoteProposalEvidence =
  | { type: "source_title"; value: string }
  | { type: "source_filename"; value: string }
  | { type: "source_section"; chunkId: string; sectionPath: string[] }
  | { type: "source_excerpt"; chunkId: string; text: string }
  | { type: "source_term_match"; chunkId: string | null; matchedTerms: string[]; tag?: string; notePath?: string }
  | { type: "note_title_match"; notePath: string; matchedText: string }
  | { type: "note_alias_match"; notePath: string; matchedText: string };

export type SourceNoteProposalTag = {
  tag: string;
  score: number;
  confidence: number;
  evidence: SourceNoteProposalEvidence[];
  reason: string;
};

export type SourceNoteProposalLink = {
  notePath: string;
  title: string;
  linkText: string;
  score: number;
  confidence: number;
  evidence: SourceNoteProposalEvidence[];
  reason: string;
};

export type SourceNoteProposalRelatedNote = {
  notePath: string;
  title: string;
  score: number;
  confidence: number;
  evidence: SourceNoteProposalEvidence[];
  reason: string;
};

export type SourceNoteProposalHeading = {
  heading: string;
  sourceSectionPath: string[];
  evidence: SourceNoteProposalEvidence[];
};

export type SourceNoteProposal = {
  sourceId: string;
  sourcePath: string;
  sourceContentHash: string;
  title: string;
  summary: string;
  aliases: string[];
  outlineHeadings: SourceNoteProposalHeading[];
  suggestedTags: SourceNoteProposalTag[];
  suggestedLinks: SourceNoteProposalLink[];
  relatedNotes: SourceNoteProposalRelatedNote[];
  markdownPreview: string;
  evidence: SourceNoteProposalEvidence[];
};

export type ProposeSourceNoteInput = {
  source: SourceRecord;
  sourceChunks: SourceChunkRecord[];
  notes: NoteRecord[];
  limits?: Partial<{
    tags: number;
    links: number;
    relatedNotes: number;
    outlineHeadings: number;
  }>;
};

type NoteScore = {
  note: NoteRecord;
  score: number;
  evidence: SourceNoteProposalEvidence[];
  evidenceKeys: Set<string>;
};

type TagScore = {
  tag: string;
  score: number;
  evidence: SourceNoteProposalEvidence[];
  evidenceKeys: Set<string>;
};

const DEFAULT_TAG_LIMIT = 6;
const DEFAULT_LINK_LIMIT = 6;
const DEFAULT_RELATED_NOTE_LIMIT = 6;
const DEFAULT_OUTLINE_HEADING_LIMIT = 8;
const TITLE_MATCH_SCORE = 40;
const ALIAS_MATCH_SCORE = 36;
const NOTE_TOKEN_SCORE = 4;
const TAG_TOKEN_SCORE = 6;

export function proposeSourceNote(input: ProposeSourceNoteInput): SourceNoteProposal | null {
  if (input.source.status !== "extracted") return null;

  const sourceChunks = input.sourceChunks
    .map((chunk, inputOrder) => ({ chunk, inputOrder }))
    .filter((entry) => entry.chunk.sourceId === input.source.id)
    .sort((left, right) => left.chunk.ordinal - right.chunk.ordinal || left.inputOrder - right.inputOrder)
    .map((entry) => entry.chunk);
  const title = inferTitle(input.source, sourceChunks);
  const aliases = inferAliases(input.source, title);
  const summary = inferSummary(input.source, sourceChunks);
  const outlineHeadings = inferOutlineHeadings(sourceChunks, title, input.limits?.outlineHeadings ?? DEFAULT_OUTLINE_HEADING_LIMIT);
  const sourceText = buildSourceSearchText(input.source, sourceChunks);
  const sourceTokens = new Set(tokenize(sourceText));
  const noteScores = scoreNotesAgainstSource(input.notes, sourceChunks, sourceText, sourceTokens);
  const suggestedTags = suggestSourceTags({
    notes: input.notes,
    sourceChunks,
    sourceTokens,
    noteScores,
    limit: input.limits?.tags ?? DEFAULT_TAG_LIMIT
  });
  const suggestedLinks = noteScores
    .filter((score) => score.evidence.some((item) => item.type === "note_title_match" || item.type === "note_alias_match"))
    .map(toLinkSuggestion)
    .sort(compareScoredSuggestions)
    .slice(0, input.limits?.links ?? DEFAULT_LINK_LIMIT);
  const relatedNotes = noteScores
    .map(toRelatedNote)
    .sort(compareScoredSuggestions)
    .slice(0, input.limits?.relatedNotes ?? DEFAULT_RELATED_NOTE_LIMIT);

  return {
    sourceId: input.source.id,
    sourcePath: input.source.sourcePath,
    sourceContentHash: input.source.contentHash,
    title,
    summary,
    aliases,
    outlineHeadings,
    suggestedTags,
    suggestedLinks,
    relatedNotes,
    markdownPreview: buildMarkdownPreview({
      source: input.source,
      title,
      summary,
      aliases,
      outlineHeadings,
      suggestedTags,
      suggestedLinks
    }),
    evidence: [
      { type: "source_title", value: title },
      { type: "source_filename", value: input.source.filename },
      ...(summary ? sourceExcerptEvidence(sourceChunks) : [])
    ]
  };
}

function inferTitle(source: SourceRecord, sourceChunks: SourceChunkRecord[]): string {
  const markdownTitle = firstMarkdownHeading(source.extractedMarkdown);
  if (markdownTitle) return markdownTitle;

  const firstSectionTitle = sourceChunks.find((chunk) => chunk.sectionPath.length > 0)?.sectionPath[0];
  if (firstSectionTitle) return firstSectionTitle;

  return titleFromFilename(source.filename);
}

function firstMarkdownHeading(markdown: string): string | null {
  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(/^#\s+(.+)$/);
    if (match?.[1]) return cleanInlineMarkdown(match[1]);
  }

  return null;
}

function inferAliases(source: SourceRecord, title: string): string[] {
  const filenameAlias = stripExtension(source.filename);
  if (!filenameAlias || normalizeComparableText(filenameAlias) === normalizeComparableText(title)) return [];
  return [filenameAlias];
}

function inferSummary(source: SourceRecord, sourceChunks: SourceChunkRecord[]): string {
  const firstChunkText = sourceChunks.find((chunk) => chunk.text.trim().length > 0)?.text ?? "";
  const text = firstChunkText || source.extractedMarkdown.replace(/^#.*$/gm, " ");
  return firstSentences(text, 2, 320);
}

function inferOutlineHeadings(sourceChunks: SourceChunkRecord[], title: string, limit: number): SourceNoteProposalHeading[] {
  const headings = new Map<string, SourceNoteProposalHeading>();
  const normalizedTitle = normalizeComparableText(title);

  for (const chunk of sourceChunks) {
    const sourceSectionPath = chunk.sectionPath;
    if (sourceSectionPath.length === 0) continue;
    const candidateHeading = sourceSectionPath[sourceSectionPath.length - 1];
    if (!candidateHeading || normalizeComparableText(candidateHeading) === normalizedTitle) continue;

    const key = sourceSectionPath.join("\u001f");
    if (headings.has(key)) continue;
    headings.set(key, {
      heading: candidateHeading,
      sourceSectionPath: [...sourceSectionPath],
      evidence: [{ type: "source_section", chunkId: chunk.id, sectionPath: [...sourceSectionPath] }]
    });
  }

  return [...headings.values()].slice(0, limit);
}

function suggestSourceTags(input: {
  notes: NoteRecord[];
  sourceChunks: SourceChunkRecord[];
  sourceTokens: Set<string>;
  noteScores: NoteScore[];
  limit: number;
}): SourceNoteProposalTag[] {
  const tags = new Map<string, TagScore>();
  const tagCounts = new Map<string, number>();

  for (const note of input.notes) {
    for (const tag of note.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }

  for (const [tag, noteCount] of tagCounts) {
    const tagTerms = tokenizeTag(tag);
    const matchedTerms = tagTerms.filter((term) => input.sourceTokens.has(term));
    if (matchedTerms.length === 0 || (tagTerms.length > 1 && matchedTerms.length < tagTerms.length)) continue;

    const chunk = findChunkWithAnyTerm(input.sourceChunks, matchedTerms);
    const score = matchedTerms.length * TAG_TOKEN_SCORE + Math.min(noteCount, 4);
    addTagEvidence(tags, tag, score, {
      type: "source_term_match",
      chunkId: chunk?.id ?? null,
      matchedTerms,
      tag
    });
  }

  for (const noteScore of input.noteScores) {
    const hasStrongNoteMatch = noteScore.evidence.some((item) => item.type === "note_title_match" || item.type === "note_alias_match");
    if (!hasStrongNoteMatch) continue;

    for (const tag of noteScore.note.tags) {
      const tagTerms = tokenizeTag(tag);
      const matchedTerms = tagTerms.filter((term) => input.sourceTokens.has(term));
      if (matchedTerms.length === 0) continue;

      const chunk = findChunkWithAnyTerm(input.sourceChunks, matchedTerms);
      addTagEvidence(tags, tag, matchedTerms.length * TAG_TOKEN_SCORE + Math.min(noteScore.score / 10, 6), {
        type: "source_term_match",
        chunkId: chunk?.id ?? null,
        matchedTerms,
        tag,
        notePath: noteScore.note.path
      });
    }
  }

  return [...tags.values()]
    .map((tag) => ({
      tag: tag.tag,
      score: roundScore(tag.score),
      confidence: confidence(tag.score, 16),
      evidence: sortEvidence(tag.evidence),
      reason: formatReason(sortEvidence(tag.evidence))
    }))
    .sort(compareScoredSuggestions)
    .slice(0, input.limit);
}

function scoreNotesAgainstSource(
  notes: NoteRecord[],
  sourceChunks: SourceChunkRecord[],
  sourceText: string,
  sourceTokens: Set<string>
): NoteScore[] {
  const normalizedSourceText = normalizeComparableText(sourceText);
  const scores = new Map<string, NoteScore>();

  for (const note of notes) {
    const titleMatches = phraseAppearsInSource(note.title, normalizedSourceText);
    if (titleMatches) {
      addNoteEvidence(scores, note, TITLE_MATCH_SCORE, {
        type: "note_title_match",
        notePath: note.path,
        matchedText: note.title
      });
    }

    for (const alias of note.aliases) {
      if (!phraseAppearsInSource(alias, normalizedSourceText)) continue;
      addNoteEvidence(scores, note, ALIAS_MATCH_SCORE, {
        type: "note_alias_match",
        notePath: note.path,
        matchedText: alias
      });
    }

    const noteTokens = new Set([
      ...tokenize(note.title),
      ...tokenize(note.basename),
      ...note.aliases.flatMap(tokenize),
      ...note.tags.flatMap(tokenizeTag)
    ]);
    const matchedTerms = [...noteTokens].filter((term) => sourceTokens.has(term)).sort((left, right) => left.localeCompare(right));
    if (matchedTerms.length > 0) {
      const chunk = findChunkWithAnyTerm(sourceChunks, matchedTerms);
      addNoteEvidence(scores, note, matchedTerms.length * NOTE_TOKEN_SCORE, {
        type: "source_term_match",
        chunkId: chunk?.id ?? null,
        matchedTerms,
        notePath: note.path
      });
    }
  }

  return [...scores.values()].filter((score) => score.score > 0);
}

function toLinkSuggestion(score: NoteScore): SourceNoteProposalLink {
  const roundedScore = roundScore(score.score);
  return {
    notePath: score.note.path,
    title: score.note.title,
    linkText: score.note.title || score.note.basename,
    score: roundedScore,
    confidence: confidence(score.score, 24),
    evidence: sortEvidence(score.evidence),
    reason: formatReason(sortEvidence(score.evidence))
  };
}

function toRelatedNote(score: NoteScore): SourceNoteProposalRelatedNote {
  const roundedScore = roundScore(score.score);
  return {
    notePath: score.note.path,
    title: score.note.title,
    score: roundedScore,
    confidence: confidence(score.score, 24),
    evidence: sortEvidence(score.evidence),
    reason: formatReason(sortEvidence(score.evidence))
  };
}

function addTagEvidence(
  tags: Map<string, TagScore>,
  tag: string,
  score: number,
  evidence: SourceNoteProposalEvidence
): void {
  const current = tags.get(tag) ?? { tag, score: 0, evidence: [], evidenceKeys: new Set<string>() };
  current.score += score;
  const key = evidenceKey(evidence);
  if (!current.evidenceKeys.has(key)) {
    current.evidenceKeys.add(key);
    current.evidence.push(evidence);
  }
  tags.set(tag, current);
}

function addNoteEvidence(
  scores: Map<string, NoteScore>,
  note: NoteRecord,
  score: number,
  evidence: SourceNoteProposalEvidence
): void {
  const current = scores.get(note.path) ?? { note, score: 0, evidence: [], evidenceKeys: new Set<string>() };
  current.score += score;
  const key = evidenceKey(evidence);
  if (!current.evidenceKeys.has(key)) {
    current.evidenceKeys.add(key);
    current.evidence.push(evidence);
  }
  scores.set(note.path, current);
}

function buildMarkdownPreview(input: {
  source: SourceRecord;
  title: string;
  summary: string;
  aliases: string[];
  outlineHeadings: SourceNoteProposalHeading[];
  suggestedTags: SourceNoteProposalTag[];
  suggestedLinks: SourceNoteProposalLink[];
}): string {
  const lines: string[] = ["---", `title: ${input.title}`];
  if (input.aliases.length > 0) {
    lines.push("aliases:");
    for (const alias of input.aliases) lines.push(`  - ${alias}`);
  }
  if (input.suggestedTags.length > 0) {
    lines.push("tags:");
    for (const tag of input.suggestedTags) lines.push(`  - ${tag.tag}`);
  }
  lines.push("---", "", `# ${input.title}`, "", `> Source: ${input.source.sourcePath}`, "");

  if (input.summary) {
    lines.push("## Summary", "", input.summary, "");
  }

  if (input.suggestedLinks.length > 0) {
    lines.push("## Related Notes", "");
    for (const link of input.suggestedLinks) {
      lines.push(`- [[${formatWikiTarget(link.notePath)}|${link.linkText}]]`);
    }
    lines.push("");
  }

  if (input.outlineHeadings.length > 0) {
    lines.push("## Outline", "");
    for (const heading of input.outlineHeadings) {
      lines.push(`### ${heading.heading}`, "", "<!-- Review source evidence before writing this section. -->", "");
    }
  }

  return lines.join("\n").trimEnd() + "\n";
}

function sourceExcerptEvidence(sourceChunks: SourceChunkRecord[]): SourceNoteProposalEvidence[] {
  const chunk = sourceChunks.find((candidate) => candidate.text.trim().length > 0);
  if (!chunk) return [];
  return [{ type: "source_excerpt", chunkId: chunk.id, text: firstSentences(chunk.text, 1, 180) }];
}

function buildSourceSearchText(source: SourceRecord, sourceChunks: SourceChunkRecord[]): string {
  return [
    source.filename,
    source.sourcePath,
    firstMarkdownHeading(source.extractedMarkdown) ?? "",
    ...sourceChunks.flatMap((chunk) => [...chunk.sectionPath, chunk.text])
  ].join(" ");
}

function findChunkWithAnyTerm(sourceChunks: SourceChunkRecord[], terms: string[]): SourceChunkRecord | null {
  for (const chunk of sourceChunks) {
    const chunkTokens = new Set([...chunk.sectionPath.flatMap(tokenize), ...tokenize(chunk.text)]);
    if (terms.some((term) => chunkTokens.has(term))) return chunk;
  }

  return null;
}

function phraseAppearsInSource(value: string, normalizedSourceText: string): boolean {
  const normalized = normalizeComparableText(value);
  if (!normalized || normalized.length < 3) return false;
  return normalizedSourceText.includes(normalized);
}

function tokenizeTag(tag: string): string[] {
  return [...new Set(tag.split("/").flatMap(tokenize).filter((term) => term.length >= 3))];
}

function tokenize(value: string): string[] {
  return [
    ...new Set(
      normalizeComparableText(value)
        .split(" ")
        .filter((token) => token.length >= 3)
    )
  ];
}

function normalizeComparableText(value: string): string {
  return value
    .replace(/\.md$/i, "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function firstSentences(value: string, sentenceLimit: number, characterLimit: number): string {
  const normalized = cleanInlineMarkdown(value).replace(/\s+/g, " ").trim();
  if (!normalized) return "";

  const sentences = normalized.match(/[^.!?]+[.!?]+(?=\s|$)/g) ?? [];
  const summary = (sentences.length > 0 ? sentences.slice(0, sentenceLimit).join(" ") : normalized).trim();
  if (summary.length <= characterLimit) return summary;
  return `${summary.slice(0, characterLimit).replace(/\s+\S*$/, "").trim()}...`;
}

function cleanInlineMarkdown(value: string): string {
  return value
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[`*_>#~-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleFromFilename(filename: string): string {
  const stem = stripExtension(filename);
  const words = stem.split(/[-_\s]+/).filter(Boolean);
  if (words.length === 0) return stem || filename;
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function stripExtension(filename: string): string {
  return filename.replace(/\.[^.]+$/, "");
}

function formatWikiTarget(notePath: string): string {
  return notePath.replace(/\.md$/i, "");
}

function confidence(score: number, scale: number): number {
  return roundScore(Math.min(0.95, score / (score + scale)));
}

function compareScoredSuggestions<T extends { score: number } & ({ tag: string } | { notePath: string })>(left: T, right: T): number {
  const leftKey = "tag" in left ? left.tag : left.notePath;
  const rightKey = "tag" in right ? right.tag : right.notePath;
  return right.score - left.score || leftKey.localeCompare(rightKey);
}

function sortEvidence(evidence: SourceNoteProposalEvidence[]): SourceNoteProposalEvidence[] {
  return [...evidence].sort((left, right) => evidenceKey(left).localeCompare(evidenceKey(right)));
}

function evidenceKey(evidence: SourceNoteProposalEvidence): string {
  switch (evidence.type) {
    case "source_title":
    case "source_filename":
      return `${evidence.type}\u001f${evidence.value}`;
    case "source_section":
      return `${evidence.type}\u001f${evidence.chunkId}\u001f${evidence.sectionPath.join("/")}`;
    case "source_excerpt":
      return `${evidence.type}\u001f${evidence.chunkId}\u001f${evidence.text}`;
    case "source_term_match":
      return `${evidence.type}\u001f${evidence.chunkId ?? ""}\u001f${evidence.tag ?? ""}\u001f${evidence.notePath ?? ""}\u001f${evidence.matchedTerms.join(" ")}`;
    case "note_title_match":
    case "note_alias_match":
      return `${evidence.type}\u001f${evidence.notePath}\u001f${evidence.matchedText}`;
  }
}

function formatReason(evidence: SourceNoteProposalEvidence[]): string {
  const parts = evidence.map((item) => {
    switch (item.type) {
      case "source_title":
        return `source title ${item.value}`;
      case "source_filename":
        return `source filename ${item.value}`;
      case "source_section":
        return `source section ${item.sectionPath.join(" > ")}`;
      case "source_excerpt":
        return `source excerpt ${item.chunkId}`;
      case "source_term_match":
        return `matched source terms ${item.matchedTerms.join(", ")}`;
      case "note_title_match":
        return `note title ${item.matchedText}`;
      case "note_alias_match":
        return `note alias ${item.matchedText}`;
    }
  });

  return [...new Set(parts)].join("; ");
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}
