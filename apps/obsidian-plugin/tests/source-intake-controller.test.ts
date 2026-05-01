import { describe, expect, it } from "vitest";
import { InMemoryVaultseerStore } from "@vaultseer/core";
import { importVaultTextSourceWorkspace } from "../src/source-intake-controller";

const baseInput = {
  sourcePath: "Sources/Scripts/timer.ps1",
  filename: "timer.ps1",
  extension: ".ps1",
  sizeBytes: 78,
  now: () => "2026-05-01T10:00:00.000Z"
};

describe("importVaultTextSourceWorkspace", () => {
  it("imports a vault-local text source into stored source records and chunks", async () => {
    const store = new InMemoryVaultseerStore();

    const summary = await importVaultTextSourceWorkspace({
      ...baseInput,
      store,
      readText: async () => "Set-Variable -Name TimerMode -Value Astable\nWrite-Output $TimerMode"
    });

    expect(summary).toEqual({
      status: "extracted",
      sourceId: expect.stringMatching(/^source:builtin-text:/),
      sourcePath: "Sources/Scripts/timer.ps1",
      chunkCount: 1,
      message: "Imported timer.ps1 as a searchable source workspace."
    });
    await expect(store.getSourceRecords()).resolves.toEqual([
      expect.objectContaining({
        id: summary.sourceId,
        status: "extracted",
        sourcePath: "Sources/Scripts/timer.ps1",
        importedAt: "2026-05-01T10:00:00.000Z"
      })
    ]);
    await expect(store.getSourceChunkRecords()).resolves.toEqual([
      expect.objectContaining({
        sourceId: summary.sourceId,
        sourcePath: "Sources/Scripts/timer.ps1"
      })
    ]);
  });

  it("stores unsupported vault files as failed source workspaces without reading file content", async () => {
    const store = new InMemoryVaultseerStore();
    let readCalled = false;

    const summary = await importVaultTextSourceWorkspace({
      ...baseInput,
      store,
      sourcePath: "Sources/Datasheets/timer.pdf",
      filename: "timer.pdf",
      extension: ".pdf",
      readText: async () => {
        readCalled = true;
        return "%PDF-1.7";
      }
    });

    expect(readCalled).toBe(false);
    expect(summary).toEqual({
      status: "failed",
      sourceId: expect.stringMatching(/^source:builtin-text:/),
      sourcePath: "Sources/Datasheets/timer.pdf",
      chunkCount: 0,
      failureMode: "unsupported_file_type",
      message: "Could not import timer.pdf: unsupported_file_type."
    });
    await expect(store.getSourceRecords()).resolves.toEqual([
      expect.objectContaining({
        id: summary.sourceId,
        status: "failed",
        diagnostics: [
          expect.objectContaining({
            code: "unsupported_file_type"
          })
        ]
      })
    ]);
    await expect(store.getSourceChunkRecords()).resolves.toEqual([]);
  });

  it("stores a failed source workspace when Obsidian cannot read a supported text file", async () => {
    const store = new InMemoryVaultseerStore();

    const summary = await importVaultTextSourceWorkspace({
      ...baseInput,
      store,
      readText: async () => {
        throw new Error("locked file");
      }
    });

    expect(summary).toEqual({
      status: "failed",
      sourceId: expect.stringMatching(/^source:builtin-text:/),
      sourcePath: "Sources/Scripts/timer.ps1",
      chunkCount: 0,
      failureMode: "read_failed",
      message: "Could not import timer.ps1: read_failed."
    });
    await expect(store.getSourceRecords()).resolves.toEqual([
      expect.objectContaining({
        id: summary.sourceId,
        status: "failed",
        diagnostics: [
          expect.objectContaining({
            code: "read_failed"
          })
        ]
      })
    ]);
  });
});
