import { describe, expect, it, vi } from "vitest";
import { dispatchCodexToolRequest, isAllowedCodexTool } from "../src/codex-tool-dispatcher";

describe("dispatchCodexToolRequest", () => {
  it("exposes the Vaultseer Codex tool allowlist as a predicate", () => {
    expect(isAllowedCodexTool("inspect_current_note")).toBe(true);
    expect(isAllowedCodexTool("search_notes")).toBe(true);
    expect(isAllowedCodexTool("search_sources")).toBe(true);
    expect(isAllowedCodexTool("stage_suggestion")).toBe(true);
    expect(isAllowedCodexTool("write_file")).toBe(false);
  });

  it.each([
    {
      tool: "inspect_current_note",
      input: { query: "ignored" },
      implementation: "inspectCurrentNote",
      output: { status: "ready", title: "VHDL" },
      expectedArguments: []
    },
    {
      tool: "search_notes",
      input: { query: "vhdl timing" },
      implementation: "searchNotes",
      output: [{ title: "VHDL" }],
      expectedArguments: [{ query: "vhdl timing" }]
    },
    {
      tool: "search_sources",
      input: { query: "datasheet" },
      implementation: "searchSources",
      output: [{ title: "FPGA Datasheet" }],
      expectedArguments: [{ query: "datasheet" }]
    },
    {
      tool: "stage_suggestion",
      input: { kind: "tag", value: "vhdl" },
      implementation: "stageSuggestion",
      output: { staged: true },
      expectedArguments: [{ kind: "tag", value: "vhdl" }]
    }
  ] as const)("allows $tool and delegates to $implementation", async (scenario) => {
    const tools = {
      inspectCurrentNote: vi.fn(async () => (scenario.implementation === "inspectCurrentNote" ? scenario.output : null)),
      searchNotes: vi.fn(async () => (scenario.implementation === "searchNotes" ? scenario.output : [])),
      searchSources: vi.fn(async () => (scenario.implementation === "searchSources" ? scenario.output : [])),
      stageSuggestion: vi.fn(async () => (scenario.implementation === "stageSuggestion" ? scenario.output : { staged: false }))
    };

    const result = await dispatchCodexToolRequest({
      request: { tool: scenario.tool, input: scenario.input },
      tools
    });

    expect(result).toEqual({ ok: true, tool: scenario.tool, output: scenario.output });
    expect(tools[scenario.implementation]).toHaveBeenCalledTimes(1);
    expect(tools[scenario.implementation]).toHaveBeenCalledWith(...scenario.expectedArguments);
  });

  it.each(["write_file", "unknown_tool"])("rejects disallowed tool %s", async (tool) => {
    const result = await dispatchCodexToolRequest({
      request: { tool, input: {} },
      tools: {
        inspectCurrentNote: async () => ({ status: "ready" }),
        searchNotes: async () => [],
        searchSources: async () => [],
        stageSuggestion: async () => ({ staged: true })
      }
    });

    expect(result.ok).toBe(false);
    expect(result.tool).toBe(tool);
    expect(result.message).toContain("not allowed");
  });

  it("returns a failed result when an allowed implementation throws an Error", async () => {
    const result = await dispatchCodexToolRequest({
      request: { tool: "search_notes", input: { query: "vhdl" } },
      tools: {
        inspectCurrentNote: async () => ({ status: "ready" }),
        searchNotes: async () => {
          throw new Error("search unavailable");
        },
        searchSources: async () => [],
        stageSuggestion: async () => ({ staged: true })
      }
    });

    expect(result.ok).toBe(false);
    expect(result.tool).toBe("search_notes");
    expect(result.message).toContain("search unavailable");
  });

  it("returns a fallback failed result when an allowed implementation throws a non-Error", async () => {
    const result = await dispatchCodexToolRequest({
      request: { tool: "stage_suggestion", input: { kind: "tag" } },
      tools: {
        inspectCurrentNote: async () => ({ status: "ready" }),
        searchNotes: async () => [],
        searchSources: async () => [],
        stageSuggestion: async () => {
          throw "offline";
        }
      }
    });

    expect(result).toEqual({
      ok: false,
      tool: "stage_suggestion",
      message: "Codex tool 'stage_suggestion' failed."
    });
  });
});
