import { type LinkSuggestion, type TagSuggestion, type VaultWriteDecision } from "@vaultseer/core";
import type { ApprovedScriptRunRequest } from "./approved-script-registry";
import { validateVaultRelativePath } from "./vault-path-policy";

const DEFAULT_LIMIT = 5;
const MIN_LIMIT = 1;
const MAX_LIMIT = 10;

export type CodexSearchToolInput = {
  query: string;
  limit: number;
};

export type ParsedCodexStageSuggestionInput =
  | {
      kind: "tag";
      targetPath: string;
      tagSuggestions: TagSuggestion[];
    }
  | {
      kind: "link";
      targetPath: string;
      linkSuggestions: LinkSuggestion[];
    }
  | {
      kind: "rewrite";
      targetPath: string;
      proposedContent: string;
      reason: string | null;
    };

export type ParsedCodexReviewCurrentNoteProposalInput = {
  operationId: string | null;
  decision: VaultWriteDecision;
  apply: boolean;
};

export function parseCodexSearchToolInput(input: unknown): CodexSearchToolInput {
  const rawQuery = typeof input === "string" ? input : isRecord(input) ? input["query"] : undefined;
  if (typeof rawQuery !== "string" || rawQuery.trim().length === 0) {
    throw new Error("Codex search tool input must include a nonblank query.");
  }

  const rawLimit = isRecord(input) ? input["limit"] : undefined;
  return {
    query: rawQuery.trim(),
    limit: normalizeLimit(rawLimit)
  };
}

export function parseLimitOnlyInput(input: unknown): { limit: number } {
  const rawLimit = isRecord(input) ? input["limit"] : undefined;
  return { limit: normalizeLimit(rawLimit) };
}

export function parseApprovedScriptRunInput(input: unknown): ApprovedScriptRunRequest {
  if (!isRecord(input)) {
    throw new Error("Codex run_approved_script input must be an object.");
  }

  const scriptId = stringProperty(input, "scriptId")?.trim();
  if (!scriptId) {
    throw new Error("Codex run_approved_script input must include a nonblank scriptId.");
  }

  return {
    scriptId,
    input: input["input"] ?? {}
  };
}

export function parseCodexStageSuggestionInput(
  input: unknown,
  activePath: string
): ParsedCodexStageSuggestionInput {
  if (!isRecord(input)) {
    throw new Error("Codex stage_suggestion input must be an object.");
  }

  const targetPath = parseStageSuggestionTargetPath(input, activePath);
  const kind = inferStageSuggestionKind(input);

  if (kind === "tag") {
    return {
      kind,
      targetPath,
      tagSuggestions: parseTagSuggestions(input)
    };
  }

  if (kind === "link") {
    return {
      kind,
      targetPath,
      linkSuggestions: parseLinkSuggestions(input)
    };
  }

  if (kind === "rewrite") {
    return {
      kind,
      targetPath,
      proposedContent: parseRewriteContent(input),
      reason: stringProperty(input, "reason")?.trim() || null
    };
  }

  throw new Error("Codex stage_suggestion input kind must be 'tag', 'link', or 'rewrite'.");
}

export function parseCodexReviewCurrentNoteProposalInput(
  input: unknown
): ParsedCodexReviewCurrentNoteProposalInput {
  if (input === null || input === undefined) {
    return {
      operationId: null,
      decision: "approved",
      apply: false
    };
  }
  if (!isRecord(input)) {
    throw new Error("Codex review_current_note_proposal input must be an object.");
  }

  const rawOperationId = input["operationId"];
  const operationId =
    typeof rawOperationId === "string" && rawOperationId.trim().length > 0 ? rawOperationId.trim() : null;
  const apply = input["apply"] === true;
  const rawDecision = input["decision"];
  const decision = normalizeVaultWriteDecision(typeof rawDecision === "string" ? rawDecision : null) ?? "approved";

  return {
    operationId,
    decision,
    apply
  };
}

export function normalizeLimit(input: unknown): number {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    return DEFAULT_LIMIT;
  }

  return Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, Math.trunc(input)));
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeVaultWriteDecision(value: string | null): VaultWriteDecision | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "approved" || normalized === "deferred" || normalized === "rejected") {
    return normalized;
  }
  if (normalized === "accept" || normalized === "accepted" || normalized === "approve" || normalized === "apply") {
    return "approved";
  }
  if (normalized === "defer") {
    return "deferred";
  }
  if (normalized === "reject") {
    return "rejected";
  }
  if (normalized === null || normalized === undefined || normalized.length === 0) {
    return null;
  }
  throw new Error("Codex review_current_note_proposal decision must be approved, accepted, deferred, or rejected.");
}

