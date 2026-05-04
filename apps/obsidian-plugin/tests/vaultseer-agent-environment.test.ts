import type { ActiveNoteContextPacket } from "@vaultseer/core";
import { describe, expect, it, vi } from "vitest";
import type { VaultseerAgentProvider } from "../src/vaultseer-agent-runtime";
import { VaultseerAgentEnvironment, buildVaultseerAgentContextMessage } from "../src/vaultseer-agent-environment";
import { createVaultseerAgentToolRegistry } from "../src/vaultseer-agent-tool-registry";

describe("VaultseerAgentEnvironment", () => {
  it("lets the agent inspect and stage an active-note rewrite without asking the user to run stage_suggestion", async () => {
    const stageSuggestion = vi.fn(async () => ({
      status: "planned",
      message: "Staged 1 note rewrite for review. No note was changed."
    }));
    const provider: VaultseerAgentProvider = {
      respond: vi
        .fn()
        .mockResolvedValueOnce({
          message: "I will inspect the active note.",
          toolCalls: [{ id: "call-inspect", name: "inspect_current_note", input: {} }]
        })
        .mockResolvedValueOnce({
          message: "I will stage a rewrite proposal.",
          toolCalls: [
            {
              id: "call-stage",
              name: "stage_suggestion",
              input: {
                kind: "rewrite",
                targetPath: "Electronics/Resistor types 2.md",
                markdown: "# Resistor types 2\n\nA clearer note.",
                reason: "User asked to make the active note more readable."
              }
            }
          ]
        })
        .mockResolvedValueOnce({
          message: "I staged a rewrite for review."
        })
    };
    const registry = createVaultseerAgentToolRegistry({
      tools: {
        inspectCurrentNote: async () => ({
          status: "ready",
          liveNote: { text: "# Resistor types 2\n\nrough notes" }
        }),
        searchNotes: async () => ({ status: "ready", results: [] }),
        searchSources: async () => ({ status: "ready", results: [] }),
        stageSuggestion
      }
    });
    const environment = new VaultseerAgentEnvironment({
      providerFactory: () => provider,
      registry
    });

    const response = await environment.send({
      message: "review this note and write the suggestion to review",
      context: readyContext()
    });

    expect(response.content).toBe("I staged a rewrite for review.");
    expect(response.toolRequests).toEqual([]);
    expect(response.toolEvents?.map((event) => event.tool)).toEqual(["inspect_current_note", "stage_suggestion"]);
    expect(stageSuggestion).toHaveBeenCalledWith({
      kind: "rewrite",
      targetPath: "Electronics/Resistor types 2.md",
      markdown: "# Resistor types 2\n\nA clearer note.",
      reason: "User asked to make the active note more readable."
    });
    expect(provider.respond).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: "system",
            content: expect.stringContaining("Do not ask the user to run stage_suggestion")
          })
        ])
      })
    );
  });

  it("does not expose proposal apply/review as an autonomous provider tool", async () => {
    const provider: VaultseerAgentProvider = {
      respond: vi.fn(async () => ({ message: "Ready." }))
    };
    const registry = createVaultseerAgentToolRegistry({
      tools: {
        inspectCurrentNote: async () => ({ status: "ready" }),
        searchNotes: async () => ({ status: "ready", results: [] }),
        searchSources: async () => ({ status: "ready", results: [] }),
        stageSuggestion: async () => ({ status: "planned" }),
        reviewCurrentNoteProposal: async () => ({ status: "applied" })
      }
    });
    const environment = new VaultseerAgentEnvironment({
      providerFactory: () => provider,
      registry
    });

    await environment.send({
      message: "What can you do?",
      context: readyContext()
    });

    expect(provider.respond).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: expect.arrayContaining([expect.objectContaining({ name: "stage_suggestion" })])
      })
    );
    expect(provider.respond).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: expect.not.arrayContaining([expect.objectContaining({ name: "review_current_note_proposal" })])
      })
    );
  });

  it("exposes proposal review/apply only on explicit user apply requests", async () => {
    const provider: VaultseerAgentProvider = {
      respond: vi.fn(async () => ({ message: "I applied the approved active-note proposal." }))
    };
    const registry = createVaultseerAgentToolRegistry({
      tools: {
        inspectCurrentNote: async () => ({ status: "ready" }),
        searchNotes: async () => ({ status: "ready", results: [] }),
        searchSources: async () => ({ status: "ready", results: [] }),
        stageSuggestion: async () => ({ status: "planned" }),
        reviewCurrentNoteProposal: async () => ({ status: "applied" })
      }
    });
    const environment = new VaultseerAgentEnvironment({
      providerFactory: () => provider,
      registry
    });

    await environment.send({
      message: "ok write this to the actual note",
      context: readyContext()
    });

    expect(provider.respond).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: expect.arrayContaining([expect.objectContaining({ name: "review_current_note_proposal" })])
      })
    );
  });

  it("puts live active-note text into the agent context even when indexed chunks are empty", () => {
    const message = buildVaultseerAgentContextMessage({
      userMessage: "refactor this",
      context: readyContext({
        noteChunks: [],
        liveNote: {
          source: "active_file",
          contentHash: "hash-live",
          text: "# Resistor types 2\n\nCarbon film and metal film notes.",
          truncated: false
        }
      })
    });

    expect(message).toContain("Carbon film and metal film notes.");
    expect(message).toContain('"noteChunkCount": 0');
    expect(message).toContain("Use liveNote.text as the active-note body");
  });

  it("passes user image attachments to the native agent runtime", async () => {
    const provider: VaultseerAgentProvider = {
      respond: vi.fn(async () => ({ message: "I can see the attached image." }))
    };
    const environment = new VaultseerAgentEnvironment({
      providerFactory: () => provider,
      registry: createVaultseerAgentToolRegistry({
        tools: {
          inspectCurrentNote: async () => ({ status: "ready" }),
          searchNotes: async () => ({ status: "ready", results: [] }),
          searchSources: async () => ({ status: "ready", results: [] }),
          stageSuggestion: async () => ({ status: "planned" })
        }
      })
    });

    await environment.send({
      message: "What does this image show?",
      context: readyContext(),
      attachments: [
        {
          type: "image_url",
          imageUrl: "data:image/png;base64,AQID",
          detail: "auto"
        }
      ]
    });

    expect(provider.respond).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: "user",
            content: expect.arrayContaining([
              expect.objectContaining({ type: "text", text: expect.stringContaining("What does this image show?") }),
              {
                type: "image_url",
                imageUrl: "data:image/png;base64,AQID",
                detail: "auto"
              }
            ])
          })
        ])
      })
    );
  });

  it("returns a blocked-context response without contacting the provider", async () => {
    const provider: VaultseerAgentProvider = {
      respond: vi.fn()
    };
    const environment = new VaultseerAgentEnvironment({
      providerFactory: () => provider,
      registry: createVaultseerAgentToolRegistry({
        tools: {
          inspectCurrentNote: async () => ({ status: "ready" }),
          searchNotes: async () => ({ status: "ready", results: [] }),
          searchSources: async () => ({ status: "ready", results: [] }),
          stageSuggestion: async () => ({ status: "planned" })
        }
      })
    });

    const response = await environment.send({
      message: "hello",
      context: {
        status: "blocked",
        message: "Open a markdown note first.",
        note: null,
        noteChunks: [],
        relatedNotes: [],
        sourceExcerpts: []
      }
    });

    expect(response.content).toBe("Open a markdown note first.");
    expect(response.toolRequests).toEqual([]);
    expect(provider.respond).not.toHaveBeenCalled();
  });
});

function readyContext(overrides: Partial<ActiveNoteContextPacket> = {}): ActiveNoteContextPacket {
  return {
    status: "ready",
    message: "Active note context is ready.",
    note: {
      path: "Electronics/Resistor types 2.md",
      title: "Resistor types 2",
      aliases: [],
      tags: [],
      headings: [],
      links: []
    },
    liveNote: {
      source: "active_file",
      contentHash: "hash-live",
      text: "# Resistor types 2\n\nrough notes",
      truncated: false
    },
    noteChunks: [],
    relatedNotes: [],
    sourceExcerpts: [],
    ...overrides
  };
}
