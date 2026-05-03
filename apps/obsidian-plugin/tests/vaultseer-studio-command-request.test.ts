import { describe, expect, it } from "vitest";
import { createEmptyChatState } from "../src/codex-chat-state";
import { queueVaultseerStudioCommandRequest } from "../src/vaultseer-studio-command-request";
import type { VaultseerStudioCommand } from "../src/studio-command-catalog";

const command: VaultseerStudioCommand = {
  id: "rebuild-index",
  name: "Rebuild read-only vault index",
  run: async () => undefined
};

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
});
