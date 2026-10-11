"use client";

import { useState } from "react";
import Link from "next/link";
import type { PaymentRecord } from "@/lib/database";
import { isBillOfSaleEnabled } from "@/lib/features";
import { compareSellerDescription } from "@/lib/model-description";
import type { ModelLookupResult } from "@/lib/model-lookup";

export default function ReportPageContent({
  model,
  payment,
}: {
  model: ModelLookupResult;
  payment: PaymentRecord;
}) {
  const [sellerDescription, setSellerDescription] = useState("");
  const formatResult =
    payment.imeiFormatValid === true ? "valid" : "invalid";
  const luhnResult = payment.imeiLuhnValid === true ? "pass" : "fail";
  const sellerMatch = compareSellerDescription(sellerDescription, model);

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
          <h2>Model code check</h2>
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
            <Link href="/bill-of-sale">Bill of Sale</Link>
          </section>
        )}
        <footer className="report-footer">
          Model data: Osmocom TAC database, CC-BY-SA 3.0
        </footer>
      </div>
    </main>
  );
}
