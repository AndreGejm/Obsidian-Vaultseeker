import type {
  GuardedVaultWriteOperation,
  VaultWriteApplyResult,
  VaultWriteApproval,
  VaultWriteDryRunResult,
  VaultWritePreconditionResult,
  VaultWritePort
} from "@vaultseer/core";
import { evaluateVaultWritePrecondition, hashString } from "@vaultseer/core";

export type ObsidianVaultWriteFile = {
  path: string;
};

export type ObsidianVaultWriteFolder = {
  path: string;
  children: unknown[];
};

export type ObsidianVaultWriteVault = {
  getAbstractFileByPath(path: string): unknown;
  cachedRead(file: ObsidianVaultWriteFile): Promise<string>;
  create(path: string, content: string): Promise<ObsidianVaultWriteFile>;
};

export class VaultWriteVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VaultWriteVerificationError";
  }
}

export class ObsidianVaultWritePort implements VaultWritePort {
  constructor(private readonly vault: ObsidianVaultWriteVault) {}

  async dryRun(operation: GuardedVaultWriteOperation): Promise<VaultWriteDryRunResult> {
    const currentHash = await this.readCurrentHash(operation.targetPath);
    const precondition = await this.evaluateObsidianPrecondition(operation, currentHash);

    return {
      operation,
      precondition,
      preview: operation.preview
    };
  }

  async apply(operation: GuardedVaultWriteOperation, approval: VaultWriteApproval): Promise<VaultWriteApplyResult> {
    this.verifyApproval(operation, approval);

    const dryRun = await this.dryRun(operation);
    if (!dryRun.precondition.ok) {
      throw new VaultWriteVerificationError(`precondition failed: ${dryRun.precondition.reason}`);
    }

    switch (operation.type) {
      case "create_note_from_source":
        return this.createNoteFromSource(operation, approval);
    }
  }

  private async createNoteFromSource(
    operation: GuardedVaultWriteOperation,
    approval: VaultWriteApproval
  ): Promise<VaultWriteApplyResult> {
    const createdFile = await this.vault.create(operation.targetPath, operation.content);
    const writtenContent = await this.vault.cachedRead(createdFile);
    const afterHash = hashString(writtenContent);

    if (afterHash !== approval.afterHash) {
      throw new VaultWriteVerificationError(
        `written content hash mismatch for ${operation.targetPath}: expected ${approval.afterHash}, got ${afterHash}`
      );
    }

    return {
      operationId: operation.id,
      targetPath: operation.targetPath,
      beforeHash: operation.expectedCurrentHash,
      afterHash,
      appliedAt: approval.approvedAt
    };
  }

  private verifyApproval(operation: GuardedVaultWriteOperation, approval: VaultWriteApproval): void {
    if (approval.operationId !== operation.id) {
      throw new VaultWriteVerificationError("approval operation id does not match the write operation");
    }

    if (approval.targetPath !== operation.targetPath) {
      throw new VaultWriteVerificationError("approval target path does not match the write operation");
    }

    if (approval.expectedCurrentHash !== operation.expectedCurrentHash) {
      throw new VaultWriteVerificationError("approval expected hash does not match the write operation");
    }

    if (approval.afterHash !== operation.preview.afterHash) {
      throw new VaultWriteVerificationError("approval after hash does not match the write preview");
    }
  }

  private async evaluateObsidianPrecondition(
    operation: GuardedVaultWriteOperation,
    currentHash: string | null
  ): Promise<VaultWritePreconditionResult> {
    const basePrecondition = evaluateVaultWritePrecondition(operation, {
      path: operation.targetPath,
      currentHash
    });
    if (!basePrecondition.ok) return basePrecondition;

    const parentFolderPath = getParentFolderPath(operation.targetPath);
    if (parentFolderPath && !this.folderExists(parentFolderPath)) {
      return {
        ok: false,
        reason: "missing_parent_folder",
        expectedCurrentHash: operation.expectedCurrentHash,
        actualCurrentHash: null
      };
    }

    return basePrecondition;
  }

  private async readCurrentHash(path: string): Promise<string | null> {
    const file = this.vault.getAbstractFileByPath(path);
    if (!isVaultWriteFile(file)) return null;

    const content = await this.vault.cachedRead(file);
    return hashString(content);
  }

  private folderExists(path: string): boolean {
    return isVaultWriteFolder(this.vault.getAbstractFileByPath(path));
  }
}

function isVaultWriteFile(value: unknown): value is ObsidianVaultWriteFile {
  return isVaultWritePathObject(value) && !("children" in value);
}

function isVaultWriteFolder(value: unknown): value is ObsidianVaultWriteFolder {
  return isVaultWritePathObject(value) && "children" in value && Array.isArray(value.children);
}

function isVaultWritePathObject(value: unknown): value is { path: string } {
  return typeof value === "object" && value !== null && "path" in value && typeof value.path === "string";
}

function getParentFolderPath(path: string): string | null {
  const normalizedPath = path.replace(/\\/g, "/");
  const lastSlash = normalizedPath.lastIndexOf("/");
  if (lastSlash <= 0) return null;
  return normalizedPath.slice(0, lastSlash);
}
