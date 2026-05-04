export type VaultPathPolicyOptions = {
  requireMarkdown?: boolean;
};

const PRIVATE_ROOT_SEGMENTS = new Set([".obsidian", ".git", "node_modules"]);

export class VaultPathPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VaultPathPolicyError";
  }
}

export function validateVaultRelativePath(path: string, options: VaultPathPolicyOptions = {}): string {
  if (typeof path !== "string" || path.trim().length === 0) {
    throw new VaultPathPolicyError("Vaultseer paths must be nonblank vault-relative paths.");
  }

  const normalized = path.trim();
  if (normalized.includes("\\")) {
    throw new VaultPathPolicyError("Vaultseer paths must use Obsidian vault-relative forward-slash paths.");
  }

  if (isAbsoluteOrNetworkPath(normalized)) {
    throw new VaultPathPolicyError("Vaultseer paths must be vault-relative; absolute paths are not allowed.");
  }

  const segments = normalized.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    throw new VaultPathPolicyError("Vaultseer paths must be vault-relative and must not contain traversal segments.");
  }

  const rootSegment = segments[0]?.toLowerCase();
  if (rootSegment && PRIVATE_ROOT_SEGMENTS.has(rootSegment)) {
    throw new VaultPathPolicyError(`Vaultseer cannot target private vault folder '${segments[0]}'.`);
  }

  if (options.requireMarkdown === true && !isMarkdownPath(normalized)) {
    throw new VaultPathPolicyError("Vaultseer note write paths must target Markdown notes.");
  }

  return normalized;
}

function isAbsoluteOrNetworkPath(path: string): boolean {
  return /^[A-Za-z]:\//.test(path) || path.startsWith("/") || path.startsWith("//");
}

function isMarkdownPath(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".markdown");
}
