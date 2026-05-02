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

    return [
      `${plain(stringProperty(output.note, "title") ?? "Current note")} - ${plain(stringProperty(output.note, "path") ?? "")}`,
      `Chunks: ${arrayLength(output.noteChunks)}; related notes: ${arrayLength(output.relatedNotes)}; source excerpts: ${arrayLength(output.sourceExcerpts)}`
    ];
  }

  if (isSearchState(output)) {
    const lines = [plain(stringProperty(output, "message") ?? "Search completed.")];
    for (const result of output.results.slice(0, MAX_RESULTS)) {
      lines.push(formatSearchResult(result));
    }
    return lines;
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

function isActiveNoteContext(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && typeof value["status"] === "string" && "noteChunks" in value && "relatedNotes" in value;
}

function isSearchState(value: unknown): value is { results: Array<Record<string, unknown>> } & Record<string, unknown> {
  return isRecord(value) && Array.isArray(value["results"]);
}

function stringProperty(value: Record<string, unknown>, key: string): string | null {
  const property = value[key];
  return typeof property === "string" ? property : null;
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
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
