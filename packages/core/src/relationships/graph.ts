import type { LinkInput, NoteRecord, VaultSnapshot } from "../types";
import type { RelationshipGraph, ResolvedLink, TagCoOccurrence, TagStat } from "./types";

export function buildRelationshipGraph(snapshot: VaultSnapshot): RelationshipGraph {
  const notePaths = snapshot.notes.map((note) => note.path);
  const pathResolver = createPathResolver(snapshot.notes);
  const resolvedLinksByPath = createEmptyLinkLookup<ResolvedLink>(notePaths);
  const unresolvedLinksByPath = createEmptyLinkLookup<LinkInput>(notePaths);
  const backlinksByPath = createEmptyPathLookup(notePaths);

  for (const note of snapshot.notes) {
    for (const link of note.links) {
      const targetPath = pathResolver(link.target);

      if (!targetPath) {
        unresolvedLinksByPath[note.path]!.push(link);
        continue;
      }

      const resolvedLink = { ...link, targetPath };
      resolvedLinksByPath[note.path]!.push(resolvedLink);
      backlinksByPath[targetPath]!.push(note.path);
    }
  }

  sortLookupValues(resolvedLinksByPath, compareResolvedLinks);
  sortLookupValues(unresolvedLinksByPath, compareLinks);
  sortLookupValues(backlinksByPath, (left, right) => left.localeCompare(right));

  const tagStats = buildTagStats(snapshot.notes);
  const tagStatsByTag = Object.fromEntries(tagStats.map((stat) => [stat.tag, stat]));
  const orphanNotePaths = findOrphanNotePaths(snapshot.notes, resolvedLinksByPath, backlinksByPath);
  const weaklyConnectedNotePaths = findWeaklyConnectedNotePaths(snapshot.notes, resolvedLinksByPath, backlinksByPath);

  return {
    resolvedLinksByPath,
    unresolvedLinksByPath,
    backlinksByPath,
    tagStats,
    tagStatsByTag,
    orphanNotePaths,
    weaklyConnectedNotePaths
  };
}

function createPathResolver(notes: NoteRecord[]): (target: string) => string | undefined {
  const candidates = new Map<string, string>();

  for (const note of notes) {
    addCandidate(candidates, note.path, note.path);
    addCandidate(candidates, stripMarkdownExtension(note.path), note.path);
    addCandidate(candidates, note.basename, note.path);
  }

  return (target) => {
    const normalizedTarget = stripMarkdownExtension(target.trim());
    return candidates.get(normalizedTarget) ?? candidates.get(`${normalizedTarget}.md`);
  };
}

function addCandidate(candidates: Map<string, string>, key: string, path: string): void {
  if (!key || candidates.has(key)) return;
  candidates.set(key, path);
}

function stripMarkdownExtension(path: string): string {
  return path.endsWith(".md") ? path.slice(0, -3) : path;
}

function createEmptyLinkLookup<T>(paths: string[]): Record<string, T[]> {
  return Object.fromEntries(paths.map((path) => [path, []]));
}

function createEmptyPathLookup(paths: string[]): Record<string, string[]> {
  return Object.fromEntries(paths.map((path) => [path, []]));
}

function sortLookupValues<T>(lookup: Record<string, T[]>, compare: (left: T, right: T) => number): void {
  for (const values of Object.values(lookup)) {
    values.sort(compare);
  }
}

function compareResolvedLinks(left: ResolvedLink, right: ResolvedLink): number {
  return left.targetPath.localeCompare(right.targetPath) || compareLinks(left, right);
}

function compareLinks(left: LinkInput, right: LinkInput): number {
  return left.target.localeCompare(right.target) || left.raw.localeCompare(right.raw);
}

function buildTagStats(notes: NoteRecord[]): TagStat[] {
  const pathsByTag = new Map<string, Set<string>>();
  const latestMtimeByTag = new Map<string, number>();
  const coCountsByTag = new Map<string, Map<string, number>>();

  for (const note of notes) {
    const tags = [...new Set(note.tags)].sort((left, right) => left.localeCompare(right));

    for (const tag of tags) {
      pathsByTag.set(tag, pathsByTag.get(tag) ?? new Set<string>());
      pathsByTag.get(tag)!.add(note.path);
      latestMtimeByTag.set(tag, Math.max(latestMtimeByTag.get(tag) ?? 0, note.stat.mtime));

      const coCounts = coCountsByTag.get(tag) ?? new Map<string, number>();
      for (const otherTag of tags) {
        if (otherTag === tag) continue;
        coCounts.set(otherTag, (coCounts.get(otherTag) ?? 0) + 1);
      }
      coCountsByTag.set(tag, coCounts);
    }
  }

  return [...pathsByTag.entries()]
    .map(([tag, paths]) => ({
      tag,
      noteCount: paths.size,
      notePaths: [...paths].sort((left, right) => left.localeCompare(right)),
      latestMtime: latestMtimeByTag.get(tag) ?? 0,
      coTags: buildCoTags(coCountsByTag.get(tag) ?? new Map<string, number>())
    }))
    .sort((left, right) => right.noteCount - left.noteCount || left.tag.localeCompare(right.tag));
}

function buildCoTags(coCounts: Map<string, number>): TagCoOccurrence[] {
  return [...coCounts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag));
}

function findOrphanNotePaths(
  notes: NoteRecord[],
  resolvedLinksByPath: Record<string, ResolvedLink[]>,
  backlinksByPath: Record<string, string[]>
): string[] {
  return notes
    .filter((note) => resolvedLinksByPath[note.path]!.length === 0 && backlinksByPath[note.path]!.length === 0)
    .map((note) => note.path)
    .sort((left, right) => left.localeCompare(right));
}

function findWeaklyConnectedNotePaths(
  notes: NoteRecord[],
  resolvedLinksByPath: Record<string, ResolvedLink[]>,
  backlinksByPath: Record<string, string[]>
): string[] {
  return notes
    .filter((note) => {
      const connectionCount = resolvedLinksByPath[note.path]!.length + backlinksByPath[note.path]!.length;
      return connectionCount === 0;
    })
    .map((note) => note.path)
    .sort((left, right) => left.localeCompare(right));
}
