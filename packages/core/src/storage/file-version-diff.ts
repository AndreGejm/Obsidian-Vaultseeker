import type { FileVersionRecord } from "./types";

export type FileVersionDiff = {
  addedPaths: string[];
  modifiedPaths: string[];
  deletedPaths: string[];
  unchangedPaths: string[];
  changedPaths: string[];
  isChanged: boolean;
  summary: string | null;
};

export function compareFileVersions(previous: FileVersionRecord[], current: FileVersionRecord[]): FileVersionDiff {
  const previousByPath = toPathMap(previous);
  const currentByPath = toPathMap(current);
  const allPaths = [...new Set([...previousByPath.keys(), ...currentByPath.keys()])].sort((left, right) =>
    left.localeCompare(right)
  );

  const addedPaths: string[] = [];
  const modifiedPaths: string[] = [];
  const deletedPaths: string[] = [];
  const unchangedPaths: string[] = [];

  for (const path of allPaths) {
    const previousVersion = previousByPath.get(path);
    const currentVersion = currentByPath.get(path);

    if (!previousVersion && currentVersion) {
      addedPaths.push(path);
      continue;
    }

    if (previousVersion && !currentVersion) {
      deletedPaths.push(path);
      continue;
    }

    if (previousVersion && currentVersion && hasContentChanged(previousVersion, currentVersion)) {
      modifiedPaths.push(path);
      continue;
    }

    unchangedPaths.push(path);
  }

  const changedPaths = [...modifiedPaths, ...deletedPaths, ...addedPaths].sort((left, right) => left.localeCompare(right));
  const isChanged = changedPaths.length > 0;

  return {
    addedPaths,
    modifiedPaths,
    deletedPaths,
    unchangedPaths,
    changedPaths,
    isChanged,
    summary: isChanged ? summarizeChanges(addedPaths, modifiedPaths, deletedPaths) : null
  };
}

function toPathMap(records: FileVersionRecord[]): Map<string, FileVersionRecord> {
  return new Map(records.map((record) => [record.path, record]));
}

function hasContentChanged(previous: FileVersionRecord, current: FileVersionRecord): boolean {
  return previous.contentHash !== current.contentHash || previous.size !== current.size;
}

function summarizeChanges(addedPaths: string[], modifiedPaths: string[], deletedPaths: string[]): string {
  return [
    formatCount(addedPaths.length, "added"),
    formatCount(modifiedPaths.length, "modified"),
    formatCount(deletedPaths.length, "deleted")
  ]
    .filter((part) => part.length > 0)
    .join(", ");
}

function formatCount(count: number, label: string): string {
  return count === 0 ? "" : `${count} ${label}`;
}
