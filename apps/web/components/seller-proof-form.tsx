"use client";

import { useState, type FormEvent } from "react";
import { SELLER_PROOF_MAX_FILE_SIZE } from "@/lib/seller-proof-constants";

export default function SellerProofForm({ token }: { token: string }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("proof");
    if (
      file === null ||
      typeof file === "string" ||
      file.size > SELLER_PROOF_MAX_FILE_SIZE
    ) {
      setError("Choose a photo no larger than 2 MB.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/seller-proof/${encodeURIComponent(token)}`, {
        method: "POST",
        body: data,
      });
      const result: unknown = await response.json();
      if (
        !response.ok ||
        typeof result !== "object" ||
        result === null ||
        !("received" in result) ||
        result.received !== true
      ) {
        const reason =
          typeof result === "object" &&
          result !== null &&
          "error" in result &&
          typeof result.error === "string"
            ? result.error
            : "We couldn’t submit this photo. Please try again.";
        throw new Error(reason);
      }

      setMessage("Your photo was sent to the buyer. Thank you.");
      form.reset();
    } catch (submitError) {
      console.error("Seller Proof submission failed.", submitError);
      setError(
        submitError instanceof Error
          ? submitError.message
          : "We couldn’t submit this photo. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="report-page">
      <div className="report-card seller-proof-card">
        <p className="report-eyebrow">Seller request</p>
        <h1>Share a photo with the buyer</h1>
        <p>
          Upload a photo of the receipt or device. The buyer will see the photo
          and when you responded in their paid report.
        </p>
        <form className="seller-proof-form" onSubmit={handleSubmit}>
          <label htmlFor="seller-proof-photo">Receipt or device photo</label>
          <input
            accept="image/jpeg,image/png,image/webp"
            id="seller-proof-photo"
            name="proof"
            required
            type="file"
          />
          <p className="field-hint">
            JPEG, PNG, or WebP only. Maximum file size: 2 MB.
          </p>
          <button className="report-button" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Sending photo…" : "Send photo to buyer"}
          </button>
          <p aria-live="polite" className="form-message success" role="status">
            {message}
          </p>
          <p aria-live="polite" className="form-message error" role="alert">
            {error}
          </p>
        </form>
        <p className="seller-proof-disclaimer">
          This result is based on information reported by users. It is not proof
          of ownership, legality or safety.
        </p>
      </div>
    </main>
  );
}
