import { spawn } from "node:child_process";
import { mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  chunkSourceRecord,
  hashString,
  type SourceAttachmentRecord,
  type SourceChunkRecord,
  type SourceExtractionInput,
  type SourceExtractionResult,
  type SourceExtractorCapability,
  type SourceExtractorDependency,
  type SourceExtractorFailureMode,
  type SourceExtractorPort,
  type SourceRecord
} from "@vaultseer/core";

export type MarkerCommandRunOptions = {
  cwd?: string;
  timeoutMs?: number;
};

export type MarkerCommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export interface MarkerCommandRunner {
  run(command: string, args: string[], options?: MarkerCommandRunOptions): Promise<MarkerCommandResult>;
}

export type MarkerSourceExtractorOptions = {
  outputRoot: string;
  resolveSourcePath: (sourcePath: string) => string;
  runner?: MarkerCommandRunner;
  markerCommand?: string;
  timeoutMs?: number;
  version?: string | null;
};

const EXTRACTOR_ID = "marker";
const EXTRACTOR_NAME = "Marker";
const DEFAULT_MARKER_COMMAND = "marker_single";
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

export class MarkerSourceExtractor implements SourceExtractorPort {
  readonly id = EXTRACTOR_ID;
  readonly displayName = EXTRACTOR_NAME;

  private readonly markerCommand: string;
  private readonly runner: MarkerCommandRunner;
  private readonly timeoutMs: number;
  private readonly version: string | null;

  constructor(private readonly options: MarkerSourceExtractorOptions) {
    this.markerCommand = options.markerCommand ?? DEFAULT_MARKER_COMMAND;
    this.runner = options.runner ?? new NodeMarkerCommandRunner();
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.version = options.version ?? null;
  }

  listCapabilities(): SourceExtractorCapability[] {
    return [
      {
        extensions: [".pdf"],
        mimeTypes: ["application/pdf"],
        requiresExternalProcess: true,
        preservesImages: true,
        preservesTables: true
      }
    ];
  }

  async checkDependencies(): Promise<SourceExtractorDependency[]> {
    try {
      const result = await this.runner.run(this.markerCommand, ["--help"], { timeoutMs: 30_000 });
      const available = result.exitCode === 0;
      return [
        {
          name: this.markerCommand,
          kind: "command",
          required: true,
          status: available ? "available" : "missing",
          message: available
            ? `${this.markerCommand} responded successfully.`
            : `${this.markerCommand} exited with code ${result.exitCode}.`
        }
      ];
    } catch (error) {
      return [
        {
          name: this.markerCommand,
          kind: "command",
          required: true,
          status: "missing",
          message: getErrorMessage(error)
        }
      ];
    }
  }

  async extract(input: SourceExtractionInput): Promise<SourceExtractionResult> {
    if (normalizeExtension(input.extension) !== ".pdf") {
      return failedResult(input, "unsupported_file_type", "Marker extraction supports PDF files only.", this.version);
    }

    const outputDir = path.join(this.options.outputRoot, createOutputDirectoryName(input));
    await mkdir(outputDir, { recursive: true });
    let result: MarkerCommandResult;
    try {
      result = await this.runner.run(
        this.markerCommand,
        [
          this.options.resolveSourcePath(input.sourcePath),
          "--output_format",
          "markdown",
          "--output_dir",
          outputDir
        ],
        {
          timeoutMs: this.timeoutMs
        }
      );
    } catch (error) {
      return failedResult(input, "extraction_failed", getErrorMessage(error), this.version);
    }

    if (result.exitCode !== 0) {
      return failedResult(
        input,
        "extraction_failed",
        `${this.markerCommand} exited with code ${result.exitCode}: ${firstNonEmpty(result.stderr, result.stdout, "no output")}`,
        this.version
      );
    }

    const markdownPath = await findFirstMarkdownFile(outputDir);
    if (!markdownPath) {
      return failedResult(
        input,
        "extraction_failed",
        "Marker completed but did not produce a markdown file.",
        this.version
      );
    }

    const extractedMarkdown = (await readFile(markdownPath, "utf8")).replace(/\r\n/g, "\n").trim();
    const source = createSourceRecord(input, {
      status: "extracted",
      extractedMarkdown,
      diagnostics: [],
      attachments: await readAttachmentRecords(outputDir, markdownPath, createSourceId(input), input.sourcePath),
      version: this.version
    });

    return {
      ok: true,
      source,
      chunks: chunkSourceRecord(source)
    };
  }
}

