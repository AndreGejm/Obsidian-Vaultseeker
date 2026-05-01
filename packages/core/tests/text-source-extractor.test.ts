import { describe, expect, it } from "vitest";
import { BuiltInTextSourceExtractor } from "../src/index";

const baseInput = {
  sourcePath: "Sources/Scripts/timer.ps1",
  filename: "timer.ps1",
  extension: ".ps1",
  sizeBytes: 42,
  contentHash: "fnv1a:script",
  options: {}
};

describe("BuiltInTextSourceExtractor", () => {
  it("extracts text and code sources into source workspaces and chunks", async () => {
    const extractor = new BuiltInTextSourceExtractor();

    const result = await extractor.extract({
      ...baseInput,
      textContent: "Set-Variable -Name TimerMode -Value Astable\nWrite-Output $TimerMode"
    });

    expect(result).toEqual({
      ok: true,
      source: expect.objectContaining({
        id: expect.stringMatching(/^source:builtin-text:/),
        status: "extracted",
        sourcePath: "Sources/Scripts/timer.ps1",
        filename: "timer.ps1",
        extension: ".ps1",
        contentHash: "fnv1a:script",
        extractor: {
          id: "builtin-text",
          name: "Built-in text/code",
          version: "0.1.0"
        },
        extractedMarkdown: [
          "# timer.ps1",
          "",
          "```powershell",
          "Set-Variable -Name TimerMode -Value Astable",
          "Write-Output $TimerMode",
          "```"
        ].join("\n"),
        diagnostics: [],
        attachments: []
      }),
      chunks: [
        expect.objectContaining({
          sourceId: expect.stringMatching(/^source:builtin-text:/),
          sourcePath: "Sources/Scripts/timer.ps1",
          sectionPath: ["timer.ps1"],
          text: [
            "```powershell",
            "Set-Variable -Name TimerMode -Value Astable",
            "Write-Output $TimerMode",
            "```"
          ].join("\n")
        })
      ]
    });
  });

  it("preserves Markdown source text without wrapping it in a code fence", async () => {
    const extractor = new BuiltInTextSourceExtractor();

    const result = await extractor.extract({
      ...baseInput,
      sourcePath: "Sources/Notes/manual.md",
      filename: "manual.md",
      extension: ".md",
      textContent: "# Manual\n\nReset timing notes."
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source.extractedMarkdown).toBe("# Manual\n\nReset timing notes.");
    expect(result.chunks.map((chunk) => chunk.text)).toEqual(["Reset timing notes."]);
  });

  it("returns a failed source record for unsupported extensions without chunks", async () => {
    const extractor = new BuiltInTextSourceExtractor();

    const result = await extractor.extract({
      ...baseInput,
      sourcePath: "Sources/Datasheets/timer.pdf",
      filename: "timer.pdf",
      extension: ".pdf",
      textContent: "%PDF-1.7"
    });

    expect(result).toEqual({
      ok: false,
      failureMode: "unsupported_file_type",
      source: expect.objectContaining({
        status: "failed",
        sourcePath: "Sources/Datasheets/timer.pdf",
        filename: "timer.pdf",
        extractedMarkdown: "",
        diagnostics: [
          {
            severity: "error",
            code: "unsupported_file_type",
            message: "Built-in text/code extraction does not support .pdf files.",
            provenance: { kind: "unknown" }
          }
        ]
      })
    });
  });

  it("returns a failed source record when supported text content is unavailable", async () => {
    const extractor = new BuiltInTextSourceExtractor();

    const result = await extractor.extract(baseInput);

    expect(result).toEqual({
      ok: false,
      failureMode: "read_failed",
      source: expect.objectContaining({
        status: "failed",
        diagnostics: [
          {
            severity: "error",
            code: "read_failed",
            message: "Built-in text/code extraction requires text content from the Obsidian vault adapter.",
            provenance: { kind: "unknown" }
          }
        ]
      })
    });
  });
});
