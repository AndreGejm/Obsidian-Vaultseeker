import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Obsidian manifest release contract", () => {
  it("marks Vaultseer as desktop-only because native Codex and source extraction use Node APIs", async () => {
    const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8")) as {
      isDesktopOnly?: unknown;
    };

    expect(manifest.isDesktopOnly).toBe(true);
  });
});
