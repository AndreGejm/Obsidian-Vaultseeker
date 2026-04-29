import { describe, expect, it } from "vitest";
import { formatIndexHealthNotice } from "../src/health-message";
import type { IndexHealth } from "@vaultseer/core";

function health(overrides: Partial<IndexHealth>): IndexHealth {
  return {
    schemaVersion: 1,
    status: "empty",
    statusMessage: null,
    lastIndexedAt: null,
    noteCount: 0,
    chunkCount: 0,
    vectorCount: 0,
    suggestionCount: 0,
    warnings: [],
    ...overrides
  };
}

describe("formatIndexHealthNotice", () => {
  it("formats empty and ready states for an operator-facing status notice", () => {
    expect(formatIndexHealthNotice(health({ status: "empty" }))).toBe(
      "Vaultseer index is empty. Rebuild the index to create a vault mirror."
    );
    expect(
      formatIndexHealthNotice(
        health({
          status: "ready",
          lastIndexedAt: "2026-04-29T22:10:00.000Z",
          noteCount: 12
        })
      )
    ).toBe("Vaultseer index ready: 12 notes indexed at 2026-04-29T22:10:00.000Z.");
  });

  it("formats stale, degraded, and error states with diagnostics", () => {
    expect(
      formatIndexHealthNotice(
        health({
          status: "stale",
          noteCount: 12,
          statusMessage: "Vault changed since last index: 1 modified."
        })
      )
    ).toBe("Vaultseer index stale: 12 notes in the last mirror. Vault changed since last index: 1 modified.");

    expect(
      formatIndexHealthNotice(
        health({
          status: "degraded",
          noteCount: 12,
          statusMessage: "Semantic provider unavailable."
        })
      )
    ).toBe("Vaultseer index degraded: 12 notes available. Semantic provider unavailable.");

    expect(
      formatIndexHealthNotice(
        health({
          status: "error",
          statusMessage: "Unsupported index schema version: 999."
        })
      )
    ).toBe("Vaultseer index error: Unsupported index schema version: 999. Clear and rebuild the index to recover.");
  });
});
