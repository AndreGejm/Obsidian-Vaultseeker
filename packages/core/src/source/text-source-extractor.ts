import { createStableChunkId, hashString, normalizeTextForHash } from "../chunking/text-chunking";
import { chunkSourceRecord } from "./chunk-source";
import type {
  SourceExtractionInput,
  SourceExtractionResult,
  SourceExtractorCapability,
  SourceExtractorDependency,
  SourceExtractorFailureMode,
  SourceRecord
} from "./types";

const EXTRACTOR_ID = "builtin-text";
const EXTRACTOR_NAME = "Built-in text/code";
const EXTRACTOR_VERSION = "0.1.0";

const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown"]);
const PLAIN_TEXT_EXTENSIONS = new Set([".txt", ".log"]);
const CODE_EXTENSIONS = new Map<string, string>([
  [".bat", "bat"],
  [".cmd", "bat"],
  [".c", "c"],
  [".cpp", "cpp"],
  [".cs", "csharp"],
  [".css", "css"],
  [".go", "go"],
  [".h", "c"],
  [".hpp", "cpp"],
  [".html", "html"],
  [".ini", "ini"],
  [".java", "java"],
  [".js", "javascript"],
  [".json", "json"],
  [".jsx", "jsx"],
  [".ps1", "powershell"],
  [".py", "python"],
  [".rs", "rust"],
  [".scss", "scss"],
  [".sh", "bash"],
  [".sql", "sql"],
  [".toml", "toml"],
  [".ts", "typescript"],
  [".tsx", "tsx"],
  [".xml", "xml"],
  [".yaml", "yaml"],
  [".yml", "yaml"]
]);

export class BuiltInTextSourceExtractor {
  readonly id = EXTRACTOR_ID;
  readonly displayName = EXTRACTOR_NAME;

  listCapabilities(): SourceExtractorCapability[] {
    return [
      {
        extensions: [...MARKDOWN_EXTENSIONS, ...PLAIN_TEXT_EXTENSIONS, ...CODE_EXTENSIONS.keys()].sort(),
        mimeTypes: ["text/*", "application/json", "application/xml"],
        requiresExternalProcess: false,
        preservesImages: false,
        preservesTables: false
      }
    ];
  }

  async checkDependencies(): Promise<SourceExtractorDependency[]> {
    return [];
  }

  async extract(input: SourceExtractionInput): Promise<SourceExtractionResult> {
    const extension = normalizeExtension(input.extension);

    if (!isSupportedExtension(extension)) {
      return failedResult(input, "unsupported_file_type", `Built-in text/code extraction does not support ${extension || "files without an extension"} files.`);
    }

    if (typeof input.textContent !== "string") {
      return failedResult(
        input,
        "read_failed",
        "Built-in text/code extraction requires text content from the Obsidian vault adapter."
      );
    }

    const source = createSourceRecord(input, {
      status: "extracted",
      extractedMarkdown: toExtractedMarkdown(input.filename, extension, input.textContent),
      diagnostics: []
    });

    return {
      ok: true,
      source,
      chunks: chunkSourceRecord(source)
    };
  }
}

export function isBuiltInTextSourceExtension(extension: string): boolean {
  return isSupportedExtension(normalizeExtension(extension));
}

function failedResult(
  input: SourceExtractionInput,
  failureMode: SourceExtractorFailureMode,
  message: string
): SourceExtractionResult {
  return {
    ok: false,
    failureMode,
    source: createSourceRecord(input, {
      status: "failed",
      extractedMarkdown: "",
      diagnostics: [
        {
          severity: "error",
          code: failureMode,
          message,
          provenance: { kind: "unknown" }
        }
      ]
    })
  };
}

function createSourceRecord(
  input: SourceExtractionInput,
  overrides: Pick<SourceRecord, "status" | "extractedMarkdown" | "diagnostics">
): SourceRecord {
  return {
    id: createSourceId(input.sourcePath, input.contentHash),
    status: overrides.status,
    sourcePath: input.sourcePath,
    filename: input.filename,
    extension: normalizeExtension(input.extension),
    sizeBytes: input.sizeBytes,
    contentHash: input.contentHash,
    importedAt: input.importedAt ?? new Date().toISOString(),
    extractor: {
      id: EXTRACTOR_ID,
      name: EXTRACTOR_NAME,
      version: EXTRACTOR_VERSION
    },
    extractionOptions: input.options,
    extractedMarkdown: overrides.extractedMarkdown,
    diagnostics: overrides.diagnostics,
    attachments: []
  };
}

function toExtractedMarkdown(filename: string, extension: string, textContent: string): string {
  const normalizedText = textContent.replace(/\r\n/g, "\n").trim();

  if (MARKDOWN_EXTENSIONS.has(extension)) {
    return normalizedText;
  }

  if (PLAIN_TEXT_EXTENSIONS.has(extension)) {
    return [`# ${filename}`, "", normalizedText].join("\n");
  }

  const language = CODE_EXTENSIONS.get(extension) ?? "";
  const fence = chooseFence(normalizedText);
  return [`# ${filename}`, "", `${fence}${language}`, normalizedText, fence].join("\n");
}

function createSourceId(sourcePath: string, contentHash: string): string {
  const identityHash = hashString(normalizeTextForHash(`${sourcePath}\n${contentHash}`));
  return createStableChunkId("source:builtin-text", identityHash, 0);
}

function normalizeExtension(extension: string): string {
  const trimmed = extension.trim().toLowerCase();
  if (!trimmed) return "";
  return trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
}

function isSupportedExtension(extension: string): boolean {
  return MARKDOWN_EXTENSIONS.has(extension) || PLAIN_TEXT_EXTENSIONS.has(extension) || CODE_EXTENSIONS.has(extension);
}

function chooseFence(textContent: string): string {
  let fenceLength = 3;
  for (const match of textContent.matchAll(/`{3,}/g)) {
    fenceLength = Math.max(fenceLength, match[0].length + 1);
  }
  return "`".repeat(fenceLength);
}
