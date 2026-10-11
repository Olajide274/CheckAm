"use client";

import Link from "next/link";
import type { PaymentRecord } from "@/lib/database";
import { isBillOfSaleEnabled } from "@/lib/features";

export default function ReportPageContent({
  payment,
}: {
  payment: PaymentRecord;
}) {
  const formatResult =
    payment.imeiFormatValid === true ? "valid" : "invalid";
  const luhnResult = payment.imeiLuhnValid === true ? "pass" : "fail";

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
          <h2>Model check</h2>
          <p>Model check is not available yet.</p>
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
      </div>
    </main>
  );
}
