import { describe, expect, it } from "vitest";
import { buildVaultseerChatActionPlan } from "../src/vaultseer-chat-action-plan";

describe("buildVaultseerChatActionPlan", () => {
  it("plans current-note inspection for note review requests", () => {
    expect(
      buildVaultseerChatActionPlan({
        message: "review current note and suggest tags",
        activePath: "Notes/VHDL.md"
      })
    ).toEqual({
      content: "Vaultseer prepared current-note inspection before answering.",
      toolRequests: [{ tool: "inspect_current_note", input: null }]
    });
  });

  it("plans note search for related-note requests", () => {
    expect(
      buildVaultseerChatActionPlan({
        message: "find related notes about VHDL timing",
        activePath: "Notes/VHDL.md"
      })
    ).toEqual({
      content: "Vaultseer prepared a note search for related context.",
      toolRequests: [{ tool: "search_notes", input: { query: "find related notes about VHDL timing", limit: 8 } }]
    });
  });

  it("plans source search for literature and datasheet requests", () => {
    expect(
      buildVaultseerChatActionPlan({
        message: "search sources for this FPGA datasheet timing claim",
        activePath: "Notes/FPGA.md"
      })
    ).toEqual({
      content: "Vaultseer prepared a source workspace search.",
      toolRequests: [
        { tool: "search_sources", input: { query: "search sources for this FPGA datasheet timing claim", limit: 8 } }
      ]
    });
  });

  it("plans semantic indexing for vectorization requests", () => {
    expect(
      buildVaultseerChatActionPlan({
        message: "chunk and vectorize my notes",
        activePath: "Notes/VHDL.md"
      })
    ).toEqual({
      content: "Vaultseer prepared the semantic indexing command.",
      toolRequests: [{ tool: "run_vaultseer_command", input: { commandId: "plan-semantic-index" } }]
    });
  });

  it("plans source extraction for PDF extraction requests", () => {
    expect(
      buildVaultseerChatActionPlan({
        message: "extract a PDF into a source workspace",
        activePath: "Notes/VHDL.md"
      })
    ).toEqual({
      content: "Vaultseer prepared the source extraction queue command.",
      toolRequests: [{ tool: "run_vaultseer_command", input: { commandId: "plan-source-extraction-queue" } }]
    });
  });

  it("does not invent actions for ordinary chat", () => {
    expect(
      buildVaultseerChatActionPlan({
        message: "hello",
        activePath: "Notes/VHDL.md"
      })
    ).toEqual({
      content: null,
      toolRequests: []
    });
  });
});
