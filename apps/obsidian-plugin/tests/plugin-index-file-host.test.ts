import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NodeVaultseerIndexFileHost } from "../src/plugin-index-file-host";
import type { StoredVaultIndex } from "@vaultseer/core";

const storedIndex: StoredVaultIndex = {
  schemaVersion: 1,
  notes: [],
  fileVersions: [],
  chunks: [],
  lexicalIndex: [],
  vectors: [],
  embeddingJobs: [],
  suggestions: [],
  decisions: [],
  health: {
    schemaVersion: 1,
    status: "ready",
    statusMessage: null,
    lastIndexedAt: "2026-05-03T11:30:00.000Z",
    noteCount: 0,
    chunkCount: 0,
    vectorCount: 0,
    suggestionCount: 0,
    warnings: []
  }
};

describe("NodeVaultseerIndexFileHost", () => {
  let tempDir = "";

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "vaultseer-index-host-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("loads null for a missing index file, then saves, loads, and clears index data", async () => {
    const host = new NodeVaultseerIndexFileHost(path.join(tempDir, "nested", "vaultseer-index.json"));

    await expect(host.loadIndexData()).resolves.toBeNull();

    await host.saveIndexData(storedIndex);
    await expect(host.loadIndexData()).resolves.toEqual(storedIndex);

    await host.clearIndexData();
    await expect(host.loadIndexData()).resolves.toBeNull();
  });
});
