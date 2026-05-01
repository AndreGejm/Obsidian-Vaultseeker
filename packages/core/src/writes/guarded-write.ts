import { hashString } from "../chunking/text-chunking";
import type { SourceNoteProposal } from "../source/source-note-proposal";

export type VaultWriteOperationType = "create_note_from_source" | "update_note_tags" | "update_note_links";

export type VaultWritePreview = {
  kind: "create_file" | "modify_file";
  targetPath: string;
  beforeHash: string | null;
  afterHash: string;
  diff: string;
  additions: number;
  deletions: number;
};

export type SourceNoteCreationOperation = {
  id: string;
  type: "create_note_from_source";
  targetPath: string;
  expectedCurrentHash: string | null;
  content: string;
  preview: VaultWritePreview;
  source: {
    sourceId: string;
    sourcePath: string;
    sourceContentHash: string;
  };
  suggestionIds: string[];
  createdAt: string;
};

export type NoteTagUpdateOperation = {
  id: string;
  type: "update_note_tags";
  targetPath: string;
  expectedCurrentHash: string;
  content: string;
  preview: VaultWritePreview;
  tagUpdate: {
    beforeTags: string[];
    afterTags: string[];
    addedTags: string[];
    removedTags: string[];
  };
  suggestionIds: string[];
  createdAt: string;
};

export type NoteLinkUpdateReplacementInput = {
  rawLink: string;
  unresolvedTarget: string;
  suggestedPath: string;
};

export type NoteLinkUpdateReplacement = NoteLinkUpdateReplacementInput & {
  replacement: string;
};

export type NoteLinkUpdateOperation = {
  id: string;
  type: "update_note_links";
  targetPath: string;
  expectedCurrentHash: string;
  content: string;
  preview: VaultWritePreview;
  linkUpdate: {
    replacements: NoteLinkUpdateReplacement[];
  };
  suggestionIds: string[];
  createdAt: string;
};

export type GuardedVaultWriteOperation = SourceNoteCreationOperation | NoteTagUpdateOperation | NoteLinkUpdateOperation;

export type PlanSourceNoteCreationOperationInput = {
  proposal: SourceNoteProposal;
  targetPath: string;
  suggestionIds: string[];
  createdAt: string;
};

export type PlanNoteTagUpdateOperationInput = {
  targetPath: string;
  currentContent: string;
  tagsToAdd: string[];
  suggestionIds: string[];
  createdAt: string;
};

export type PlanNoteLinkUpdateOperationInput = {
  targetPath: string;
  currentContent: string;
  replacements: NoteLinkUpdateReplacementInput[];
  suggestionIds: string[];
  createdAt: string;
};

export type VaultWriteCurrentSnapshot = {
  path: string;
  currentHash: string | null;
};

export type VaultWritePreconditionReason =
  | "wrong_target"
  | "target_exists"
  | "missing_parent_folder"
  | "missing_file"
  | "stale_file";

export type VaultWritePreconditionResult =
  | { ok: true }
  | {
      ok: false;
      reason: VaultWritePreconditionReason;
      expectedCurrentHash: string | null;
      actualCurrentHash: string | null;
    };

export type VaultWriteDecision = "approved" | "rejected" | "deferred";

export type VaultWriteDecisionRecord = {
  operationId: string;
  decision: VaultWriteDecision;
  targetPath: string;
  suggestionIds: string[];
  decidedAt: string;
};

export type CreateVaultWriteDecisionRecordInput = {
  operation: GuardedVaultWriteOperation;
  decision: VaultWriteDecision;
  decidedAt: string;
};

export type VaultWriteApproval = {
  operationId: string;
  targetPath: string;
  expectedCurrentHash: string | null;
  afterHash: string;
  approvedAt: string;
};

export type VaultWriteDryRunResult = {
  operation: GuardedVaultWriteOperation;
  precondition: VaultWritePreconditionResult;
  preview: VaultWritePreview;
};

