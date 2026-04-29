import { describe, expect, it } from "vitest";
import { chunkSourceRecord, chunkSourceRecords } from "../src/index";
import type { SourceRecord } from "../src/index";

function sourceRecord(markdown: string, overrides: Partial<SourceRecord> = {}): SourceRecord {
  return {
    id: "source:timer-datasheet",
    status: "extracted",
    sourcePath: "Sources/Datasheets/timer.pdf",
    filename: "timer.pdf",
    extension: ".pdf",
    sizeBytes: 2048,
    contentHash: "sha256:timer",
    importedAt: "2026-04-30T08:00:00.000Z",
    extractor: {
      id: "marker",
      name: "Marker",
      version: "1.0.0"
    },
    extractionOptions: {},
    extractedMarkdown: markdown,
    diagnostics: [],
    attachments: [],
    ...overrides
  };
}

const baseMarkdown = [
  "# Timer Datasheet",
  "",
  "Pin 1 controls reset.",
  "",
  "## Electrical Characteristics",
  "",
  "Supply voltage ranges from 4.5V to 16V.",
  "",
  "Timing accuracy depends on resistor tolerance.",
  "",
  "## Example Script",
  "",
  "```bat",
  "set TIMER_MODE=astable",
  "echo %TIMER_MODE%",
  "```"
].join("\n");

describe("chunkSourceRecord", () => {
  it("creates source-owned chunks from extracted Markdown headings and blocks", () => {
    const chunks = chunkSourceRecord(sourceRecord(baseMarkdown));

    expect(chunks.map((chunk) => ({ sectionPath: chunk.sectionPath, text: chunk.text, provenance: chunk.provenance }))).toEqual([
      {
        sectionPath: ["Timer Datasheet"],
        text: "Pin 1 controls reset.",
        provenance: { kind: "section", sectionPath: ["Timer Datasheet"] }
      },
      {
        sectionPath: ["Timer Datasheet", "Electrical Characteristics"],
        text: "Supply voltage ranges from 4.5V to 16V.",
        provenance: { kind: "section", sectionPath: ["Timer Datasheet", "Electrical Characteristics"] }
      },
      {
        sectionPath: ["Timer Datasheet", "Electrical Characteristics"],
        text: "Timing accuracy depends on resistor tolerance.",
        provenance: { kind: "section", sectionPath: ["Timer Datasheet", "Electrical Characteristics"] }
      },
      {
        sectionPath: ["Timer Datasheet", "Example Script"],
        text: ["```bat", "set TIMER_MODE=astable", "echo %TIMER_MODE%", "```"].join("\n"),
        provenance: { kind: "section", sectionPath: ["Timer Datasheet", "Example Script"] }
      }
    ]);
    expect(chunks.every((chunk) => chunk.id.startsWith("source-chunk:"))).toBe(true);
    expect(chunks.every((chunk) => chunk.sourceId === "source:timer-datasheet")).toBe(true);
    expect(chunks.every((chunk) => chunk.sourcePath === "Sources/Datasheets/timer.pdf")).toBe(true);
  });

  it("keeps unchanged source chunk IDs stable when nearby extracted text is inserted", () => {
    const editedMarkdown = baseMarkdown.replace(
      "Timing accuracy depends on resistor tolerance.",
      "Output frequency changes with capacitor value.\n\nTiming accuracy depends on resistor tolerance."
    );
    const before = chunkSourceRecord(sourceRecord(baseMarkdown));
    const after = chunkSourceRecord(sourceRecord(editedMarkdown));

    const beforeByText = Object.fromEntries(before.map((chunk) => [chunk.text, chunk.id]));
    const afterByText = Object.fromEntries(after.map((chunk) => [chunk.text, chunk.id]));

    expect(afterByText["Supply voltage ranges from 4.5V to 16V."]).toBe(
      beforeByText["Supply voltage ranges from 4.5V to 16V."]
    );
    expect(afterByText["Timing accuracy depends on resistor tolerance."]).toBe(
      beforeByText["Timing accuracy depends on resistor tolerance."]
    );
    expect(afterByText[["```bat", "set TIMER_MODE=astable", "echo %TIMER_MODE%", "```"].join("\n")]).toBe(
      beforeByText[["```bat", "set TIMER_MODE=astable", "echo %TIMER_MODE%", "```"].join("\n")]
    );
    expect(afterByText["Output frequency changes with capacitor value."]).toBeDefined();
  });

  it("uses ordinal only to disambiguate duplicate source chunks in the same section", () => {
    const chunks = chunkSourceRecord(sourceRecord(["# Timer Datasheet", "", "Repeat.", "", "Repeat."].join("\n")));

    expect(chunks).toHaveLength(2);
    expect(chunks.map((chunk) => chunk.ordinal)).toEqual([0, 1]);
    expect(chunks[0]!.normalizedTextHash).toBe(chunks[1]!.normalizedTextHash);
    expect(chunks[0]!.id).not.toBe(chunks[1]!.id);
  });

  it("does not chunk failed source workspaces", () => {
    expect(chunkSourceRecord(sourceRecord("# Failed", { status: "failed" }))).toEqual([]);
  });
});

describe("chunkSourceRecords", () => {
  it("returns source chunks sorted by source path and source order", () => {
    const chunks = chunkSourceRecords([
      sourceRecord("B body.", { id: "source:b", sourcePath: "Sources/B.txt", filename: "B.txt" }),
      sourceRecord("A body.", { id: "source:a", sourcePath: "Sources/A.txt", filename: "A.txt" })
    ]);

    expect(chunks.map((chunk) => `${chunk.sourcePath}:${chunk.text}`)).toEqual([
      "Sources/A.txt:A body.",
      "Sources/B.txt:B body."
    ]);
  });
});
