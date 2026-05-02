import { describe, expect, it, vi } from "vitest";
import type { ActiveNoteContextPacket } from "@vaultseer/core";
import { AcpCodexChatAdapter, NotConfiguredCodexChatAdapter } from "../src/codex-chat-adapter";

describe("AcpCodexChatAdapter", () => {
  it("sends ready active note context and the user message to the injected transport", async () => {
    const transport = {
      send: vi.fn(async () => ({
        content: "Try a vhdl/timing tag.",
        toolRequests: [{ tool: "stage_suggestion", input: { kind: "tag", value: "vhdl/timing" } }]
      }))
    };
    const adapter = new AcpCodexChatAdapter(transport);
    const context = readyContext();

    const response = await adapter.send({ message: "Suggest a tag", context });

    expect(transport.send).toHaveBeenCalledTimes(1);
    expect(transport.send).toHaveBeenCalledWith(
      expect.objectContaining({
        displayContent: "Suggest a tag",
        contextSummary: expect.objectContaining({
          notePath: "Notes/VHDL.md",
          noteTitle: "VHDL",
          noteChunkCount: 1,
          relatedNoteCount: 1,
          sourceExcerptCount: 1
        })
      })
    );
    expect(transport.send.mock.calls[0]?.[0].agentContent).toContain("User Message");
    expect(transport.send.mock.calls[0]?.[0].agentContent).toContain("Suggest a tag");
    expect(transport.send.mock.calls[0]?.[0].agentContent).toContain("Path: Notes/VHDL.md");
    expect(response).toEqual({
      content: "Try a vhdl/timing tag.",
      toolRequests: [{ tool: "stage_suggestion", input: { kind: "tag", value: "vhdl/timing" } }]
    });
  });

  it("returns a visible context message without calling transport when context is not ready", async () => {
    const transport = {
      send: vi.fn(async () => ({
        content: "Should not be used",
        toolRequests: [{ tool: "search_notes", input: { query: "vhdl" } }]
      }))
    };
    const adapter = new AcpCodexChatAdapter(transport);
    const context = blockedContext("Open a Markdown note before chatting with Vaultseer.");

    const response = await adapter.send({ message: "Hello", context });

    expect(transport.send).not.toHaveBeenCalled();
    expect(response).toEqual({
      content: "Open a Markdown note before chatting with Vaultseer.",
      toolRequests: []
    });
  });

  it("shapes transport failures into visible assistant content with no tool requests", async () => {
    const rawTransportError = "stdio closed";
    const transport = {
      send: vi.fn(async () => {
        throw new Error(rawTransportError);
      })
    };
    const adapter = new AcpCodexChatAdapter(transport);

    const response = await adapter.send({ message: "Hello", context: readyContext() });

    expect(transport.send).toHaveBeenCalledTimes(1);
    expect(response.content).toBe("Codex chat could not respond. Check the native Codex connection, then retry.");
    expect(response.content).not.toContain(rawTransportError);
    expect(response.toolRequests).toEqual([]);
  });
});

describe("NotConfiguredCodexChatAdapter", () => {
  it("returns the existing not-connected message", async () => {
    const adapter = new NotConfiguredCodexChatAdapter();

    await expect(adapter.send({ message: "Hello", context: readyContext() })).resolves.toEqual({
      content: "Native Codex chat is not connected yet. Start Codex from Vaultseer settings, then retry.",
      toolRequests: []
    });
  });
});

function readyContext(): ActiveNoteContextPacket {
  return {
    status: "ready",
    message: "Active note context is ready.",
    note: {
      path: "Notes/VHDL.md",
      title: "VHDL",
      aliases: [],
      tags: ["#vhdl"],
      headings: ["Timing"],
      links: []
    },
    noteChunks: [
      {
        chunkId: "Notes/VHDL.md#0",
        headingPath: ["Timing"],
        text: "Setup time matters."
      }
    ],
    relatedNotes: [{ path: "Notes/FPGA.md", title: "FPGA", reason: "Shares #vhdl" }],
    sourceExcerpts: [
      {
        sourceId: "src-1",
        sourcePath: "Sources/Datasheet.md",
        chunkId: "src-1#0",
        text: "Timing constraints are important.",
        evidenceLabel: "datasheet"
      }
    ]
  };
}

function blockedContext(message: string): ActiveNoteContextPacket {
  return {
    status: "blocked",
    message,
    note: null,
    noteChunks: [],
    relatedNotes: [],
    sourceExcerpts: []
  };
}
