import { describe, expect, it, vi } from "vitest";
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

  it("forwards explicit proposal review authority to the dispatcher when the user-approved turn can apply", async () => {
    const reviewCurrentNoteProposal = vi.fn(async () => ({ status: "applied" }));
    const provider: VaultseerAgentProvider = {
      respond: vi
        .fn()
        .mockResolvedValueOnce({
          message: "I will apply the approved proposal.",
          toolCalls: [{ id: "call-apply", name: "review_current_note_proposal", input: { apply: true } }]
        })
        .mockResolvedValueOnce({
          message: "Applied."
        })
    };
    const registry = createVaultseerAgentToolRegistry({
      tools: {
        inspectCurrentNote: async () => ({ status: "ready" }),
        searchNotes: async () => ({ status: "ready", results: [] }),
        searchSources: async () => ({ status: "ready", results: [] }),
        stageSuggestion: async () => ({ status: "planned" }),
        reviewCurrentNoteProposal
      }
    });

    const result = await runVaultseerAgentTurn({
      provider,
      registry,
      userMessage: "yes, apply it",
      allowProposalReviewTools: true
    });

    expect(result.status).toBe("completed");
    expect(reviewCurrentNoteProposal).toHaveBeenCalledWith({ apply: true });
    expect(result.toolEvents).toEqual([
      {
        callId: "call-apply",
        tool: "review_current_note_proposal",
        result: {
          ok: true,
          tool: "review_current_note_proposal",
          output: { status: "applied" }
        }
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

  it("does not let the provider inspect or run approved scripts through Codex chat", async () => {
    const provider: VaultseerAgentProvider = {
      respond: vi
        .fn()
        .mockResolvedValueOnce({
          message: "I will inspect the approved script container.",
          toolCalls: [{ id: "call-approved-scripts", name: "list_approved_scripts", input: {} }]
        })
        .mockResolvedValueOnce({
          message: "Scripts are not available to this chat."
        })
    };

    const result = await runVaultseerAgentTurn({
      provider,
      registry: createVaultseerAgentToolRegistry({
        tools: {
          inspectCurrentNote: async () => ({ status: "ready" }),
          searchNotes: async () => ({ status: "ready", results: [] }),
          searchSources: async () => ({ status: "ready", results: [] }),
          stageSuggestion: async () => ({ status: "planned" })
        }
      }),
      userMessage: "what approved scripts can you use?"
    });

    expect(result.status).toBe("completed");
    expect(result.toolEvents).toEqual([
      {
        callId: "call-approved-scripts",
        tool: "list_approved_scripts",
        result: {
          ok: false,
          tool: "list_approved_scripts",
          message: "Codex tool 'list_approved_scripts' is not allowed by Vaultseer."
        }
      }
    ]);
  });

  it("passes user attachments to the provider as multimodal content parts", async () => {
    const provider: VaultseerAgentProvider = {
      respond: vi.fn(async () => ({
        message: "The image is attached."
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

    await runVaultseerAgentTurn({
      provider,
      registry,
      userMessage: "describe this",
      userAttachments: [{ type: "image_url", imageUrl: "data:image/jpeg;base64,abc123", detail: "low" }]
    });

    expect(provider.respond).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: "user",
            content: [
              { type: "text", text: "describe this" },
              { type: "image_url", imageUrl: "data:image/jpeg;base64,abc123", detail: "low" }
            ]
          })
        ])
      })
    );
  });

  it("attaches multimodal content parts returned by tools as follow-up user input", async () => {
    const provider: VaultseerAgentProvider = {
      respond: vi
        .fn()
        .mockResolvedValueOnce({
          message: "I will inspect the image.",
          toolCalls: [{ id: "call-image", name: "read_vault_image", input: { path: "Images/resistor.png" } }]
        })
        .mockResolvedValueOnce({
          message: "The image shows a resistor."
        })
    };
    const registry = createVaultseerAgentToolRegistry({
      tools: {
        inspectCurrentNote: async () => ({ status: "ready" }),
        searchNotes: async () => ({ status: "ready", results: [] }),
        searchSources: async () => ({ status: "ready", results: [] }),
        readVaultImage: async () => ({
          status: "ready",
          path: "Images/resistor.png",
          contentPart: { type: "image_url", imageUrl: "data:image/png;base64,abc123", detail: "auto" }
        }),
        stageSuggestion: async () => ({ status: "planned" })
      }
    });

    await runVaultseerAgentTurn({
      provider,
      registry,
      userMessage: "what is in this image?"
    });

    expect(provider.respond).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: "tool",
            name: "read_vault_image",
            content: expect.stringContaining("\"imageUrl\":\"[attached as multimodal content]\"")
          }),
          expect.objectContaining({
            role: "user",
            content: [
              { type: "text", text: "Vaultseer attached image content returned by read_vault_image." },
              { type: "image_url", imageUrl: "data:image/png;base64,abc123", detail: "auto" }
            ]
          })
        ])
      })
    );
  });
});
