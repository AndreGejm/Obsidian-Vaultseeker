import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
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

  it("quarantines corrupt index JSON and lets the plugin start with an empty index", async () => {
    const indexPath = path.join(tempDir, "vaultseer-index.json");
    await writeFile(indexPath, '{"schemaVersion":1}}', "utf8");
    const host = new NodeVaultseerIndexFileHost(indexPath);

    await expect(host.loadIndexData()).resolves.toBeNull();

    await expect(readFile(indexPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    const quarantinedFiles = (await readdir(tempDir)).filter((name) =>
      name.startsWith("vaultseer-index.json.corrupt-")
    );
    expect(quarantinedFiles).toHaveLength(1);
    await expect(readFile(path.join(tempDir, quarantinedFiles[0]), "utf8")).resolves.toBe('{"schemaVersion":1}}');
  });

  it("handles concurrent saves without sharing one temporary file", async () => {
    const indexPath = path.join(tempDir, "vaultseer-index.json");
    const host = new NodeVaultseerIndexFileHost(indexPath);

    const saves = Array.from({ length: 32 }, (_, noteCount) =>
      host.saveIndexData({
        ...storedIndex,
        health: {
          ...storedIndex.health,
          noteCount
        }
      })
    );

    await expect(Promise.all(saves)).resolves.toHaveLength(32);

    const loaded = await host.loadIndexData();
    expect(loaded).toMatchObject({
      schemaVersion: 1,
      health: {
        status: "ready"
      }
    });
    expect((await readdir(tempDir)).filter((name) => name.includes(".tmp"))).toEqual([]);
  });
});