export class NodeMarkerCommandRunner implements MarkerCommandRunner {
  async run(command: string, args: string[], options: MarkerCommandRunOptions = {}): Promise<MarkerCommandResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: options.cwd,
        windowsHide: true
      });
      let stdout = "";
      let stderr = "";
      let settled = false;
      const timeout = options.timeoutMs
        ? setTimeout(() => {
            if (settled) return;
            settled = true;
            child.kill();
            reject(new Error(`${command} timed out after ${options.timeoutMs}ms.`));
          }, options.timeoutMs)
        : null;

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
      child.on("error", (error) => {
        if (settled) return;
        settled = true;
        if (timeout) clearTimeout(timeout);
        reject(error);
      });
      child.on("close", (exitCode) => {
        if (settled) return;
        settled = true;
        if (timeout) clearTimeout(timeout);
        resolve({ exitCode: exitCode ?? 1, stdout, stderr });
      });
    });
  }
}

type SourceRecordOptions = {
  status: SourceRecord["status"];
  extractedMarkdown: string;
  diagnostics: SourceRecord["diagnostics"];
  attachments: SourceAttachmentRecord[];
  version: string | null;
};

function failedResult(
  input: SourceExtractionInput,
  failureMode: SourceExtractorFailureMode,
  message: string,
  version: string | null
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
      ],
      attachments: [],
      version
    })
  };
}

function createSourceRecord(input: SourceExtractionInput, options: SourceRecordOptions): SourceRecord {
  return {
    id: createSourceId(input),
    status: options.status,
    sourcePath: input.sourcePath,
    filename: input.filename,
    extension: normalizeExtension(input.extension),
    sizeBytes: input.sizeBytes,
    contentHash: input.contentHash,
    importedAt: input.importedAt ?? new Date().toISOString(),
    extractor: {
      id: EXTRACTOR_ID,
      name: EXTRACTOR_NAME,
      version: options.version
    },
    extractionOptions: input.options,
    extractedMarkdown: options.extractedMarkdown,
    diagnostics: options.diagnostics,
    attachments: options.attachments
  };
}

async function readAttachmentRecords(
  outputDir: string,
  markdownPath: string,
  sourceId: string,
  sourcePath: string
): Promise<SourceAttachmentRecord[]> {
  const files = await listFiles(outputDir);
  const attachmentPaths = files
    .filter((filePath) => path.resolve(filePath) !== path.resolve(markdownPath))
    .filter((filePath) => normalizeExtension(path.extname(filePath)) !== ".json")
    .sort((left, right) => left.localeCompare(right));
  const attachments: SourceAttachmentRecord[] = [];

  for (const stagedPath of attachmentPaths) {
    const bytes = await readFile(stagedPath);
    const filename = path.basename(stagedPath);
    const mimeType = imageMimeType(filename);
    attachments.push({
      id: createAttachmentId(sourceId, path.relative(outputDir, stagedPath)),
      sourceId,
      kind: mimeType ? "image" : "attachment",
      filename,
      contentHash: `fnv1a:${hashString(bytes.toString("base64"))}`,
      stagedPath: normalizePath(stagedPath),
      ...(mimeType ? { mimeType } : {}),
      provenance: { kind: "unknown" }
    });
  }

  return attachments;
}

async function findFirstMarkdownFile(outputDir: string): Promise<string | null> {
  const markdownFiles = (await listFiles(outputDir))
    .filter((filePath) => normalizeExtension(path.extname(filePath)) === ".md")
    .sort((left, right) => left.localeCompare(right));
  return markdownFiles[0] ?? null;
}

async function listFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(entryPath));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

function createSourceId(input: SourceExtractionInput): string {
  return createSourceIdFromParts(input.sourcePath, input.contentHash);
}

function createSourceIdFromParts(sourcePath: string, contentHash: string): string {
  return `source:marker:${hashString(`${sourcePath}\n${contentHash}`)}`;
}

function createAttachmentId(sourceId: string, relativePath: string): string {
  return `${sourceId}:attachment:${hashString(normalizePath(relativePath))}`;
}

function createOutputDirectoryName(input: SourceExtractionInput): string {
  return `${hashString(`${input.sourcePath}\n${input.contentHash}`)}-${sanitizePathSegment(input.filename)}`;
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || "source";
}

function normalizeExtension(extension: string): string {
  const trimmed = extension.trim().toLowerCase();
  if (!trimmed) return "";
  return trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
}

function imageMimeType(filename: string): string | null {
  switch (normalizeExtension(path.extname(filename))) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    default:
      return null;
  }
}

function normalizePath(filePath: string): string {
  return filePath.replaceAll("\\", "/");
}

function firstNonEmpty(...values: string[]): string {
  return values.map((value) => value.trim()).find(Boolean) ?? "";
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
