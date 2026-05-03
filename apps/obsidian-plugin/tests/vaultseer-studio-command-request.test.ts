import { describe, expect, it } from "vitest";
import { createEmptyChatState } from "../src/codex-chat-state";
import {
  applyVaultseerSlashCommandMessage,
  queueVaultseerStudioCommandRequest
} from "../src/vaultseer-studio-command-request";
import type { VaultseerStudioCommand } from "../src/studio-command-catalog";

const command: VaultseerStudioCommand = {
  id: "rebuild-index",
  name: "Rebuild read-only vault index",
  run: async () => undefined
};
const commands: VaultseerStudioCommand[] = [
  command,
  {
    id: "plan-semantic-index",
    name: "Plan semantic indexing queue",
    run: async () => undefined
  }
];

describe("queueVaultseerStudioCommandRequest", () => {
  it("queues a selected Vaultseer command as an approval-gated chat action", () => {
    const state = queueVaultseerStudioCommandRequest(
      createEmptyChatState("Notes/VHDL.md"),
      command,
      "2026-05-03T12:00:00.000Z"
    );

    expect(state.messages).toEqual([
      {
        role: "assistant",
        content: "Vaultseer queued 'Rebuild read-only vault index'. Review it here, then press Run when you want it executed.",
        createdAt: "2026-05-03T12:00:00.000Z"
      }
    ]);
    expect(state.pendingToolRequests).toEqual([
      {
        displayId: "codex-tool-request-1-1",
        tool: "run_vaultseer_command",
        input: { commandId: "rebuild-index" },
        createdAt: "2026-05-03T12:00:00.000Z",
        reviewStatus: "pending_review",
        requestClass: "command",
        kind: "command"
      }
    ]);
  });

  it("handles a slash command id by adding the user message and queuing the command", () => {
    const result = applyVaultseerSlashCommandMessage(
      createEmptyChatState("Notes/VHDL.md"),
      "/plan-semantic-index",
      commands,
      "2026-05-03T12:00:00.000Z"
    );

    expect(result.handled).toBe(true);
    expect(result.state.messages).toEqual([
      {
        role: "user",
        content: "/plan-semantic-index",
        createdAt: "2026-05-03T12:00:00.000Z"
      },
      {
        role: "assistant",
        content: "Vaultseer queued 'Plan semantic indexing queue'. Review it here, then press Run when you want it executed.",
        createdAt: "2026-05-03T12:00:00.000Z"
      }
    ]);
    expect(result.state.pendingToolRequests).toEqual([
      {
        displayId: "codex-tool-request-2-1",
        tool: "run_vaultseer_command",
        input: { commandId: "plan-semantic-index" },
        createdAt: "2026-05-03T12:00:00.000Z",
        reviewStatus: "pending_review",
        requestClass: "command",
        kind: "command"
      }
    ]);
  });

  it("handles unknown slash commands locally without queuing a tool request", () => {
    const result = applyVaultseerSlashCommandMessage(
      createEmptyChatState("Notes/VHDL.md"),
      "/unknown-command",
      commands,
      "2026-05-03T12:00:00.000Z"
    );

    expect(result.handled).toBe(true);
    expect(result.state.messages).toEqual([
      {
        role: "user",
        content: "/unknown-command",
        createdAt: "2026-05-03T12:00:00.000Z"
      },
      {
        role: "assistant",
        content: "Vaultseer does not know '/unknown-command'. Use the Commands button to pick an available action.",
        createdAt: "2026-05-03T12:00:00.000Z"
      }
    ]);
    expect(result.state.pendingToolRequests).toEqual([]);
  });

  it("ignores normal chat messages", () => {
    const state = createEmptyChatState("Notes/VHDL.md");
    const result = applyVaultseerSlashCommandMessage(
      state,
      "review current note",
      commands,
      "2026-05-03T12:00:00.000Z"
    );

    expect(result).toEqual({
      handled: false,
      state
    });
  });
});
