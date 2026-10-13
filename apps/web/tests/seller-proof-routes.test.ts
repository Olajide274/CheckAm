// @vitest-environment node

import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { POST as createRequest } from "@/app/api/reports/[reference]/seller-proof/route";
import { GET as downloadProof } from "@/app/api/reports/[reference]/seller-proof/[proofId]/route";
import { POST as submitProof } from "@/app/api/seller-proof/[token]/route";
import {
  createSellerProofRequest,
  getPaymentByReference,
  getSellerProofFile,
  submitSellerProof,
} from "@/lib/database";
import { enforcePaymentRateLimit } from "@/lib/payment-rate-limit";

vi.mock("@/lib/database", () => ({
  createSellerProofRequest: vi.fn(),
  getPaymentByReference: vi.fn(),
  getSellerProofFile: vi.fn(),
  submitSellerProof: vi.fn(),
}));

vi.mock("@/lib/payment-rate-limit", () => ({
  enforcePaymentRateLimit: vi.fn(),
}));

const reference = "2bb39cd6-fb82-4bf0-a00d-b744b4409f44";
const proofId = "2bb39cd6-fb82-4bf0-a00d-b744b4409f45";
const token = "abcdefghijklmnopqrstuvwx";
const originalPaymentsFlag = process.env.FEATURE_PAYMENTS;
const originalSellerProofFlag = process.env.FEATURE_SELLER_PROOF;
const originalVercelEnvironment = process.env.VERCEL_ENV;
const originalAppEnvironment = process.env.APP_ENV;

function payment(status: "success" | "pending" = "success") {
  return {
    reference,
    amount: 50_000,
    status,
    createdAt: new Date(),
    tac: "49015420",
    imeiLast4: "7518",
    imeiFormatValid: true,
    imeiLuhnValid: true,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.FEATURE_PAYMENTS = "true";
  process.env.FEATURE_SELLER_PROOF = "true";
  delete process.env.VERCEL_ENV;
  delete process.env.APP_ENV;
  vi.mocked(enforcePaymentRateLimit).mockResolvedValue(null);
  vi.mocked(getPaymentByReference).mockResolvedValue(payment());
  vi.mocked(createSellerProofRequest).mockResolvedValue(true);
  vi.mocked(submitSellerProof).mockResolvedValue(true);
});

afterEach(() => {
  if (originalPaymentsFlag === undefined) {
    delete process.env.FEATURE_PAYMENTS;
  } else {
    process.env.FEATURE_PAYMENTS = originalPaymentsFlag;
  }
  if (originalSellerProofFlag === undefined) {
    delete process.env.FEATURE_SELLER_PROOF;
  } else {
    process.env.FEATURE_SELLER_PROOF = originalSellerProofFlag;
  }
  if (originalVercelEnvironment === undefined) {
    delete process.env.VERCEL_ENV;
  } else {
    process.env.VERCEL_ENV = originalVercelEnvironment;
  }
  if (originalAppEnvironment === undefined) {
    delete process.env.APP_ENV;
  } else {
    process.env.APP_ENV = originalAppEnvironment;
  }
});

describe("Seller Proof request creation", () => {
  it("creates a unique link only for a confirmed paid report and stores only its hash", async () => {
    const response = await createRequest(
      new Request(`http://localhost/api/reports/${reference}/seller-proof`, {
        method: "POST",
      }),
      { params: Promise.resolve({ reference }) },
    );
    const result = await response.json();

    expect(response.status).toBe(201);
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(createSellerProofRequest).toHaveBeenCalledWith({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/i),
      paymentReference: reference,
      tokenHash: createHash("sha256").update(result.token).digest("hex"),
    });
  });

  it("does not create a request for an unpaid report", async () => {
    vi.mocked(getPaymentByReference).mockResolvedValue(payment("pending"));
    const response = await createRequest(
      new Request(`http://localhost/api/reports/${reference}/seller-proof`, {
        method: "POST",
      }),
      { params: Promise.resolve({ reference }) },
    );

    expect(response.status).toBe(404);
    expect(createSellerProofRequest).not.toHaveBeenCalled();
  });

  it("keeps request creation unavailable when the feature flag is off", async () => {
    process.env.FEATURE_SELLER_PROOF = "false";
    const response = await createRequest(
      new Request(`http://localhost/api/reports/${reference}/seller-proof`, {
        method: "POST",
      }),
      { params: Promise.resolve({ reference }) },
    );

    expect(response.status).toBe(404);
    expect(enforcePaymentRateLimit).not.toHaveBeenCalled();
  });
});

