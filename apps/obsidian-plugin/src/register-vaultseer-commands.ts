import type { VaultseerStudioCommand } from "./studio-command-catalog";

type VaultseerCommandRegistrar = {
  addCommand(command: {
    id: string;
    name: string;
    callback: () => unknown;
  }): void;
};

export function registerVaultseerCommands(
  registrar: VaultseerCommandRegistrar,
  commands: VaultseerStudioCommand[]
): void {
  for (const command of commands) {
    registrar.addCommand({
      id: command.id,
      name: command.name,
      callback: command.run
    });
  }
}
