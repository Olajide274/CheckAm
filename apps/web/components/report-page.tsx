"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { PaymentRecord, SellerProofStatus } from "@/lib/database";
import { isBillOfSaleEnabled, isSellerProofEnabled } from "@/lib/features";
import { compareSellerDescription } from "@/lib/model-description";
import type { ModelLookupResult } from "@/lib/model-lookup";

interface ClientSellerProofStatus {
  requested: boolean;
  respondedAt: string | null;
  proofUrl: string | null;
  sellerPhone: string | null;
}

export default function ReportPageContent({
  model,
  payment,
  sellerProof,
}: {
  model: ModelLookupResult;
  payment: PaymentRecord;
  sellerProof: SellerProofStatus;
}) {
  const [sellerDescription, setSellerDescription] = useState("");
  const [sellerProofStatus, setSellerProofStatus] =
    useState<ClientSellerProofStatus>(() => ({
      requested: sellerProof.requested,
      respondedAt: sellerProof.respondedAt?.toISOString() ?? null,
      proofUrl: sellerProof.proofId
        ? `/api/reports/${encodeURIComponent(payment.reference)}/seller-proof/${encodeURIComponent(sellerProof.proofId)}`
        : null,
      sellerPhone: sellerProof.sellerPhone,
    }));
  const [sellerProofLink, setSellerProofLink] = useState("");
  const [sellerProofMessage, setSellerProofMessage] = useState("");
  const [sellerProofError, setSellerProofError] = useState("");
  const [isCreatingSellerProofLink, setIsCreatingSellerProofLink] =
    useState(false);
  const sellerProofEnabled = isSellerProofEnabled();
  const formatResult =
    payment.imeiFormatValid === true ? "valid" : "invalid";
  const luhnResult = payment.imeiLuhnValid === true ? "pass" : "fail";
  const sellerMatch = compareSellerDescription(sellerDescription, model);

  useEffect(() => {
    if (
      !sellerProofEnabled ||
      !sellerProofStatus.requested ||
      sellerProofStatus.respondedAt
    ) {
      return;
    }

    let cancelled = false;
    let timeout: number | undefined;

    async function refreshSellerProofStatus() {
      try {
        const response = await fetch(
          `/api/reports/${encodeURIComponent(payment.reference)}/seller-proof/status`,
          { cache: "no-store" },
        );
        const result: unknown = await response.json();
        if (
          !response.ok ||
          typeof result !== "object" ||
          result === null ||
          !("requested" in result) ||
          typeof result.requested !== "boolean" ||
          !("respondedAt" in result) ||
          !(typeof result.respondedAt === "string" || result.respondedAt === null) ||
          !("proofUrl" in result) ||
          !(typeof result.proofUrl === "string" || result.proofUrl === null) ||
          !("sellerPhone" in result) ||
          !(typeof result.sellerPhone === "string" || result.sellerPhone === null)
        ) {
          throw new Error("Unable to refresh Seller Proof status.");
        }
        if (cancelled) return;

        setSellerProofStatus({
          requested: result.requested,
          respondedAt: result.respondedAt,
          proofUrl: result.proofUrl,
          sellerPhone: result.sellerPhone,
        });
        setSellerProofError("");
        if (!result.respondedAt) {
          timeout = window.setTimeout(refreshSellerProofStatus, 15_000);
        }
      } catch (error) {
        console.error("Seller Proof status request failed.", error);
        if (!cancelled) {
          setSellerProofError("We couldn’t refresh Seller Proof status.");
          timeout = window.setTimeout(refreshSellerProofStatus, 30_000);
        }
      }
    }

    void refreshSellerProofStatus();
    return () => {
      cancelled = true;
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, [
    payment.reference,
    sellerProofEnabled,
    sellerProofStatus.requested,
    sellerProofStatus.respondedAt,
  ]);

  async function createSellerProofLink() {
    setIsCreatingSellerProofLink(true);
    setSellerProofError("");
    setSellerProofMessage("");
    try {
      const response = await fetch(
        `/api/reports/${encodeURIComponent(payment.reference)}/seller-proof`,
        { method: "POST" },
      );
      const result: unknown = await response.json();
      if (
        !response.ok ||
        typeof result !== "object" ||
        result === null ||
        !("token" in result) ||
        typeof result.token !== "string" ||
        !/^[A-Za-z0-9_-]{24}$/.test(result.token)
      ) {
        throw new Error("We couldn’t create the request link. Please try again.");
      }

      const link = new URL(
        `/seller-proof/${encodeURIComponent(result.token)}`,
        window.location.origin,
      ).toString();
      setSellerProofLink(link);
      setSellerProofStatus((current) => ({ ...current, requested: true }));
      setSellerProofMessage("Request link created. Send it to the seller.");
    } catch (error) {
      console.error("Seller Proof link creation failed.", error);
      setSellerProofError(
        error instanceof Error
          ? error.message
          : "We couldn’t create the request link. Please try again.",
      );
    } finally {
      setIsCreatingSellerProofLink(false);
    }
  }

  async function copySellerProofLink() {
    try {
      await navigator.clipboard.writeText(sellerProofLink);
      setSellerProofMessage("Request link copied.");
      setSellerProofError("");
    } catch (error) {
      console.error("Seller Proof link copy failed.", error);
      setSellerProofError("We couldn’t copy the link. Select and copy it instead.");
    }
  }

  return (
    <main className="report-page">
      <div className="report-card">
        <header className="report-header">
          <div>
            <p className="report-eyebrow">Device report</p>
            <h1>Before you pay</h1>
          </div>
          <button className="report-print-button" onClick={() => window.print()} type="button">
            Print or save as PDF
          </button>
        </header>

        <section className="report-section">
          <h2>Device</h2>
          <p>
            IMEI ending in <strong>{payment.imeiLast4 ?? "••••"}</strong>.
            Format check: <strong>{formatResult}</strong>. Luhn check: <strong>{luhnResult}</strong>.
          </p>
        </section>

        <section className="report-section">
          <h2>CheckAm registry status</h2>
          <p className="report-status">No record found</p>
          <p>
            This result is based on information reported by users. It is not proof
            of ownership, legality or safety.
          </p>
        </section>

        <section className="report-section">
          <h2>Model match</h2>
          {model.status === "found" ? (
            <p>
              <strong>{model.brand}</strong> {model.model}
            </p>
          ) : (
            <p>Model not found in our database</p>
          )}
          <p>
            Model codes can be wrong or out of date. This does not confirm the
            device&apos;s origin.
          </p>
          <label className="report-model-label">
            What does the seller say this phone is?
            <input
              className="report-model-input"
              maxLength={120}
              onChange={(event) => setSellerDescription(event.target.value)}
              type="text"
              value={sellerDescription}
            />
          </label>
          {sellerDescription.trim() && (
            <p aria-live="polite" className="report-model-match">
              {sellerMatch}
            </p>
          )}
        </section>

        <section className="report-section">
          <h2>Buyer&apos;s inspection checklist</h2>
          <ul className="checklist">
            <li>
              <label>
                <input checked readOnly type="checkbox" />
                Confirm *#06# matches the box and the seller&apos;s claim.
              </label>
            </li>
            <li>
              <label>
                <input checked readOnly type="checkbox" />
                Check the lock status.
              </label>
            </li>
            <li>
              <label>
                <input checked readOnly type="checkbox" />
                Check the battery health.
              </label>
            </li>
            <li>
              <label>
                <input checked readOnly type="checkbox" />
                Check the screen.
              </label>
            </li>
            <li>
              <label>
                <input checked readOnly type="checkbox" />
                Check the SIM tray.
              </label>
            </li>
            <li>
              <label>
                <input checked readOnly type="checkbox" />
                Ask for the receipt.
              </label>
            </li>
          </ul>
        </section>

        <section className="report-section">
          <h2>Questions to ask the seller</h2>
          <ul>
            <li>Has the device ever been repaired or replaced?</li>
            <li>Can you share the purchase receipt and the box?</li>
            <li>Does the IMEI or serial number match the box and the phone?</li>
          </ul>
        </section>

        <section className="report-section">
          <h2>What proof to request</h2>
          <ul>
            <li>Original receipt or seller proof of purchase.</li>
            <li>Photos of the box and the device serial or IMEI label.</li>
            <li>Any recent repair or warranty notes.</li>
          </ul>
        </section>

        {isBillOfSaleEnabled() && (
          <section className="report-section">
            <h2>Record the sale</h2>
            <Link className="report-action-link" href="/bill-of-sale">
              Generate a Bill of Sale
            </Link>
          </section>
        )}
        {sellerProofEnabled && (
          <section className="report-section seller-proof-report">
            <h2>Request Seller Proof</h2>
            <p>
              Send a one-time link for the seller to share a receipt or device
              photo. The report updates when the seller responds.
            </p>
            <button
              className="report-action-button"
              disabled={isCreatingSellerProofLink}
              onClick={() => void createSellerProofLink()}
              type="button"
            >
              {isCreatingSellerProofLink
                ? "Creating link…"
                : sellerProofStatus.requested
                  ? "Create another request link"
                  : "Create Seller Proof request link"}
            </button>
            {sellerProofLink && (
              <div className="seller-proof-link">
                <label htmlFor="seller-proof-link">Request link</label>
                <input
                  id="seller-proof-link"
                  readOnly
                  value={sellerProofLink}
                />
                <button
                  className="report-action-button"
                  onClick={() => void copySellerProofLink()}
                  type="button"
                >
                  Copy link
                </button>
                <a
                  className="report-action-link"
                  href={`https://wa.me/?text=${encodeURIComponent(`Please share a receipt or device photo for my CheckAm report: ${sellerProofLink}`)}`}
                  rel="noreferrer"
                  target="_blank"
                >
                  Share via WhatsApp
                </a>
              </div>
            )}
            {sellerProofStatus.requested && (
              <div aria-live="polite" className="seller-proof-response" role="status">
                {sellerProofStatus.respondedAt ? (
                  <>
                    <p>
                      Seller responded on{" "}
                      <strong>
                        {new Intl.DateTimeFormat("en-NG", {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone: "Africa/Lagos",
                        }).format(new Date(sellerProofStatus.respondedAt))}
                      </strong>
                      .
                    </p>
                    {sellerProofStatus.sellerPhone && (
                      <p>Seller contact number: {sellerProofStatus.sellerPhone}</p>
                    )}
                    {sellerProofStatus.proofUrl && (
                      <a
                        className="report-action-link"
                        href={sellerProofStatus.proofUrl}
                      >
                        Download seller-submitted photo
                      </a>
                    )}
                  </>
                ) : (
                  <p>Waiting for the seller to respond.</p>
                )}
              </div>
            )}
            {sellerProofMessage && (
              <p aria-live="polite" className="form-message success" role="status">
                {sellerProofMessage}
              </p>
            )}
            {sellerProofError && (
              <p aria-live="polite" className="form-message error" role="alert">
                {sellerProofError}
              </p>
            )}
          </section>
        )}
        <footer className="report-footer">
          Model data: Osmocom TAC database, CC-BY-SA 3.0
        </footer>
      </div>
    </main>
  );
}