export type VaultWriteApplyResult = {
  operationId: string;
  targetPath: string;
  beforeHash: string | null;
  afterHash: string;
  appliedAt: string;
};

export type VaultWriteApplyFailureStage = "precondition" | "write" | "unknown";

export type VaultWriteApplySuccessRecord = VaultWriteApplyResult & {
  status: "applied";
};

export type VaultWriteApplyFailureRecord = {
  operationId: string;
  status: "failed";
  targetPath: string;
  stage: VaultWriteApplyFailureStage;
  expectedCurrentHash: string | null;
  actualCurrentHash: string | null;
  message: string;
  retryable: boolean;
  failedAt: string;
};

export type VaultWriteApplyResultRecord = VaultWriteApplySuccessRecord | VaultWriteApplyFailureRecord;

export type CreateVaultWriteApplySuccessRecordInput = {
  operation: GuardedVaultWriteOperation;
  beforeHash: string | null;
  afterHash: string;
  appliedAt: string;
};

export type CreateVaultWriteApplyFailureRecordInput = {
  operation: GuardedVaultWriteOperation;
  stage: VaultWriteApplyFailureStage;
  expectedCurrentHash: string | null;
  actualCurrentHash: string | null;
  message: string;
  retryable: boolean;
  failedAt: string;
};

export interface VaultWritePort {
  dryRun(operation: GuardedVaultWriteOperation): Promise<VaultWriteDryRunResult>;
  apply(operation: GuardedVaultWriteOperation, approval: VaultWriteApproval): Promise<VaultWriteApplyResult>;
}

export function planSourceNoteCreationOperation(input: PlanSourceNoteCreationOperationInput): SourceNoteCreationOperation {
  const content = normalizeWriteContent(input.proposal.markdownPreview);
  const operationHash = hashString([input.proposal.sourceId, input.proposal.sourceContentHash, input.targetPath].join("\n"));

  return {
    id: `vault-write:create-note-from-source:${input.proposal.sourceId}:${operationHash}`,
    type: "create_note_from_source",
    targetPath: input.targetPath,
    expectedCurrentHash: null,
    content,
    preview: createFilePreview(input.targetPath, content),
    source: {
      sourceId: input.proposal.sourceId,
      sourcePath: input.proposal.sourcePath,
      sourceContentHash: input.proposal.sourceContentHash
    },
    suggestionIds: [...input.suggestionIds],
    createdAt: input.createdAt
  };
}

export function planNoteTagUpdateOperation(input: PlanNoteTagUpdateOperationInput): NoteTagUpdateOperation {
  const currentContent = normalizeWriteContent(input.currentContent);
  const beforeHash = hashString(currentContent);
  const beforeTags = extractFrontmatterTags(currentContent);
  const tagsToAdd = normalizeWritableTags(input.tagsToAdd);
  const afterTags = sortTags([...beforeTags, ...tagsToAdd]);
  const content = writeFrontmatterTags(currentContent, afterTags);
  const afterHash = hashString(content);
  const operationHash = hashString([input.targetPath, beforeHash, afterHash, ...input.suggestionIds].join("\n"));

  return {
    id: `vault-write:update-note-tags:${input.targetPath}:${operationHash}`,
    type: "update_note_tags",
    targetPath: input.targetPath,
    expectedCurrentHash: beforeHash,
    content,
    preview: modifyFilePreview(input.targetPath, currentContent, content),
    tagUpdate: {
      beforeTags,
      afterTags,
      addedTags: afterTags.filter((tag) => !beforeTags.includes(tag)),
      removedTags: beforeTags.filter((tag) => !afterTags.includes(tag))
    },
    suggestionIds: [...input.suggestionIds],
    createdAt: input.createdAt
  };
}