function parseStageSuggestionTargetPath(input: Record<string, unknown>, activePath: string): string {
  validateVaultRelativePath(activePath, { requireMarkdown: true });
  const rawTargetPath = input["targetPath"];
  if (rawTargetPath === undefined) {
    return activePath;
  }

  if (typeof rawTargetPath !== "string" || rawTargetPath.trim().length === 0) {
    throw new Error("Codex stage_suggestion targetPath must be a nonblank string.");
  }

  const targetPath = rawTargetPath.trim();
  validateVaultRelativePath(targetPath, { requireMarkdown: true });
  if (targetPath !== activePath) {
    throw new Error("Codex stage_suggestion targetPath must match the current active note.");
  }

  return targetPath;
}

function parseTagSuggestions(input: Record<string, unknown>): TagSuggestion[] {
  if (Array.isArray(input["suggestions"])) {
    const suggestions = input["suggestions"].map(parseRichTagSuggestion).filter(isPresent);
    if (suggestions.length > 0) {
      return suggestions;
    }
  }

  if (Array.isArray(input["tags"])) {
    const suggestions = input["tags"]
      .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
      .filter((tag) => tag.length > 0)
      .map((tag) =>
        tagSuggestionFromParts({
          tag,
          reason: stringProperty(input, "reason"),
          confidence: clampedConfidence(input["confidence"]),
          score: nonNegativeScore(input["score"]),
          evidence: tagEvidenceArray(input["evidence"])
        })
      );
    if (suggestions.length > 0) {
      return suggestions;
    }
  }

  throw new Error("Codex tag proposal must include at least one nonblank tag suggestion.");
}

function parseRichTagSuggestion(input: unknown): TagSuggestion | null {
  if (!isRecord(input)) {
    return null;
  }

  const tag = stringProperty(input, "tag")?.trim();
  if (!tag) {
    return null;
  }

  return tagSuggestionFromParts({
    tag,
    reason: stringProperty(input, "reason"),
    confidence: clampedConfidence(input["confidence"]),
    score: nonNegativeScore(input["score"]),
    evidence: tagEvidenceArray(input["evidence"])
  });
}

function tagSuggestionFromParts(input: {
  tag: string;
  reason: string | null;
  confidence: number | null;
  score: number | null;
  evidence: unknown[];
}): TagSuggestion {
  return {
    tag: input.tag,
    reason: input.reason ?? "Codex suggested this tag.",
    confidence: input.confidence ?? 0.5,
    score: input.score ?? input.confidence ?? 0.5,
    evidence: input.evidence as TagSuggestion["evidence"]
  };
}

function parseLinkSuggestions(input: Record<string, unknown>): LinkSuggestion[] {
  if (!Array.isArray(input["links"])) {
    throw new Error("Codex link proposal must include at least one link suggestion.");
  }

  const suggestions = input["links"].map(parseLinkSuggestion).filter(isPresent);
  if (suggestions.length === 0) {
    throw new Error("Codex link proposal must include rawLink, unresolvedTarget, and suggestedPath.");
  }

  return suggestions;
}

function parseLinkSuggestion(input: unknown): LinkSuggestion | null {
  if (!isRecord(input)) {
    return null;
  }

  const rawLink = stringProperty(input, "rawLink")?.trim();
  const unresolvedTarget = stringProperty(input, "unresolvedTarget")?.trim();
  const suggestedPath = stringProperty(input, "suggestedPath")?.trim();
  if (!rawLink || !unresolvedTarget || !suggestedPath) {
    return null;
  }

  return {
    rawLink,
    unresolvedTarget,
    suggestedPath,
    suggestedTitle: stringProperty(input, "suggestedTitle")?.trim() || suggestedTitleFromPath(suggestedPath),
    reason: stringProperty(input, "reason") ?? "Codex suggested this link target.",
    confidence: clampedConfidence(input["confidence"]) ?? 0.5,
    score: nonNegativeScore(input["score"]) ?? clampedConfidence(input["confidence"]) ?? 0.5,
    evidence: linkEvidenceArray(input["evidence"])
  };
}

