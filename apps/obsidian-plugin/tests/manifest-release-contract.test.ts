import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Obsidian manifest release contract", () => {
  it("marks Vaultseer as desktop-only because native Codex and source extraction use Node APIs", async () => {
    const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8")) as {
      isDesktopOnly?: unknown;
    };

    expect(manifest.isDesktopOnly).toBe(true);
  });

  it("uses the same private beta version in manifest and package metadata", async () => {
    const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8")) as {
      version?: unknown;
    };
    const pluginPackage = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as {
      version?: unknown;
    };
    const rootPackage = JSON.parse(await readFile(new URL("../../../package.json", import.meta.url), "utf8")) as {
      version?: unknown;
    };

    expect(manifest.version).toBe("0.1.0-local");
    expect(pluginPackage.version).toBe("0.1.0-local");
    expect(rootPackage.version).toBe("0.1.0-local");
  });
});