export function planNoteLinkUpdateOperation(input: PlanNoteLinkUpdateOperationInput): NoteLinkUpdateOperation {
  const currentContent = normalizeWriteContent(input.currentContent);
  const beforeHash = hashString(currentContent);
  let content = currentContent;
  const appliedReplacements: NoteLinkUpdateReplacement[] = [];
  const seenRawLinks = new Set<string>();

  for (const item of input.replacements) {
    const rawLink = item.rawLink.trim();
    if (!rawLink || seenRawLinks.has(rawLink) || !content.includes(rawLink)) continue;

    const displayText = readWikiLinkDisplayText(rawLink, item.unresolvedTarget);
    const replacement = formatWikiLinkReplacement(item.suggestedPath, displayText);
    if (replacement === rawLink) continue;

    content = content.split(rawLink).join(replacement);
    seenRawLinks.add(rawLink);
    appliedReplacements.push({
      rawLink,
      unresolvedTarget: item.unresolvedTarget,
      suggestedPath: item.suggestedPath,
      replacement
    });
  }

  const afterHash = hashString(content);
  const operationHash = hashString([
    input.targetPath,
    beforeHash,
    afterHash,
    ...appliedReplacements.map((item) => `${item.rawLink}->${item.replacement}`),
    ...input.suggestionIds
  ].join("\n"));

  return {
    id: `vault-write:update-note-links:${input.targetPath}:${operationHash}`,
    type: "update_note_links",
    targetPath: input.targetPath,
    expectedCurrentHash: beforeHash,
    content,
    preview: modifyFilePreview(input.targetPath, currentContent, content),
    linkUpdate: {
      replacements: appliedReplacements
    },
    suggestionIds: [...input.suggestionIds],
    createdAt: input.createdAt
  };
}

export function evaluateVaultWritePrecondition(
  operation: GuardedVaultWriteOperation,
  current: VaultWriteCurrentSnapshot
): VaultWritePreconditionResult {
  if (current.path !== operation.targetPath) {
    return {
      ok: false,
      reason: "wrong_target",
      expectedCurrentHash: operation.expectedCurrentHash,
      actualCurrentHash: current.currentHash
    };
  }

  if (operation.expectedCurrentHash === null) {
    return current.currentHash === null
      ? { ok: true }
      : {
          ok: false,
          reason: "target_exists",
          expectedCurrentHash: null,
          actualCurrentHash: current.currentHash
        };
  }

  if (current.currentHash === null) {
    return {
      ok: false,
      reason: "missing_file",
      expectedCurrentHash: operation.expectedCurrentHash,
      actualCurrentHash: null
    };
  }

  if (current.currentHash !== operation.expectedCurrentHash) {
    return {
      ok: false,
      reason: "stale_file",
      expectedCurrentHash: operation.expectedCurrentHash,
      actualCurrentHash: current.currentHash
    };
  }

  return { ok: true };
}

export function createVaultWriteDecisionRecord(input: CreateVaultWriteDecisionRecordInput): VaultWriteDecisionRecord {
  return {
    operationId: input.operation.id,
    decision: input.decision,
    targetPath: input.operation.targetPath,
    suggestionIds: [...input.operation.suggestionIds],
    decidedAt: input.decidedAt
  };
}

export function createVaultWriteApplySuccessRecord(
  input: CreateVaultWriteApplySuccessRecordInput
): VaultWriteApplySuccessRecord {
  return {
    operationId: input.operation.id,
    status: "applied",
    targetPath: input.operation.targetPath,
    beforeHash: input.beforeHash,
    afterHash: input.afterHash,
    appliedAt: input.appliedAt
  };
}

export function createVaultWriteApplyFailureRecord(
  input: CreateVaultWriteApplyFailureRecordInput
): VaultWriteApplyFailureRecord {
  return {
    operationId: input.operation.id,
    status: "failed",
    targetPath: input.operation.targetPath,
    stage: input.stage,
    expectedCurrentHash: input.expectedCurrentHash,
    actualCurrentHash: input.actualCurrentHash,
    message: input.message,
    retryable: input.retryable,
    failedAt: input.failedAt
  };
}

