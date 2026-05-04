import type { VaultAssetRecord } from "./obsidian-adapter";
import type { VaultseerAgentContentPart } from "./vaultseer-agent-runtime";

export const CHAT_IMAGE_ATTACHMENT_EXTENSIONS = [".gif", ".jpeg", ".jpg", ".png", ".webp"] as const;
export const MAX_CHAT_IMAGE_ATTACHMENT_BYTES = 4_000_000;
export const MAX_CHAT_IMAGE_ATTACHMENT_COUNT = 3;

export type ChatImageAttachment = {
  id: string;
  path: string;
  filename: string;
  sizeBytes: number;
  mimeType: string;
  contentPart: VaultseerAgentContentPart;
};

export type ChatImageAttachmentItem = {
  path: string;
  filename: string;
  extension: string;
  mimeType: string;
  sizeBytes: number;
  displayName: string;
  detail: string;
  asset: VaultAssetRecord;
};

export type CreateChatImageAttachmentInput = {
  asset: VaultAssetRecord;
  readVaultBinaryFile: (path: string) => Promise<Uint8Array | ArrayBuffer>;
  detail?: "auto" | "low" | "high";
};

const SUPPORTED_IMAGE_EXTENSIONS = new Set<string>(CHAT_IMAGE_ATTACHMENT_EXTENSIONS);

export function buildChatImageAttachmentItems(assets: VaultAssetRecord[]): ChatImageAttachmentItem[] {
  return assets
    .filter((asset) => isSupportedImageAsset(asset))
    .map((asset) => ({
      path: asset.path,
      filename: asset.filename,
      extension: asset.extension,
      mimeType: asset.mimeType ?? "",
      sizeBytes: asset.sizeBytes,
      displayName: asset.filename,
      detail: `${asset.mimeType ?? asset.extension} · ${formatBytes(asset.sizeBytes)}`,
      asset
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

export async function createChatImageAttachment(
  input: CreateChatImageAttachmentInput
): Promise<ChatImageAttachment> {
  if (!isSupportedImageAsset(input.asset)) {
    throw new Error("Only vault image files can be attached.");
  }

  if (input.asset.sizeBytes > MAX_CHAT_IMAGE_ATTACHMENT_BYTES) {
    throw new Error("Image is larger than 4 MB.");
  }

  const bytes = toUint8Array(await input.readVaultBinaryFile(input.asset.path));
  if (bytes.byteLength > MAX_CHAT_IMAGE_ATTACHMENT_BYTES) {
    throw new Error("Image read exceeded the 4 MB limit.");
  }

  return {
    id: `${input.asset.path}:${input.asset.contentHash}`,
    path: input.asset.path,
    filename: input.asset.filename,
    sizeBytes: input.asset.sizeBytes,
    mimeType: input.asset.mimeType,
    contentPart: {
      type: "image_url",
      imageUrl: `data:${input.asset.mimeType};base64,${bytesToBase64(bytes)}`,
      detail: input.detail ?? "auto"
    }
  };
}

export function canAttachMoreChatImages(currentCount: number): boolean {
  return currentCount < MAX_CHAT_IMAGE_ATTACHMENT_COUNT;
}

function isSupportedImageAsset(asset: VaultAssetRecord): asset is VaultAssetRecord & { mimeType: string } {
  return (
    typeof asset.mimeType === "string" &&
    asset.mimeType.startsWith("image/") &&
    SUPPORTED_IMAGE_EXTENSIONS.has(asset.extension.toLowerCase())
  );
}

function toUint8Array(bytes: Uint8Array | ArrayBuffer): Uint8Array {
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
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
