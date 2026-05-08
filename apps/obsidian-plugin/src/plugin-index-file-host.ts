import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { StoredVaultIndex } from "@vaultseer/core";
import type { VaultseerPluginIndexDataHost } from "./plugin-data-store";

export const VAULTSEER_INDEX_FILE_NAME = "vaultseer-index.json";

export class NodeVaultseerIndexFileHost implements VaultseerPluginIndexDataHost {
  constructor(private readonly indexPath: string) {}

  async loadIndexData(): Promise<unknown> {
    try {
      return JSON.parse(await readFile(this.indexPath, "utf8")) as unknown;
    } catch (error) {
      if (isFileNotFoundError(error)) {
        return null;
      }

      if (error instanceof SyntaxError) {
        await this.quarantineCorruptIndexFile();
        return null;
      }

      throw error;
    }
  }

  async saveIndexData(data: StoredVaultIndex): Promise<void> {
    await mkdir(path.dirname(this.indexPath), { recursive: true });
    const tempPath = `${this.indexPath}.tmp`;
    await writeFile(tempPath, JSON.stringify(data), "utf8");
    await rename(tempPath, this.indexPath);
  }

  async clearIndexData(): Promise<void> {
    await rm(this.indexPath, { force: true });
  }

  private async quarantineCorruptIndexFile(): Promise<void> {
    const quarantinePath = `${this.indexPath}.corrupt-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    try {
      await rename(this.indexPath, quarantinePath);
    } catch (error) {
      if (isFileNotFoundError(error)) return;
      await rm(this.indexPath, { force: true });
    }
  }
}

export function getVaultseerIndexFilePath(vaultBasePath: string, pluginId: string): string {
  return path.join(vaultBasePath, ".obsidian", "plugins", pluginId, VAULTSEER_INDEX_FILE_NAME);
}

function isFileNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}
