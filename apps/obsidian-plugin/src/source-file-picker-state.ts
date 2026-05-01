import { isBuiltInTextSourceExtension } from "@vaultseer/core";

export type SourceFilePickerInputFile = {
  path: string;
  name: string;
  extension: string;
  stat: {
    size: number;
  };
};

export type SourceFilePickerItem = {
  sourcePath: string;
  filename: string;
  extension: string;
  sizeBytes: number;
  displayName: string;
  detail: string;
};

export type BuildSourceFilePickerItemsInput = {
  files: SourceFilePickerInputFile[];
  excludedFolders?: string[];
};

export function buildSourceFilePickerItems(input: BuildSourceFilePickerItemsInput): SourceFilePickerItem[] {
  const excludedFolders = (input.excludedFolders ?? []).map(normalizeVaultPath).filter(Boolean);

  return input.files
    .filter((file) => !isExcludedPath(file.path, excludedFolders))
    .map((file) => {
      const extension = normalizeExtension(file.extension || getFileExtension(file.name));
      return {
        sourcePath: file.path,
        filename: file.name,
        extension,
        sizeBytes: file.stat.size,
        displayName: file.name,
        detail: `${extension || "no extension"} · ${formatBytes(file.stat.size)}`
      };
    })
    .filter((item) => isBuiltInTextSourceExtension(item.extension))
    .sort((left, right) => left.sourcePath.localeCompare(right.sourcePath));
}

function isExcludedPath(path: string, excludedFolders: string[]): boolean {
  const normalizedPath = normalizeVaultPath(path);
  return excludedFolders.some((folder) => normalizedPath === folder || normalizedPath.startsWith(`${folder}/`));
}

function normalizeVaultPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function normalizeExtension(extension: string): string {
  const trimmed = extension.trim().toLowerCase();
  if (!trimmed) return "";
  return trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
}

function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === filename.length - 1) return "";
  return filename.slice(lastDot);
}

function formatBytes(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return "0 B";
  if (sizeBytes < 1_000) return `${Math.round(sizeBytes)} B`;
  if (sizeBytes < 1_000_000) return `${trimDecimal(sizeBytes / 1_000)} KB`;
  return `${trimDecimal(sizeBytes / 1_000_000)} MB`;
}

function trimDecimal(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}
