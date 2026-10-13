import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SellerProofForm from "@/components/seller-proof-form";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Seller Proof form", () => {
  it("submits a receipt photo without seller contact details and confirms success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({ received: true }, { status: 201 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<SellerProofForm token="abcdefghijklmnopqrstuvwx" />);

    const photo = new File(
      [new Uint8Array([0xff, 0xd8, 0xff])],
      "receipt.jpg",
      { type: "image/jpeg" },
    );
    fireEvent.change(screen.getByLabelText("Receipt or device photo"), {
      target: { files: [photo] },
    });
    const form = screen.getByRole("button", { name: "Send photo to buyer" }).closest("form");
    if (!form) throw new Error("Seller Proof form was not rendered.");
    fireEvent.submit(form);

    expect(
      await screen.findByText("Your photo was sent to the buyer. Thank you."),
    ).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/seller-proof/abcdefghijklmnopqrstuvwx",
      expect.objectContaining({ method: "POST" }),
    );
    const requestBody = fetchMock.mock.calls[0]?.[1]?.body;
    if (!(requestBody instanceof FormData)) {
      throw new Error("Seller Proof form should submit multipart form data.");
    }
    expect([...requestBody.keys()]).toEqual(["proof"]);
    expect(requestBody.get("proof")).not.toBeNull();
    expect(
      screen.getByText(
        "This result is based on information reported by users. It is not proof of ownership, legality or safety.",
      ),
    ).toBeTruthy();
  });
});
