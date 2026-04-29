export function partitionIntoBlocks(lines: string[]): string[] {
  const blocks: string[] = [];
  let currentLines: string[] = [];
  let inCodeFence = false;

  const flush = (): void => {
    const value = currentLines.join("\n").trim();
    if (value) {
      blocks.push(value);
    }
    currentLines = [];
  };

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inCodeFence = !inCodeFence;
      currentLines.push(line);
      continue;
    }

    if (!inCodeFence && line.trim() === "") {
      flush();
      continue;
    }

    currentLines.push(line);
  }

  flush();
  return blocks;
}

export function createStableChunkId(prefix: string, ordinalKey: string, ordinal: number): string {
  return `${prefix}:${hashString(ordinal === 0 ? ordinalKey : `${ordinalKey}\n${ordinal}`)}`;
}

export function normalizeTextForHash(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

export function hashString(value: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}
