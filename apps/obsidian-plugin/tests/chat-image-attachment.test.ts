import { describe, expect, it, vi } from "vitest";
import {
  buildChatImageAttachmentItems,
  createChatImageAttachment,
  MAX_CHAT_IMAGE_ATTACHMENT_BYTES
} from "../src/chat-image-attachment";
import type { VaultAssetRecord } from "../src/obsidian-adapter";

describe("chat image attachments", () => {
  it("lists only supported image vault assets in path order", () => {
    const items = buildChatImageAttachmentItems([
      asset("Sources/spec.pdf", "spec.pdf", ".pdf", "application/pdf", 1_000),
      asset("Images/scope.PNG", "scope.PNG", ".png", "image/png", 2_000),
      asset("Images/plot.webp", "plot.webp", ".webp", "image/webp", 3_000),
      asset("Images/unknown.bmp", "unknown.bmp", ".bmp", null, 4_000)
    ]);

    expect(items.map((item) => item.path)).toEqual(["Images/plot.webp", "Images/scope.PNG"]);
    expect(items[0]).toEqual(
      expect.objectContaining({
        filename: "plot.webp",
        detail: "image/webp · 3 KB"
      })
    );
  });

  it("creates an OpenAI-compatible image content part without reading oversized assets", async () => {
    const readVaultBinaryFile = vi.fn(async () => new Uint8Array([1, 2, 3]));

    const attachment = await createChatImageAttachment({
      asset: asset("Images/scope.png", "scope.png", ".png", "image/png", 3),
      readVaultBinaryFile
    });

    expect(attachment).toEqual({
      id: "Images/scope.png:vault-file:3:123",
      path: "Images/scope.png",
      filename: "scope.png",
      sizeBytes: 3,
      mimeType: "image/png",
      contentPart: {
        type: "image_url",
        imageUrl: "data:image/png;base64,AQID",
        detail: "auto"
      }
    });
    expect(readVaultBinaryFile).toHaveBeenCalledWith("Images/scope.png");

    await expect(
      createChatImageAttachment({
        asset: asset(
          "Images/large.png",
          "large.png",
          ".png",
          "image/png",
          MAX_CHAT_IMAGE_ATTACHMENT_BYTES + 1
        ),
        readVaultBinaryFile
      })
    ).rejects.toThrow("Image is larger than 4 MB");
    expect(readVaultBinaryFile).toHaveBeenCalledTimes(1);
  });

  it("rejects non-image assets and image reads that exceed the byte cap", async () => {
    await expect(
      createChatImageAttachment({
        asset: asset("Sources/spec.pdf", "spec.pdf", ".pdf", "application/pdf", 10),
        readVaultBinaryFile: async () => new Uint8Array([1])
      })
    ).rejects.toThrow("Only vault image files can be attached");

    await expect(
      createChatImageAttachment({
        asset: asset("Images/lied-about-size.png", "lied-about-size.png", ".png", "image/png", 1),
        readVaultBinaryFile: async () => new Uint8Array(MAX_CHAT_IMAGE_ATTACHMENT_BYTES + 1)
      })
    ).rejects.toThrow("Image read exceeded the 4 MB limit");
  });
});

function asset(
  path: string,
  filename: string,
  extension: string,
  mimeType: string | null,
  sizeBytes: number
): VaultAssetRecord {
  return {
    path,
    filename,
    basename: filename.replace(/\.[^.]+$/, ""),
    extension,
    mimeType,
    sizeBytes,
    modifiedTime: 123,
    contentHash: `vault-file:${sizeBytes}:123`
  };
}