export function mergeVaultWriteOperations(
  existing: GuardedVaultWriteOperation[],
  incoming: GuardedVaultWriteOperation[]
): GuardedVaultWriteOperation[] {
  const operationsById = new Map<string, GuardedVaultWriteOperation>();
  for (const operation of existing) operationsById.set(operation.id, clone(operation));
  for (const operation of incoming) operationsById.set(operation.id, clone(operation));
  return [...operationsById.values()].sort((left, right) => left.id.localeCompare(right.id));
}

export function upsertVaultWriteDecisionRecord(
  existing: VaultWriteDecisionRecord[],
  incoming: VaultWriteDecisionRecord
): VaultWriteDecisionRecord[] {
  const decisionsByOperationId = new Map<string, VaultWriteDecisionRecord>();
  for (const decision of existing) decisionsByOperationId.set(decision.operationId, clone(decision));
  decisionsByOperationId.set(incoming.operationId, clone(incoming));
  return [...decisionsByOperationId.values()].sort((left, right) => left.operationId.localeCompare(right.operationId));
}

export function upsertVaultWriteApplyResultRecord(
  existing: VaultWriteApplyResultRecord[],
  incoming: VaultWriteApplyResultRecord
): VaultWriteApplyResultRecord[] {
  const resultsByOperationId = new Map<string, VaultWriteApplyResultRecord>();
  for (const result of existing) resultsByOperationId.set(result.operationId, clone(result));
  resultsByOperationId.set(incoming.operationId, clone(incoming));
  return [...resultsByOperationId.values()].sort((left, right) => left.operationId.localeCompare(right.operationId));
}

function createFilePreview(targetPath: string, content: string): VaultWritePreview {
  const lines = contentLines(content);

  return {
    kind: "create_file",
    targetPath,
    beforeHash: null,
    afterHash: hashString(content),
    diff: ["--- /dev/null", `+++ b/${targetPath}`, "@@", ...lines.map((line) => `+${line}`), ""].join("\n"),
    additions: lines.length,
    deletions: 0
  };
}

function modifyFilePreview(targetPath: string, beforeContent: string, afterContent: string): VaultWritePreview {
  const beforeLines = contentLines(beforeContent);
  const afterLines = contentLines(afterContent);

  return {
    kind: "modify_file",
    targetPath,
    beforeHash: hashString(beforeContent),
    afterHash: hashString(afterContent),
    diff: [
      `--- a/${targetPath}`,
      `+++ b/${targetPath}`,
      "@@",
      ...beforeLines.map((line) => `-${line}`),
      ...afterLines.map((line) => `+${line}`),
      ""
    ].join("\n"),
    additions: afterLines.length,
    deletions: beforeLines.length
  };
}

