import { createHash } from "node:crypto";
import { SELLER_PROOF_MAX_FILE_SIZE } from "@/lib/seller-proof-constants";

export { SELLER_PROOF_MAX_FILE_SIZE };

const tokenPattern = /^[A-Za-z0-9_-]{24}$/;

export function isSellerProofToken(token: string): boolean {
  return tokenPattern.test(token);
}

export function hashSellerProofToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function hasSupportedImageSignature(
  mime: string,
  data: Buffer,
): mime is "image/jpeg" | "image/png" | "image/webp" {
  if (mime === "image/jpeg") {
    return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  }
  if (mime === "image/png") {
    return data.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  }
  if (mime === "image/webp") {
    return (
      data.length >= 12 &&
      data.toString("ascii", 0, 4) === "RIFF" &&
      data.toString("ascii", 8, 12) === "WEBP"
    );
  }
  return false;
}