describe("Seller Proof response submission", () => {
  it("rotates, resizes, strips metadata, and stores the photo as JPEG", async () => {
    const imageData = await sharp({
      create: {
        width: 2000,
        height: 1000,
        channels: 3,
        background: "#336699",
      },
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    const image = new File(
      [imageData],
      "receipt.jpg",
      { type: "image/jpeg" },
    );
    const form = new FormData();
    form.set("proof", image);
    form.set("phone", "+234 800 000 0000");
    const response = await submitProof(
      new Request(`http://localhost/api/seller-proof/${token}`, {
        method: "POST",
        body: form,
      }),
      { params: Promise.resolve({ token }) },
    );

    expect(response.status, await response.clone().text()).toBe(201);
    expect(submitSellerProof).toHaveBeenCalledWith({
      tokenHash: createHash("sha256").update(token).digest("hex"),
      proofMime: "image/jpeg",
      proofData: expect.any(Buffer),
    });

    const proofData = vi.mocked(submitSellerProof).mock.calls[0]?.[0].proofData;
    if (!proofData) throw new Error("The processed photo was not saved.");
    const metadata = await sharp(proofData).metadata();
    expect(metadata.format).toBe("jpeg");
    expect(metadata.width).toBe(800);
    expect(metadata.height).toBe(1600);
    expect(metadata.orientation).toBeUndefined();
    expect(metadata.exif).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
    expect(metadata.iptc).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
  });

  it("rejects mismatched image content before saving it", async () => {
    const image = new File(["not a PNG"], "receipt.png", { type: "image/png" });
    const form = new FormData();
    form.set("proof", image);
    const response = await submitProof(
      new Request(`http://localhost/api/seller-proof/${token}`, {
        method: "POST",
        body: form,
      }),
      { params: Promise.resolve({ token }) },
    );

    expect(response.status).toBe(400);
    expect(submitSellerProof).not.toHaveBeenCalled();
  });

  it("rejects image data that has a supported signature but cannot be decoded", async () => {
    const image = new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      "photo.png",
      { type: "image/png" },
    );
    const form = new FormData();
    form.set("proof", image);
    const response = await submitProof(
      new Request(`http://localhost/api/seller-proof/${token}`, {
        method: "POST",
        body: form,
      }),
      { params: Promise.resolve({ token }) },
    );

    expect(response.status).toBe(400);
    expect(submitSellerProof).not.toHaveBeenCalled();
  });

  it("rejects uploads larger than 2 MB", async () => {
    const image = new File(
      [new Uint8Array(2 * 1024 * 1024 + 1)],
      "photo.jpg",
      { type: "image/jpeg" },
    );
    const form = new FormData();
    form.set("proof", image);
    const response = await submitProof(
      new Request(`http://localhost/api/seller-proof/${token}`, {
        method: "POST",
        body: form,
      }),
      { params: Promise.resolve({ token }) },
    );

    expect(response.status).toBe(413);
    expect(submitSellerProof).not.toHaveBeenCalled();
  });

  it("does not return an attachment unless its report has successful payment", async () => {
    vi.mocked(getPaymentByReference).mockResolvedValue(payment("pending"));
    const response = await downloadProof(
      new Request(`http://localhost/api/reports/${reference}/seller-proof/${proofId}`),
      { params: Promise.resolve({ reference, proofId }) },
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
    expect(getSellerProofFile).not.toHaveBeenCalled();
  });

  it("does not return another payment's proof", async () => {
    const otherReference = "3bb39cd6-fb82-4bf0-a00d-b744b4409f44";
    const otherPaymentProof = {
      paymentReference: otherReference,
      mime: "image/jpeg",
      data: Buffer.from("private photo"),
    };
    vi.mocked(getSellerProofFile).mockImplementation(async ({ paymentReference }) =>
      paymentReference === otherPaymentProof.paymentReference
        ? { mime: otherPaymentProof.mime, data: otherPaymentProof.data }
        : null,
    );
    const response = await downloadProof(
      new Request(`http://localhost/api/reports/${reference}/seller-proof/${proofId}`),
      { params: Promise.resolve({ reference, proofId }) },
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
    expect(getSellerProofFile).toHaveBeenCalledWith({
      paymentReference: reference,
      proofId,
    });
  });
});
