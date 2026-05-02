import { describe, expect, it } from "vitest";
import { dispatchCodexToolRequest } from "../src/codex-tool-dispatcher";

describe("dispatchCodexToolRequest", () => {
  it("allows current note inspection", async () => {
    const result = await dispatchCodexToolRequest({
      request: { tool: "inspect_current_note", input: {} },
      tools: {
        inspectCurrentNote: async () => ({ status: "ready", title: "VHDL" }),
        searchNotes: async () => [],
        searchSources: async () => [],
        stageSuggestion: async () => ({ staged: true })
      }
    });

    expect(result.ok).toBe(true);
    expect(result.tool).toBe("inspect_current_note");
  });

  it("rejects unknown or write-like tools", async () => {
    const result = await dispatchCodexToolRequest({
      request: { tool: "write_file", input: {} },
      tools: {
        inspectCurrentNote: async () => ({ status: "ready" }),
        searchNotes: async () => [],
        searchSources: async () => [],
        stageSuggestion: async () => ({ staged: true })
      }
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("not allowed");
  });
});
