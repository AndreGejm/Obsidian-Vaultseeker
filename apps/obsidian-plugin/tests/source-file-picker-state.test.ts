import { describe, expect, it } from "vitest";
import { buildSourceFilePickerItems } from "../src/source-file-picker-state";

describe("buildSourceFilePickerItems", () => {
  it("lists supported text and code files while skipping unsupported and excluded files", () => {
    const items = buildSourceFilePickerItems({
      excludedFolders: [".obsidian", "research"],
      files: [
        file("Sources/Datasheets/timer.pdf", "timer.pdf", "pdf", 2_048),
        file("Sources/Scripts/timer.ps1", "timer.ps1", "ps1", 78),
        file("Sources/Logs/reset.txt", "reset.txt", "txt", 50),
        file(".obsidian/plugins/config.json", "config.json", "json", 12),
        file("research/example.py", "example.py", "py", 10)
      ]
    });

    expect(items.map((item) => item.sourcePath)).toEqual([
      "Sources/Logs/reset.txt",
      "Sources/Scripts/timer.ps1"
    ]);
    expect(items[0]).toEqual(
      expect.objectContaining({
        filename: "reset.txt",
        extension: ".txt",
        displayName: "reset.txt",
        detail: ".txt · 50 B"
      })
    );
  });

  it("derives the extension from the filename when the adapter file has no extension field", () => {
    const items = buildSourceFilePickerItems({
      files: [file("Sources/Manuals/setup.MD", "setup.MD", "", 1_500)]
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toEqual(
      expect.objectContaining({
        sourcePath: "Sources/Manuals/setup.MD",
        extension: ".md",
        detail: ".md · 1.5 KB"
      })
    );
  });

  it("returns an empty list when no supported source files are available", () => {
    const items = buildSourceFilePickerItems({
      files: [
        file("Sources/Paper.pdf", "Paper.pdf", "pdf", 20_000),
        file("Images/figure.png", "figure.png", "png", 4_000)
      ]
    });

    expect(items).toEqual([]);
  });
});

function file(path: string, name: string, extension: string, size: number) {
  return {
    path,
    name,
    extension,
    stat: { size }
  };
}
