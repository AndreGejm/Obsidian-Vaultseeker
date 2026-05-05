import { describe, expect, it, vi } from "vitest";
import { registerVaultseerCommands } from "../src/register-vaultseer-commands";
import type { VaultseerStudioCommand } from "../src/studio-command-catalog";

describe("registerVaultseerCommands", () => {
  it("registers Obsidian commands from the shared Studio command list", async () => {
    const run = vi.fn(async () => undefined);
    const registered: Array<{ id: string; name: string; callback: () => unknown }> = [];
    const commands: VaultseerStudioCommand[] = [
      {
        id: "rebuild-index",
        name: "Rebuild read-only vault index",
        group: "notes",
        run
      }
    ];

    registerVaultseerCommands(
      {
        addCommand: (command) => {
          registered.push(command);
        }
      },
      commands
    );

    expect(registered).toEqual([
      {
        id: "rebuild-index",
        name: "Rebuild read-only vault index",
        callback: run
      }
    ]);

    await registered[0]!.callback();
    expect(run).toHaveBeenCalledTimes(1);
  });
});
