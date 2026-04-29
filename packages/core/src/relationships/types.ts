import type { LinkInput } from "../types";

export type ResolvedLink = LinkInput & {
  targetPath: string;
};

export type TagCoOccurrence = {
  tag: string;
  count: number;
};

export type TagStat = {
  tag: string;
  noteCount: number;
  notePaths: string[];
  latestMtime: number;
  coTags: TagCoOccurrence[];
};

export type RelationshipGraph = {
  resolvedLinksByPath: Record<string, ResolvedLink[]>;
  unresolvedLinksByPath: Record<string, LinkInput[]>;
  backlinksByPath: Record<string, string[]>;
  tagStats: TagStat[];
  tagStatsByTag: Record<string, TagStat>;
  orphanNotePaths: string[];
  weaklyConnectedNotePaths: string[];
};

