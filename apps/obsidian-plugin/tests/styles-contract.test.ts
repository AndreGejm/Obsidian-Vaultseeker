import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Vaultseer stylesheet contract", () => {
  it("allows users to select and copy rendered Vaultseer text", async () => {
    const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");

    expect(css).toContain(".vaultseer-codex-shell,");
    expect(css).toContain(".vaultseer-studio-body");
    expect(css).toContain("-webkit-user-select: text;");
    expect(css).toContain("user-select: text;");
  });
});
