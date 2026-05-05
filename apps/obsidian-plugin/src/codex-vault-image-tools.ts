import type { VaultAssetRecord } from "./obsidian-adapter";
import type { CreateCodexReadOnlyToolImplementationsInput } from "./codex-read-only-tool-implementations";
import { isRecord, normalizeLimit } from "./codex-tool-input-parsers";
import type { VaultseerAgentContentPart } from "./vaultseer-agent-runtime";
import { validateVaultRelativePath } from "./vault-path-policy";

const MAX_AGENT_IMAGE_BYTES = 4 * 1024 * 1024;
const IMAGE_MIME_TYPE_BY_EXTENSION = new Map<string, string>([
  [".gif", "image/gif"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"]
]);

type ParsedCodexListVaultImagesInput = {
  query: string | null;
  limit: number;
};

export async function readVaultImageForAgent(
  input: CreateCodexReadOnlyToolImplementationsInput,
  toolInput: unknown
): Promise<unknown> {
  const request = parseReadVaultImageInput(toolInput);
  const directAsset = await findVaultImageAsset(input, request.path);
  if (directAsset !== null) {
    const assetReadRequest: {
      path: string;
      mimeType: string;
      sizeBytes: number;
      detail?: "auto" | "low" | "high";
    } = {
      path: request.path,
      mimeType: directAsset.mimeType ?? request.mimeType,
      sizeBytes: directAsset.sizeBytes
    };
    if (request.detail !== undefined) {
      assetReadRequest.detail = request.detail;
    }
    return readVaultImageAssetForAgent(input, assetReadRequest);
  }

  const sources = await input.store.getSourceRecords();
  const attachment = sources
    .flatMap((source) => source.attachments.map((candidate) => ({ source, attachment: candidate })))
    .find(
      ({ source, attachment }) =>
        source.status === "extracted" && attachment.kind === "image" && attachment.stagedPath === request.path
    );

  if (!attachment) {
    return {
      status: "not_indexed",
      path: request.path,
      message: "Index this vault image before Vaultseer can attach it to the agent turn."
    };
  }

  if (attachment.source.sizeBytes > MAX_AGENT_IMAGE_BYTES) {
    return {
      status: "too_large",
      path: request.path,
      sizeBytes: attachment.source.sizeBytes,
      maxBytes: MAX_AGENT_IMAGE_BYTES
    };
  }

  if (!input.readVaultBinaryFile) {
    return {
      status: "unavailable",
      path: request.path,
      message: "Vault image reading is not available in this Vaultseer session."
    };
  }

  const bytes = toUint8Array(await input.readVaultBinaryFile(request.path));
  if (bytes.byteLength > MAX_AGENT_IMAGE_BYTES) {
    return {
      status: "too_large",
      path: request.path,
      sizeBytes: bytes.byteLength,
      maxBytes: MAX_AGENT_IMAGE_BYTES
    };
  }

  const contentPart: VaultseerAgentContentPart = {
    type: "image_url",
    imageUrl: `data:${attachment.attachment.mimeType ?? request.mimeType};base64,${bytesToBase64(bytes)}`
  };
  if (request.detail) {
    contentPart.detail = request.detail;
  }

  return {
    status: "ready",
    path: request.path,
    mimeType: attachment.attachment.mimeType ?? request.mimeType,
    sizeBytes: bytes.byteLength,
    contentPart
  };
}

export async function listVaultImagesForAgent(
  input: CreateCodexReadOnlyToolImplementationsInput,
  toolInput: unknown
): Promise<unknown> {
  if (!input.readVaultAssetRecords) {
    return {
      status: "unavailable",
      message: "Vault image listing is not available in this Vaultseer session.",
      images: []
    };
  }

  const request = parseListVaultImagesInput(toolInput);
  const query = request.query?.toLowerCase() ?? null;
  const assets = (await input.readVaultAssetRecords())
    .filter(isAgentImageAsset)
    .filter(
      (asset) => query === null || asset.path.toLowerCase().includes(query) || asset.filename.toLowerCase().includes(query)
    )
    .sort((left, right) => left.path.localeCompare(right.path))
    .slice(0, request.limit)
    .map((asset) => ({
      path: asset.path,
      filename: asset.filename,
      mimeType: asset.mimeType ?? IMAGE_MIME_TYPE_BY_EXTENSION.get(getExtension(asset.path)) ?? "application/octet-stream",
      sizeBytes: asset.sizeBytes,
      modifiedTime: asset.modifiedTime,
      contentHash: asset.contentHash
    }));

  return {
    status: "ready",
    message: `${assets.length} vault image${assets.length === 1 ? "" : "s"} found.`,
    images: assets
  };
}

async function findVaultImageAsset(
  input: CreateCodexReadOnlyToolImplementationsInput,
  path: string
): Promise<VaultAssetRecord | null> {
  if (!input.readVaultAssetRecords) {
    return null;
  }

  const assets = await input.readVaultAssetRecords();
  return assets.find((asset) => asset.path === path && isAgentImageAsset(asset)) ?? null;
}

async function readVaultImageAssetForAgent(
  input: CreateCodexReadOnlyToolImplementationsInput,
  request: {
    path: string;
    mimeType: string;
    sizeBytes: number;
    detail?: "auto" | "low" | "high";
  }
): Promise<unknown> {
  if (request.sizeBytes > MAX_AGENT_IMAGE_BYTES) {
    return {
      status: "too_large",
      path: request.path,
      sizeBytes: request.sizeBytes,
      maxBytes: MAX_AGENT_IMAGE_BYTES
    };
  }

  if (!input.readVaultBinaryFile) {
    return {
      status: "unavailable",
      path: request.path,
      message: "Vault image reading is not available in this Vaultseer session."
    };
  }

  const bytes = toUint8Array(await input.readVaultBinaryFile(request.path));
  if (bytes.byteLength > MAX_AGENT_IMAGE_BYTES) {
    return {
      status: "too_large",
      path: request.path,
      sizeBytes: bytes.byteLength,
      maxBytes: MAX_AGENT_IMAGE_BYTES
    };
  }

  const contentPart: VaultseerAgentContentPart = {
    type: "image_url",
    imageUrl: `data:${request.mimeType};base64,${bytesToBase64(bytes)}`
  };
  if (request.detail) {
    contentPart.detail = request.detail;
  }

  return {
    status: "ready",
    path: request.path,
    mimeType: request.mimeType,
    sizeBytes: bytes.byteLength,
    contentPart
  };
}

function parseReadVaultImageInput(input: unknown): {
  path: string;
  mimeType: string;
  detail?: "auto" | "low" | "high";
} {
  if (!isRecord(input)) {
    throw new Error("read_vault_image input must include a vault-relative image path.");
  }

  const rawPath = input["path"];
  if (typeof rawPath !== "string") {
    throw new Error("read_vault_image input must include a vault-relative image path.");
  }

  const path = validateVaultRelativePath(rawPath);
  const mimeType = IMAGE_MIME_TYPE_BY_EXTENSION.get(getExtension(path));
  if (!mimeType) {
    throw new Error("read_vault_image only accepts indexed PNG, JPEG, WEBP, or non-animated GIF images.");
  }

  const detail = normalizeImageDetail(input["detail"]);
  return detail ? { path, mimeType, detail } : { path, mimeType };
}

function normalizeImageDetail(value: unknown): "auto" | "low" | "high" | null {
  return value === "auto" || value === "low" || value === "high" ? value : null;
}

function parseListVaultImagesInput(input: unknown): ParsedCodexListVaultImagesInput {
  const rawQuery = typeof input === "string" ? input : isRecord(input) ? input["query"] : undefined;
  return {
    query: typeof rawQuery === "string" && rawQuery.trim().length > 0 ? rawQuery.trim() : null,
    limit: normalizeLimit(isRecord(input) ? input["limit"] : undefined)
  };
}

function isAgentImageAsset(asset: VaultAssetRecord): boolean {
  const extension = getExtension(asset.path);
  const mimeType = asset.mimeType ?? IMAGE_MIME_TYPE_BY_EXTENSION.get(extension) ?? "";
  return mimeType.startsWith("image/") && IMAGE_MIME_TYPE_BY_EXTENSION.has(extension);
}

function getExtension(path: string): string {
  const filename = path.split("/").pop() ?? path;
  const index = filename.lastIndexOf(".");
  return index <= 0 ? "" : filename.slice(index).toLowerCase();
}

function toUint8Array(value: Uint8Array | ArrayBuffer): Uint8Array {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}