function parseRewriteContent(input: Record<string, unknown>): string {
  const content = rewriteContentProperty(input);
  if (content === null || content.trim().length === 0) {
    throw new Error("Codex rewrite proposal must include nonblank markdown, content, or proposedContent.");
  }
  return content;
}

function rewriteContentProperty(input: Record<string, unknown>): string | null {
  return (
    stringProperty(input, "markdown") ??
    stringProperty(input, "content") ??
    stringProperty(input, "proposedContent") ??
    stringProperty(input, "replacementMarkdown") ??
    stringProperty(input, "draft")
  );
}

function inferStageSuggestionKind(input: Record<string, unknown>): "tag" | "link" | "rewrite" | null {
  const rawExplicitKind = stringProperty(input, "kind") ?? stringProperty(input, "type");
  const explicit = normalizeKind(rawExplicitKind);
  if (explicit !== null) {
    return explicit;
  }
  if (rawExplicitKind !== null && rawExplicitKind.trim().length > 0) {
    return null;
  }
  if (rewriteContentProperty(input) !== null) {
    return "rewrite";
  }
  if (Array.isArray(input["links"])) {
    return "link";
  }
  if (Array.isArray(input["tags"]) || Array.isArray(input["suggestions"])) {
    return "tag";
  }
  return null;
}

function normalizeKind(value: string | null): "tag" | "link" | "rewrite" | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "tag" || normalized === "link" || normalized === "rewrite") return normalized;
  if (normalized === "note_rewrite" || normalized === "note-rewrite" || normalized === "content_rewrite") {
    return "rewrite";
  }
  return null;
}

function stringProperty(value: Record<string, unknown>, key: string): string | null {
  const property = value[key];
  return typeof property === "string" ? property : null;
}

function clampedConfidence(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.min(1, Math.max(0, value));
}

function nonNegativeScore(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, value);
}

function tagEvidenceArray(value: unknown): TagSuggestion["evidence"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(parseTagEvidence).filter(isPresent);
}

function parseTagEvidence(value: unknown): TagSuggestion["evidence"][number] | null {
  if (!isRecord(value)) {
    return null;
  }

  switch (value["type"]) {
    case "linked_note_tag":
    case "backlink_note_tag": {
      const notePath = nonblankString(value["notePath"]);
      const tag = nonblankString(value["tag"]);
      return notePath && tag ? { type: value["type"], notePath, tag } : null;
    }
    case "co_tag": {
      const fromTag = nonblankString(value["fromTag"]);
      const count = positiveNumber(value["count"]);
      return fromTag && count !== null ? { type: "co_tag", fromTag, count } : null;
    }
    case "tag_frequency": {
      const noteCount = nonNegativeNumber(value["noteCount"]);
      return noteCount !== null ? { type: "tag_frequency", noteCount } : null;
    }
    default:
      return null;
  }
}

function linkEvidenceArray(value: unknown): LinkSuggestion["evidence"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(parseLinkEvidence).filter(isPresent);
}

function parseLinkEvidence(value: unknown): LinkSuggestion["evidence"][number] | null {
  if (!isRecord(value)) {
    return null;
  }

  switch (value["type"]) {
    case "unresolved_link": {
      const raw = nonblankString(value["raw"]);
      const target = nonblankString(value["target"]);
      return raw && target ? { type: "unresolved_link", raw, target } : null;
    }
    case "alias_match": {
      const alias = nonblankString(value["alias"]);
      return alias ? { type: "alias_match", alias } : null;
    }
    case "title_match": {
      const title = nonblankString(value["title"]);
      return title ? { type: "title_match", title } : null;
    }
    case "token_overlap": {
      const tokens = stringArray(value["tokens"]);
      return tokens.length > 0 ? { type: "token_overlap", tokens } : null;
    }
    default:
      return null;
  }
}

function nonblankString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function positiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function nonNegativeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function stringArray(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !value.every((item) => typeof item === "string" && item.trim().length > 0)
  ) {
    return [];
  }

  return value.map((item) => item.trim());
}

function suggestedTitleFromPath(path: string): string {
  const basename = path.split("/").pop() ?? path;
  return basename.endsWith(".md") ? basename.slice(0, -3) : basename;
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}
