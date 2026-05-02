import { describe, expect, it, vi } from "vitest";
import {
  dispatchCodexToolRequest,
  getCodexToolRequestClass,
  isAllowedCodexTool,
  isProposalCodexTool,
  isReadOnlyCodexTool
} from "../src/codex-tool-dispatcher";

describe("dispatchCodexToolRequest", () => {
  it("exposes the Vaultseer Codex tool allowlist as a predicate", () => {
    expect(isAllowedCodexTool("inspect_current_note")).toBe(true);
    expect(isAllowedCodexTool("search_notes")).toBe(true);
    expect(isAllowedCodexTool("search_sources")).toBe(true);
    expect(isAllowedCodexTool("stage_suggestion")).toBe(true);
    expect(isAllowedCodexTool("write_file")).toBe(false);
  });

  it("classifies read-only and proposal tools separately", () => {
    expect(isReadOnlyCodexTool("inspect_current_note")).toBe(true);
    expect(isReadOnlyCodexTool("search_notes")).toBe(true);
    expect(isReadOnlyCodexTool("search_sources")).toBe(true);
    expect(isReadOnlyCodexTool("stage_suggestion")).toBe(false);
    expect(isReadOnlyCodexTool("write_file")).toBe(false);

    expect(isProposalCodexTool("stage_suggestion")).toBe(true);
    expect(isProposalCodexTool("search_notes")).toBe(false);
    expect(getCodexToolRequestClass("search_notes")).toBe("read-only");
    expect(getCodexToolRequestClass("stage_suggestion")).toBe("proposal");
    expect(getCodexToolRequestClass("write_file")).toBeNull();
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

  it("rejects proposal tools by default and delegates when proposals are explicitly allowed", async () => {
    const tools = {
      inspectCurrentNote: vi.fn(async () => ({ status: "ready" })),
      searchNotes: vi.fn(async () => []),
      searchSources: vi.fn(async () => []),
      stageSuggestion: vi.fn(async () => ({ staged: true }))
    };

    const rejected = await dispatchCodexToolRequest({
      request: { tool: "stage_suggestion", input: { kind: "tag", value: "vhdl" } },
      tools
    });

    expect(rejected.ok).toBe(false);
    expect(rejected.tool).toBe("stage_suggestion");
    expect(rejected.message).toContain("requires explicit proposal approval");
    expect(tools.stageSuggestion).not.toHaveBeenCalled();

    const allowed = await dispatchCodexToolRequest({
      request: { tool: "stage_suggestion", input: { kind: "tag", value: "vhdl" } },
      tools,
      allowProposalTools: true
    });

    expect(allowed).toEqual({ ok: true, tool: "stage_suggestion", output: { staged: true } });
    expect(tools.stageSuggestion).toHaveBeenCalledWith({ kind: "tag", value: "vhdl" });
  });

  it("forwards proposal freshness context only when proposals are explicitly allowed", async () => {
    const beforeProposalCommit = vi.fn(() => true);
    const tools = {
      inspectCurrentNote: vi.fn(async () => ({ status: "ready" })),
      searchNotes: vi.fn(async () => []),
      searchSources: vi.fn(async () => []),
      stageSuggestion: vi.fn(async () => ({ staged: true }))
    };

    await dispatchCodexToolRequest({
      request: { tool: "stage_suggestion", input: { kind: "tag", tags: ["vhdl/timing"] } },
      tools,
      beforeProposalCommit
    });

    expect(tools.stageSuggestion).not.toHaveBeenCalled();

    const allowed = await dispatchCodexToolRequest({
      request: { tool: "stage_suggestion", input: { kind: "tag", tags: ["vhdl/timing"] } },
      tools,
      allowProposalTools: true,
      beforeProposalCommit
    });

    expect(allowed).toEqual({ ok: true, tool: "stage_suggestion", output: { staged: true } });
    expect(tools.stageSuggestion).toHaveBeenCalledWith(
      { kind: "tag", tags: ["vhdl/timing"] },
      { beforeProposalCommit }
    );
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
      allowProposalTools: true,
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
