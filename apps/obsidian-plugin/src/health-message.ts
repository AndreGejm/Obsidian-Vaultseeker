import type { IndexHealth } from "@vaultseer/core";

export function formatIndexHealthNotice(health: IndexHealth): string {
  switch (health.status) {
    case "empty":
      return "Vaultseer index is empty. Rebuild the index to create a vault mirror.";
    case "indexing":
      return "Vaultseer index rebuild is in progress.";
    case "ready":
      return `Vaultseer index ready: ${health.noteCount} notes indexed${formatIndexedAt(health)}.`;
    case "stale":
      return `Vaultseer index stale: ${health.noteCount} notes in the last mirror.${formatMessage(health)}`;
    case "degraded":
      return `Vaultseer index degraded: ${health.noteCount} notes available.${formatMessage(health)}`;
    case "error":
      return `Vaultseer index error:${formatMessage(health)} Clear and rebuild the index to recover.`;
  }
}

function formatIndexedAt(health: IndexHealth): string {
  return health.lastIndexedAt ? ` at ${health.lastIndexedAt}` : "";
}

function formatMessage(health: IndexHealth): string {
  return health.statusMessage ? ` ${health.statusMessage}` : "";
}
