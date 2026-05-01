import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  MarkerSourceExtractor,
  type MarkerCommandResult,
  type MarkerCommandRunner,
  type MarkerCommandRunOptions
} from "../src/marker-source-extractor";

const importedAt = "2026-05-01T11:30:00.000Z";

class FakeMarkerRunner implements MarkerCommandRunner {
  readonly calls: Array<{ command: string; args: string[]; options: MarkerCommandRunOptions }> = [];

  constructor(private readonly handler: (args: string[]) => Promise<MarkerCommandResult>) {}

  async run(command: string, args: string[], options: MarkerCommandRunOptions = {}): Promise<MarkerCommandResult> {
    this.calls.push({ command, args, options });
    return this.handler(args);
  }
}

describe("MarkerSourceExtractor", () => {
  it("reports marker as available when marker_single responds to help", async () => {
    const runner = new FakeMarkerRunner(async () => ({ exitCode: 0, stdout: "usage: marker_single", stderr: "" }));
    const extractor = createExtractor(runner);

    await expect(extractor.checkDependencies()).resolves.toEqual([
      {
        name: "marker_single",
        kind: "command",
        required: true,
        status: "available",
        message: "marker_single responded successfully."
      }
    ]);
    expect(runner.calls).toEqual([
      expect.objectContaining({
        command: "marker_single",
        args: ["--help"]
      })
    ]);
  });

  it("runs marker_single and stores produced markdown plus image attachment metadata", async () => {
    const outputRoot = await mkdtemp(path.join(os.tmpdir(), "vaultseer-marker-test-"));
    try {
      const runner = new FakeMarkerRunner(async (args) => {
        const outputDir = args[args.indexOf("--output_dir") + 1]!;
        await mkdir(outputDir, { recursive: true });
        await writeFile(path.join(outputDir, "paper.md"), "# Extracted Paper\n\n![figure](figure-1.png)\n");
        await writeFile(path.join(outputDir, "figure-1.png"), "fake image bytes");
        return { exitCode: 0, stdout: "saved", stderr: "" };
      });
      const extractor = createExtractor(runner, outputRoot);

      const result = await extractor.extract({
        sourcePath: "Sources/Papers/paper.pdf",
        filename: "paper.pdf",
        extension: ".pdf",
        sizeBytes: 2048,
        contentHash: "vault-file:200:20",
        importedAt,
        options: { preserveImages: true, preserveTables: true }
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected marker extraction to succeed");
      expect(runner.calls[0]).toEqual(
        expect.objectContaining({
          command: "marker_single",
          args: expect.arrayContaining([
            "C:/Vault/Sources/Papers/paper.pdf",
            "--output_format",
            "markdown",
            "--output_dir"
          ])
        })
      );
      expect(result.source).toMatchObject({
        status: "extracted",
        sourcePath: "Sources/Papers/paper.pdf",
        filename: "paper.pdf",
        extension: ".pdf",
        contentHash: "vault-file:200:20",
        importedAt,
        extractor: {
          id: "marker",
          name: "Marker",
          version: null
        },
        extractionOptions: { preserveImages: true, preserveTables: true },
        extractedMarkdown: "# Extracted Paper\n\n![figure](figure-1.png)"
      });
      expect(result.source.attachments).toEqual([
        expect.objectContaining({
          sourceId: result.source.id,
          kind: "image",
          filename: "figure-1.png",
          mimeType: "image/png",
          provenance: { kind: "unknown" }
        })
      ]);
      expect(result.chunks).toHaveLength(1);
      expect(result.chunks[0]).toMatchObject({
        sourceId: result.source.id,
        sourcePath: "Sources/Papers/paper.pdf",
        sectionPath: ["Extracted Paper"]
      });
    } finally {
      await rm(outputRoot, { recursive: true, force: true });
    }
  });

  it("returns a failed source when marker exits without markdown output", async () => {
    const outputRoot = await mkdtemp(path.join(os.tmpdir(), "vaultseer-marker-test-"));
    try {
      const runner = new FakeMarkerRunner(async (args) => {
        const outputDir = args[args.indexOf("--output_dir") + 1]!;
        await mkdir(outputDir, { recursive: true });
        return { exitCode: 0, stdout: "saved", stderr: "" };
      });
      const extractor = createExtractor(runner, outputRoot);

      const result = await extractor.extract({
        sourcePath: "Sources/Papers/empty.pdf",
        filename: "empty.pdf",
        extension: ".pdf",
        sizeBytes: 1024,
        contentHash: "vault-file:100:10",
        importedAt,
        options: {}
      });

      expect(result).toMatchObject({
        ok: false,
        failureMode: "extraction_failed",
        source: {
          status: "failed",
          sourcePath: "Sources/Papers/empty.pdf",
          diagnostics: [
            expect.objectContaining({
              severity: "error",
              code: "extraction_failed",
              message: "Marker completed but did not produce a markdown file."
            })
          ]
        }
      });
    } finally {
      await rm(outputRoot, { recursive: true, force: true });
    }
  });

  it("returns a failed source when marker execution throws", async () => {
    const runner = new FakeMarkerRunner(async () => {
      throw new Error("marker timeout");
    });
    const extractor = createExtractor(runner);

    const result = await extractor.extract({
      sourcePath: "Sources/Papers/timeout.pdf",
      filename: "timeout.pdf",
      extension: ".pdf",
      sizeBytes: 1024,
      contentHash: "vault-file:100:10",
      importedAt,
      options: {}
    });

    expect(result).toMatchObject({
      ok: false,
      failureMode: "extraction_failed",
      source: {
        status: "failed",
        sourcePath: "Sources/Papers/timeout.pdf",
        diagnostics: [
          expect.objectContaining({
            severity: "error",
            code: "extraction_failed",
            message: "marker timeout"
          })
        ]
      }
    });
  });

  it("rejects non-PDF files before invoking marker", async () => {
    const runner = new FakeMarkerRunner(async () => {
      throw new Error("marker should not run");
    });
    const extractor = createExtractor(runner);

    const result = await extractor.extract({
      sourcePath: "Sources/Docs/manual.docx",
      filename: "manual.docx",
      extension: ".docx",
      sizeBytes: 512,
      contentHash: "vault-file:50:5",
      importedAt,
      options: {}
    });

    expect(result).toMatchObject({
      ok: false,
      failureMode: "unsupported_file_type",
      source: {
        status: "failed",
        sourcePath: "Sources/Docs/manual.docx"
      }
    });
    expect(runner.calls).toEqual([]);
  });
});

function createExtractor(runner: MarkerCommandRunner, outputRoot = path.join(os.tmpdir(), "vaultseer-marker")) {
  return new MarkerSourceExtractor({
    outputRoot,
    runner,
    resolveSourcePath: (sourcePath) => `C:/Vault/${sourcePath}`
  });
}