function contentLines(content: string): string[] {
  const lines = content.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function normalizeWriteContent(content: string): string {
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return normalized.endsWith("\n") ? normalized : `${normalized}\n`;
}

function writeFrontmatterTags(content: string, tags: string[]): string {
  const lines = contentLines(content);
  const frontmatter = readFrontmatter(lines);
  const tagLines = formatTagLines(tags);

  if (!frontmatter) {
    return joinContentLines(["---", ...tagLines, "---", "", ...lines]);
  }

  const updatedFrontmatter = replaceTagBlock(frontmatter.lines, tagLines);
  return joinContentLines(["---", ...updatedFrontmatter, "---", ...frontmatter.bodyLines]);
}

function readFrontmatter(lines: string[]): { lines: string[]; bodyLines: string[] } | null {
  if (lines[0] !== "---") return null;
  const endIndex = lines.findIndex((line, index) => index > 0 && line === "---");
  if (endIndex < 0) return null;
  return {
    lines: lines.slice(1, endIndex),
    bodyLines: lines.slice(endIndex + 1)
  };
}

function replaceTagBlock(frontmatterLines: string[], tagLines: string[]): string[] {
  const result: string[] = [];
  let inserted = false;

  for (let index = 0; index < frontmatterLines.length;) {
    const line = frontmatterLines[index]!;
    if (isTagFieldLine(line)) {
      if (!inserted) {
        result.push(...tagLines);
        inserted = true;
      }
      index = skipYamlValueBlock(frontmatterLines, index + 1);
      continue;
    }

    result.push(line);
    index += 1;
  }

  if (!inserted) result.push(...tagLines);
  return result;
}

function skipYamlValueBlock(lines: string[], startIndex: number): number {
  let index = startIndex;
  while (index < lines.length) {
    const line = lines[index]!;
    if (!/^\s+/.test(line) && !line.trim().startsWith("- ")) break;
    index += 1;
  }
  return index;
}

function extractFrontmatterTags(content: string): string[] {
  const frontmatter = readFrontmatter(contentLines(content));
  if (!frontmatter) return [];

  const tags: string[] = [];
  for (let index = 0; index < frontmatter.lines.length; index += 1) {
    const line = frontmatter.lines[index]!;
    if (!isTagFieldLine(line)) continue;

    const inlineValue = line.slice(line.indexOf(":") + 1).trim();
    if (inlineValue) tags.push(...parseInlineTags(inlineValue));

    let nextIndex = index + 1;
    while (nextIndex < frontmatter.lines.length && /^\s+/.test(frontmatter.lines[nextIndex]!)) {
      const item = frontmatter.lines[nextIndex]!.trim().match(/^-\s*(.+)$/);
      if (item?.[1]) tags.push(item[1]);
      nextIndex += 1;
    }
  }

  return normalizeWritableTags(tags);
}

function parseInlineTags(value: string): string[] {
  const trimmed = trimYamlScalar(value);
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed
      .slice(1, -1)
      .split(",")
      .map(trimYamlScalar);
  }
  return [trimmed];
}

function formatTagLines(tags: string[]): string[] {
  if (tags.length === 0) return ["tags: []"];
  return ["tags:", ...tags.map((tag) => `  - ${tag}`)];
}

function isTagFieldLine(line: string): boolean {
  return /^(tags?|Tags?)\s*:/.test(line);
}

function normalizeWritableTags(values: string[]): string[] {
  const tags = new Set<string>();
  for (const value of values) {
    const tag = normalizeWritableTag(value);
    if (tag) tags.add(tag);
  }
  return sortTags([...tags]);
}

function normalizeWritableTag(value: string): string | null {
  const tag = trimYamlScalar(value)
    .replace(/^#+/, "")
    .replace(/^\/+|\/+$/g, "");
  if (!tag || /\s/.test(tag) || tag.includes("//")) return null;
  return /^[\p{L}\p{N}][\p{L}\p{N}/_-]*$/u.test(tag) ? tag : null;
}

function trimYamlScalar(value: string): string {
  return value.trim().replace(/^["']|["']$/g, "").trim();
}

function sortTags(tags: string[]): string[] {
  return [...new Set(tags)].sort((left, right) => left.localeCompare(right));
}

function joinContentLines(lines: string[]): string {
  return `${lines.join("\n")}\n`;
}

function readWikiLinkDisplayText(rawLink: string, fallback: string): string {
  const match = rawLink.match(/^\[\[([^\]]+)\]\]$/);
  const inner = match?.[1]?.trim();
  if (!inner) return fallback.trim();

  const pipeIndex = inner.indexOf("|");
  if (pipeIndex < 0) return fallback.trim();

  return inner.slice(pipeIndex + 1).trim() || fallback.trim();
}

function formatWikiLinkReplacement(suggestedPath: string, displayText: string): string {
  const linkTarget = stripMarkdownExtension(suggestedPath.trim());
  const display = displayText.trim() || linkTarget.split("/").at(-1) || linkTarget;
  return `[[${linkTarget}|${display}]]`;
}

function stripMarkdownExtension(path: string): string {
  return path.replace(/\.md$/i, "");
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
