import type { GuardedVaultWriteOperation, IndexHealth } from "@vaultseer/core";
import { describe, expect, it } from "vitest";
import { buildStudioStatusStrip } from "../src/studio-status-strip";

describe("buildStudioStatusStrip", () => {
  it("summarizes index, active note, review queue, and Codex status", () => {
    const health: IndexHealth = {
      schemaVersion: 1,
      status: "ready",
      statusMessage: null,
      lastIndexedAt: "2026-05-03T10:00:00.000Z",
      noteCount: 2,
      chunkCount: 5,
      vectorCount: 3,
      suggestionCount: 4,
      warnings: []
    };

    const items = buildStudioStatusStrip({
      health,
      activePath: "Notes/VHDL.md",
      notes: [{ path: "Notes/VHDL.md", title: "VHDL", aliases: [], tags: [] }],
      writeOperations: [{ id: "write-1", targetPath: "Notes/VHDL.md" } as GuardedVaultWriteOperation],
      codexRuntimeStatus: "running"
    });

    expect(items).toEqual([
      {
        id: "index",
        label: "Index",
        value: "Ready - 2 notes - 5 chunks",
        tone: "ready"
      },
      {
        id: "active-note",
        label: "Current note",
        value: "Indexed",
        tone: "ready"
      },
      {
        id: "review",
        label: "Review",
        value: "1 pending",
        tone: "attention"
      },
      {
        id: "codex",
        label: "Codex",
        value: "Connected",
        tone: "ready"
      }
    ]);
  });

  it("marks stale or missing current-note state as attention items", () => {
    const health: IndexHealth = {
      schemaVersion: 1,
      status: "stale",
      statusMessage: "Vault changed",
      lastIndexedAt: null,
      noteCount: 0,
      chunkCount: 0,
      vectorCount: 0,
      suggestionCount: 0,
      warnings: []
    };

    const items = buildStudioStatusStrip({
      health,
      activePath: "Notes/New.md",
      notes: [],
      writeOperations: [],
      codexRuntimeStatus: "failed"
    });

    expect(items.map((item) => [item.id, item.value, item.tone])).toEqual([
      ["index", "Stale - 0 notes - 0 chunks", "attention"],
      ["active-note", "Not indexed", "attention"],
      ["review", "No pending writes", "muted"],
      ["codex", "Needs attention", "attention"]
    ]);
  });
});
