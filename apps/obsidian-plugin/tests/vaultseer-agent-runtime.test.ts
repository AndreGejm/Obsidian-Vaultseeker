import { describe, expect, it, vi } from "vitest";
import { InMemoryVaultseerStore } from "@vaultseer/core";
import { createApprovedScriptRegistry } from "../src/approved-script-registry";
import { createCodexReadOnlyToolImplementations } from "../src/codex-read-only-tool-implementations";
import type { VaultseerAgentProvider } from "../src/vaultseer-agent-runtime";
import { runVaultseerAgentTurn } from "../src/vaultseer-agent-runtime";
import { createVaultseerAgentToolRegistry } from "../src/vaultseer-agent-tool-registry";

describe("runVaultseerAgentTurn", () => {
  it("lets the provider call Vaultseer tools and continue from tool results", async () => {
    const searchNotes = vi.fn(async () => ({
      status: "ready",
      results: [{ notePath: "Electronics/Resistor Types.md", title: "Resistor Types" }]
    }));
    const provider: VaultseerAgentProvider = {
      respond: vi
        .fn()
        .mockResolvedValueOnce({
          message: "I will search the vault.",
          toolCalls: [{ id: "call-search", name: "search_notes", input: { query: "resistor", limit: 3 } }]
        })
        .mockResolvedValueOnce({
          message: "I found Electronics/Resistor Types.md."
        })
    };
    const registry = createVaultseerAgentToolRegistry({
      tools: {
        inspectCurrentNote: async () => ({ status: "ready" }),
        searchNotes,
        searchSources: async () => ({ status: "ready", results: [] }),
        stageSuggestion: async () => ({ status: "planned" })
      }
    });

    const result = await runVaultseerAgentTurn({
      provider,
      registry,
      userMessage: "find resistor notes"
    });

    expect(result.status).toBe("completed");
    expect(result.assistantMessage).toBe("I found Electronics/Resistor Types.md.");
    expect(searchNotes).toHaveBeenCalledWith({ query: "resistor", limit: 3 });
    expect(result.toolEvents).toEqual([
      {
        callId: "call-search",
        tool: "search_notes",
        result: {
          ok: true,
          tool: "search_notes",
          output: {
            status: "ready",
            results: [{ notePath: "Electronics/Resistor Types.md", title: "Resistor Types" }]
          }
        }
      }
    ]);
    expect(provider.respond).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: "tool",
            toolCallId: "call-search",
            name: "search_notes",
            content: expect.stringContaining("Resistor Types")
          })
        ])
      })
    );
  });

  it("does not execute proposal tools unless the turn explicitly allows proposal execution", async () => {
    const stageSuggestion = vi.fn(async () => ({ status: "planned" }));
    const provider: VaultseerAgentProvider = {
      respond: vi
        .fn()
        .mockResolvedValueOnce({
          message: "I will stage a rewrite.",
          toolCalls: [{ id: "call-stage", name: "stage_suggestion", input: { kind: "rewrite", markdown: "# Draft" } }]
        })
        .mockResolvedValueOnce({
          message: "The proposal needs user approval."
        })
    };
    const registry = createVaultseerAgentToolRegistry({
      tools: {
        inspectCurrentNote: async () => ({ status: "ready" }),
        searchNotes: async () => ({ status: "ready", results: [] }),
        searchSources: async () => ({ status: "ready", results: [] }),
        stageSuggestion
      }
    });

    const result = await runVaultseerAgentTurn({
      provider,
      registry,
      userMessage: "stage a rewrite"
    });

    expect(result.status).toBe("completed");
    expect(stageSuggestion).not.toHaveBeenCalled();
    expect(result.toolEvents).toEqual([
      {
        callId: "call-stage",
        tool: "stage_suggestion",
        result: expect.objectContaining({
          ok: false,
          tool: "stage_suggestion",
          message: expect.stringContaining("requires explicit proposal approval")
        })
      }
    ]);
  });

  it("stops with a clear status when tool calls exceed the configured iteration limit", async () => {
    const provider: VaultseerAgentProvider = {
      respond: vi.fn(async () => ({
        message: "Still inspecting.",
        toolCalls: [{ id: "call-loop", name: "inspect_current_note", input: {} }]
      }))
    };
    const registry = createVaultseerAgentToolRegistry({
      tools: {
        inspectCurrentNote: async () => ({ status: "ready" }),
        searchNotes: async () => ({ status: "ready", results: [] }),
        searchSources: async () => ({ status: "ready", results: [] }),
        stageSuggestion: async () => ({ status: "planned" })
      }
    });

    const result = await runVaultseerAgentTurn({
      provider,
      registry,
      userMessage: "loop",
      maxToolIterations: 1
    });

    expect(result.status).toBe("tool_iteration_limit");
    expect(result.assistantMessage).toContain("tool-call limit");
    expect(result.toolEvents).toHaveLength(1);
  });

  it("lets the provider list approved scripts through the native Vaultseer tool runtime", async () => {
    const approvedScriptRegistry = createApprovedScriptRegistry({
      definitions: [
        {
          id: "tag-review",
          title: "Tag review",
          description: "Review tags for the active note.",
          scope: "active-note",
          permission: "active-note-proposal",
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false
          },
          enabled: true,
          timeoutSeconds: 10
        }
      ],
      handlers: {}
    });
    const tools = createCodexReadOnlyToolImplementations({
      store: new InMemoryVaultseerStore(),
      getActivePath: () => "Electronics/Resistor Types.md",
      approvedScriptRegistry
    });
    const provider: VaultseerAgentProvider = {
      respond: vi
        .fn()
        .mockResolvedValueOnce({
          message: "I will inspect the approved script container.",
          toolCalls: [{ id: "call-approved-scripts", name: "list_approved_scripts", input: {} }]
        })
        .mockResolvedValueOnce({
          message: "Tag review is available."
        })
    };

    const result = await runVaultseerAgentTurn({
      provider,
      registry: createVaultseerAgentToolRegistry({ tools }),
      userMessage: "what approved scripts can you use?"
    });

    expect(result.status).toBe("completed");
    expect(result.toolEvents).toEqual([
      {
        callId: "call-approved-scripts",
        tool: "list_approved_scripts",
        result: {
          ok: true,
          tool: "list_approved_scripts",
          output: [
            expect.objectContaining({
              id: "tag-review",
              title: "Tag review",
              permission: "active-note-proposal"
            })
          ]
        }
      }
    ]);
  });
});
