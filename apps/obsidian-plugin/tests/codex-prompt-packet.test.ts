import { describe, expect, it } from "vitest";
import type { ActiveNoteContextPacket } from "@vaultseer/core";
import { buildCodexPromptPacket } from "../src/codex-prompt-packet";

describe("buildCodexPromptPacket", () => {
  it("keeps display content exact while enriching agent content with labeled Vaultseer context", () => {
    const packet = buildCodexPromptPacket({
      message: "Suggest a tag",
      context: readyContext()
    });

    expect(packet.displayContent).toBe("Suggest a tag");
    expect(packet.contextSummary).toEqual({
      notePath: "Notes/VHDL.md",
      noteTitle: "VHDL",
      tagCount: 1,
      aliasCount: 1,
      headingCount: 1,
      linkCount: 1,
      noteChunkCount: 1,
      relatedNoteCount: 1,
      sourceExcerptCount: 1,
      truncated: false
    });
    expect(packet.agentContent).toContain("Vaultseer Codex Prompt Packet");
    expect(packet.agentContent).toContain("Obsidian is the source of truth.");
    expect(packet.agentContent).toContain("must not write files directly");
    expect(packet.agentContent).toContain("Path: Notes/VHDL.md");
    expect(packet.agentContent).toContain("Title: VHDL");
    expect(packet.agentContent).toContain("Tags: #vhdl");
    expect(packet.agentContent).toContain("Aliases: hardware language");
    expect(packet.agentContent).toContain("Headings: Timing");
    expect(packet.agentContent).toContain("Links: Notes/FPGA.md");
    expect(packet.agentContent).toContain("[note-chunk:Notes/VHDL.md#0]");
    expect(packet.agentContent).toContain("Setup time matters.");
    expect(packet.agentContent).toContain("[related-note:1]");
    expect(packet.agentContent).toContain("Path: Notes/FPGA.md");
    expect(packet.agentContent).toContain("[source-excerpt:src-1#src-1#0]");
    expect(packet.agentContent).toContain("Evidence Label: datasheet");
    expect(packet.agentContent).toContain("User Message");
    expect(packet.agentContent).toContain("Suggest a tag");
  });

  it("fails closed when called with blocked context", () => {
    expect(() =>
      buildCodexPromptPacket({
        message: "Hello",
        context: blockedContext("Open a Markdown note before chatting with Vaultseer.")
      })
    ).toThrow("Cannot build Codex prompt packet from blocked active note context.");
  });

  it("bounds long context while preserving the user message", () => {
    const packet = buildCodexPromptPacket({
      message: "Summarize the active note",
      context: {
        ...readyContext(),
        noteChunks: [
          {
            chunkId: "long-note#0",
            headingPath: ["Long"],
            text: "A".repeat(600)
          }
        ],
        sourceExcerpts: [
          {
            sourceId: "source-long",
            sourcePath: "Sources/Long.md",
            chunkId: "source-long#0",
            text: "B".repeat(600),
            evidenceLabel: "long source"
          }
        ]
      },
      maxContextCharacters: 650
    });

    expect(packet.displayContent).toBe("Summarize the active note");
    expect(packet.agentContent.length).toBeLessThanOrEqual(650);
    expect(packet.agentContent).toContain("Summarize the active note");
    expect(packet.agentContent).toContain("[truncated]");
    expect(packet.contextSummary.truncated).toBe(true);
  });
});

function readyContext(): ActiveNoteContextPacket {
  return {
    status: "ready",
    message: "Active note context is ready.",
    note: {
      path: "Notes/VHDL.md",
      title: "VHDL",
      aliases: ["hardware language"],
      tags: ["#vhdl"],
      headings: ["Timing"],
      links: ["Notes/FPGA.md"]
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
