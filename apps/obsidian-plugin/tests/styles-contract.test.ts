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

  it("preserves chat message line breaks so assistant answers stay readable", async () => {
    const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");

    expect(css).toContain(".vaultseer-codex-message-body");
    expect(css).toContain("white-space: pre-wrap;");
    expect(css).toContain("overflow-wrap: anywhere;");
  });

  it("keeps rendered chat Markdown compact inside message bubbles", async () => {
    const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");

    expect(css).toContain(".vaultseer-codex-message-body > :first-child");
    expect(css).toContain(".vaultseer-codex-message-body > :last-child");
    expect(css).toContain(".vaultseer-codex-message-body pre");
  });

  it("styles the active agent profile as a quiet status pill", async () => {
    const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");

    expect(css).toContain(".vaultseer-codex-profile");
    expect(css).toContain("border: 1px solid var(--background-modifier-border);");
    expect(css).toContain("border-radius: 999px;");
  });
});
