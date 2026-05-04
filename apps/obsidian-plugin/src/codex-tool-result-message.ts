import type { CodexToolResult } from "./codex-tool-dispatcher";

const MAX_RESULTS = 3;
const MAX_TEXT_LENGTH = 180;

export function formatCodexToolResultMessage(result: CodexToolResult): string {
  if (!result.ok) {
    return `Tool result (${plain(result.tool)}) failed: ${plain(result.message)}`;
  }

  return [`Tool result (${plain(result.tool)})`, ...formatOutput(result.output)].join("\n");
}

function formatOutput(output: unknown): string[] {
  if (isActiveNoteContext(output)) {
    if (output.status !== "ready" || !isRecord(output.note)) {
      return [plain(stringProperty(output, "message") ?? "Active note context is not available.")];
    }

    const lines = [
      `${plain(stringProperty(output.note, "title") ?? "Current note")} - ${plain(stringProperty(output.note, "path") ?? "")}`,
      `Chunks: ${arrayLength(output.noteChunks)}; related notes: ${arrayLength(output.relatedNotes)}; source excerpts: ${arrayLength(output.sourceExcerpts)}`
    ];
    const liveNote = isRecord(output.liveNote) ? output.liveNote : null;
    const liveText = liveNote === null ? null : stringProperty(liveNote, "text");

    if (liveText !== null && liveText.trim().length > 0) {
      lines.push(`Live note text: available (${liveText.length} chars). Excerpt: ${truncate(plain(liveText))}`);
    }

    return lines;
  }

  if (isSearchState(output)) {
    const lines = [plain(stringProperty(output, "message") ?? "Search completed.")];
    for (const result of output.results.slice(0, MAX_RESULTS)) {
      lines.push(formatSearchResult(result));
    }
    return lines;
  }

  if (isIndexHealthOutput(output)) {
    const health = isRecord(output.health) ? output.health : {};
    const counts = isRecord(output.counts) ? output.counts : {};
    return [
      plain(stringProperty(output, "message") ?? "Index health inspected."),
      `Notes: ${numberProperty(counts, "notes")}; chunks: ${numberProperty(counts, "chunks")}; vectors: ${numberProperty(counts, "vectors")}; sources: ${numberProperty(counts, "sources")}`,
      `Health: ${plain(stringProperty(health, "status") ?? stringProperty(output, "status") ?? "unknown")}`
    ];
  }

  if (isSuggestionOutput(output)) {
    const targetPath = stringProperty(output, "targetPath") ?? "current note";
    const suggestions = output.suggestions.slice(0, MAX_RESULTS);
    return [
      plain(stringProperty(output, "message") ?? "Suggestions inspected."),
      `Target: ${plain(targetPath)}`,
      ...suggestions.map(formatSuggestion)
    ];
  }

  if (isQualityOutput(output)) {
    const issues = output.issues.slice(0, MAX_RESULTS);
    return [
      plain(stringProperty(output, "message") ?? "Note quality inspected."),
      ...issues.map((issue) => `- ${plain(stringProperty(issue, "message") ?? safeJson(issue))}`)
    ];
  }

  return [truncate(plain(safeJson(output)))];
}

function formatSearchResult(result: Record<string, unknown>): string {
  const title = stringProperty(result, "title") ?? stringProperty(result, "filename") ?? "Untitled";
  const path = stringProperty(result, "notePath") ?? stringProperty(result, "sourcePath") ?? "";
  const reason = stringProperty(result, "reason");
  const excerpt = stringProperty(result, "excerpt");
  return [
    `- ${plain(title)}${path ? ` (${plain(path)})` : ""}`,
    reason ? `: ${plain(reason)}` : "",
    excerpt ? ` - ${truncate(plain(excerpt))}` : ""
  ].join("");
}

function formatSuggestion(suggestion: Record<string, unknown>): string {
  const label =
    stringProperty(suggestion, "tag") ??
    stringProperty(suggestion, "suggestedPath") ??
    stringProperty(suggestion, "notePath") ??
    "suggestion";
  const reason = stringProperty(suggestion, "reason");
  return `- ${plain(label)}${reason ? `: ${truncate(plain(reason))}` : ""}`;
}

function isActiveNoteContext(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && typeof value["status"] === "string" && "noteChunks" in value && "relatedNotes" in value;
}

function isSearchState(value: unknown): value is { results: Array<Record<string, unknown>> } & Record<string, unknown> {
  return isRecord(value) && Array.isArray(value["results"]);
}

function isIndexHealthOutput(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && isRecord(value["health"]) && isRecord(value["counts"]);
}

function isSuggestionOutput(value: unknown): value is { suggestions: Array<Record<string, unknown>> } & Record<string, unknown> {
  return isRecord(value) && Array.isArray(value["suggestions"]);
}

function isQualityOutput(value: unknown): value is { issues: Array<Record<string, unknown>> } & Record<string, unknown> {
  return isRecord(value) && Array.isArray(value["issues"]);
}

function stringProperty(value: Record<string, unknown>, key: string): string | null {
  const property = value[key];
  return typeof property === "string" ? property : null;
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function numberProperty(value: Record<string, unknown>, key: string): number {
  const property = value[key];
  return typeof property === "number" && Number.isFinite(property) ? property : 0;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function plain(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function truncate(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= MAX_TEXT_LENGTH) return compact;
  return `${compact.slice(0, MAX_TEXT_LENGTH - 3).trimEnd()}...`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
