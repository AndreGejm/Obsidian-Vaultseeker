import { describe, expect, it } from "vitest";
import { VaultPathPolicyError, validateVaultRelativePath } from "../src/vault-path-policy";

describe("validateVaultRelativePath", () => {
  it("accepts clean Obsidian vault-relative note paths", () => {
    expect(validateVaultRelativePath("Electronics/Resistor Types.md")).toBe("Electronics/Resistor Types.md");
    expect(validateVaultRelativePath("Daily Notes/2026-05-04.md")).toBe("Daily Notes/2026-05-04.md");
  });

  it.each([
    "C:\\Users\\vikel\\Vault\\note.md",
    "F:/Dev/Obsidian/note.md",
    "/Users/vikel/Vault/note.md",
    "\\\\server\\share\\Vault\\note.md",
    "../outside.md",
    "Electronics/../outside.md",
    "Electronics\\Resistor Types.md",
    ".obsidian/plugins/vaultseer/data.json",
    ".git/config",
    "node_modules/pkg/index.js"
  ])("rejects paths that could escape or target private vault internals: %s", (path) => {
    expect(() => validateVaultRelativePath(path)).toThrow(VaultPathPolicyError);
  });

  it("can require Markdown notes for note-writing tools", () => {
    expect(validateVaultRelativePath("Electronics/Resistor Types.md", { requireMarkdown: true })).toBe(
      "Electronics/Resistor Types.md"
    );
    expect(() => validateVaultRelativePath("Sources/timer.pdf", { requireMarkdown: true })).toThrow("Markdown");
  });
});
