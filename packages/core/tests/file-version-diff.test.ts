import { describe, expect, it } from "vitest";
import { compareFileVersions } from "../src/index";
import type { FileVersionRecord } from "../src/index";

const previous: FileVersionRecord[] = [
  { path: "A.md", mtime: 10, size: 100, contentHash: "hash-a-old" },
  { path: "B.md", mtime: 20, size: 200, contentHash: "hash-b" },
  { path: "D.md", mtime: 30, size: 300, contentHash: "hash-d" }
];

describe("compareFileVersions", () => {
  it("reports added, modified, deleted, and unchanged paths in deterministic order", () => {
    const current: FileVersionRecord[] = [
      { path: "A.md", mtime: 11, size: 101, contentHash: "hash-a-new" },
      { path: "C.md", mtime: 40, size: 400, contentHash: "hash-c" },
      { path: "D.md", mtime: 31, size: 300, contentHash: "hash-d" }
    ];

    expect(compareFileVersions(previous, current)).toEqual({
      addedPaths: ["C.md"],
      modifiedPaths: ["A.md"],
      deletedPaths: ["B.md"],
      unchangedPaths: ["D.md"],
      changedPaths: ["A.md", "B.md", "C.md"],
      isChanged: true,
      summary: "1 added, 1 modified, 1 deleted"
    });
  });

  it("ignores mtime-only changes when content hash and size are unchanged", () => {
    const current: FileVersionRecord[] = [
      { path: "A.md", mtime: 999, size: 100, contentHash: "hash-a-old" },
      { path: "B.md", mtime: 888, size: 200, contentHash: "hash-b" },
      { path: "D.md", mtime: 777, size: 300, contentHash: "hash-d" }
    ];

    expect(compareFileVersions(previous, current)).toEqual({
      addedPaths: [],
      modifiedPaths: [],
      deletedPaths: [],
      unchangedPaths: ["A.md", "B.md", "D.md"],
      changedPaths: [],
      isChanged: false,
      summary: null
    });
  });
});
