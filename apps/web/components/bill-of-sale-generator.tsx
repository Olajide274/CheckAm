"use client";

import Link from "next/link";
import { useState, useSyncExternalStore, type FormEvent } from "react";
import {
  createBillOfSaleShareUrl,
  isValidBillOfSale,
  readBillOfSaleShareHash,
  type BillOfSaleData,
  type DeviceType,
  validateBillOfSale,
} from "@/lib/bill-of-sale";
import { CheckAmLogo } from "@/components/checkam-logo";

function subscribeToHashChange(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function getHashSnapshot() {
  return window.location.hash;
}

function getServerHashSnapshot() {
  return "";
}

function emptyBillOfSale(): BillOfSaleData {
  return {
    sellerName: "",
    sellerPhone: "",
    buyerName: "",
    buyerPhone: "",
    deviceType: "Phone",
    brand: "",
    model: "",
    identifierType: "IMEI",
    identifier: "",
    agreedPrice: "",
    date: "",
    conditionNotes: "",
  };
}

function formatNaira(price: string): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 2,
  }).format(Number(price));
}

function formatAgreementDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-NG", {
    dateStyle: "long",
  });
}

export default function BillOfSaleGenerator() {
  const [initialData] = useState(emptyBillOfSale);
  const [editedData, setEditedData] = useState<BillOfSaleData | null>(null);
  const [feedback, setFeedback] = useState("");
  const shareHash = useSyncExternalStore(
    subscribeToHashChange,
    getHashSnapshot,
    getServerHashSnapshot,
  );
  const sharedData = readBillOfSaleShareHash(shareHash);
  const data = editedData ?? sharedData ?? initialData;
  const invalidShareLink = shareHash.startsWith("#data=") && !sharedData;
  const valid = isValidBillOfSale(data);

  function updateField<Key extends keyof BillOfSaleData>(
    field: Key,
    value: BillOfSaleData[Key],
  ) {
    setEditedData({ ...data, [field]: value });
    setFeedback("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid) {
      setFeedback(Object.values(validateBillOfSale(data))[0] ?? "Review the form fields and try again.");
      return;
    }
    window.print();
  }

  async function copyShareLink() {
    if (!valid) {
      setFeedback(Object.values(validateBillOfSale(data))[0] ?? "Complete all fields.");
      return;
    }

    const shareUrl = createBillOfSaleShareUrl(data, window.location.origin);
    try {
      await navigator.clipboard.writeText(shareUrl);
      setFeedback("Share link copied.");
    } catch (error) {
      console.error("Could not copy the bill of sale share link.", error);
      setFeedback("Could not copy the link. Please copy it from your browser.");
    }
  }

  function shareOnWhatsApp() {
    if (!valid) {
      setFeedback(Object.values(validateBillOfSale(data))[0] ?? "Complete all fields.");
      return;
    }

    const shareUrl = createBillOfSaleShareUrl(data, window.location.origin);
    const message = `Bill of sale: ${shareUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  }

  const fields: {
    name: keyof BillOfSaleData;
    label: string;
    value: string;
    type?: string;
    autoComplete?: string;
  }[] = [
    { name: "sellerName", label: "Seller name", value: data.sellerName, autoComplete: "name" },
    { name: "sellerPhone", label: "Seller phone number", value: data.sellerPhone, type: "tel", autoComplete: "tel" },
    { name: "buyerName", label: "Buyer name", value: data.buyerName, autoComplete: "name" },
    { name: "buyerPhone", label: "Buyer phone number", value: data.buyerPhone, type: "tel", autoComplete: "tel" },
    { name: "brand", label: "Brand", value: data.brand },
    { name: "model", label: "Model", value: data.model },
    { name: "agreedPrice", label: "Agreed price (naira)", value: data.agreedPrice, type: "number" },
    { name: "date", label: "Date", value: data.date, type: "date" },
  ];

  return (
    <main className="bill-page">
      <div className="bill-page-inner">
        <header className="bill-page-header">
          <CheckAmLogo />
          <Link href="/">Back to CheckAm</Link>
        </header>
        <h1 className="bill-heading">Bill of sale</h1>
        <p className="bill-intro">
          Record the sale details, then print or save the agreement as a PDF.
        </p>

        <form className="bill-form" noValidate onSubmit={handleSubmit}>
          {fields.slice(0, 4).map((field) => (
            <div className="bill-field" key={field.name}>
              <label htmlFor={field.name}>{field.label}</label>
              <input
                autoComplete={field.autoComplete}
                id={field.name}
                name={field.name}
                onChange={(event) => updateField(field.name, event.target.value)}
                required
                type={field.type ?? "text"}
                value={field.value}
              />
            </div>
          ))}

          <div className="bill-field">
            <label htmlFor="deviceType">Device type</label>
            <select
              id="deviceType"
              name="deviceType"
              onChange={(event) =>
                updateField("deviceType", event.target.value as DeviceType)
              }
              value={data.deviceType}
            >
              {(["Phone", "Laptop", "Tablet", "Other"] as const).map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          {fields.slice(4, 6).map((field) => (
            <div className="bill-field" key={field.name}>
              <label htmlFor={field.name}>{field.label}</label>
              <input
                id={field.name}
                name={field.name}
                onChange={(event) => updateField(field.name, event.target.value)}
                required
                type="text"
                value={field.value}
              />
            </div>
          ))}

          <fieldset>
            <legend>Device identifier</legend>
            {(["IMEI", "Serial number"] as const).map((type) => (
              <label key={type}>
                <input
                  checked={data.identifierType === type}
                  name="identifierType"
                  onChange={() => {
                    setEditedData({ ...data, identifierType: type, identifier: "" });
                    setFeedback("");
                  }}
                  type="radio"
                  value={type}
                />
                {type}
              </label>
            ))}
          </fieldset>

          <div className="bill-field bill-field-wide">
            <label htmlFor="identifier">
              {data.identifierType === "IMEI" ? "15-digit IMEI" : "Serial number"}
            </label>
            <input
              autoComplete="off"
              id="identifier"
              inputMode={data.identifierType === "IMEI" ? "numeric" : "text"}
              maxLength={data.identifierType === "IMEI" ? 15 : 100}
              name="identifier"
              onChange={(event) =>
                updateField(
                  "identifier",
                  data.identifierType === "IMEI"
                    ? event.target.value.replace(/\D/g, "").slice(0, 15)
                    : event.target.value,
                )
              }
              required
              value={data.identifier}
            />
          </div>

          {fields.slice(6).map((field) => (
            <div className="bill-field" key={field.name}>
              <label htmlFor={field.name}>{field.label}</label>
              <input
                id={field.name}
                max={field.name === "agreedPrice" ? "999999999999" : undefined}
                min={field.name === "agreedPrice" ? "0" : undefined}
                name={field.name}
                onChange={(event) => updateField(field.name, event.target.value)}
                required
                step={field.name === "agreedPrice" ? "0.01" : undefined}
                type={field.type}
                value={field.value}
              />
            </div>
          ))}

          <div className="bill-field bill-field-wide">
            <label htmlFor="conditionNotes">Condition notes</label>
            <textarea
              id="conditionNotes"
              maxLength={1000}
              name="conditionNotes"
              onChange={(event) => updateField("conditionNotes", event.target.value)}
              value={data.conditionNotes}
            />
          </div>

          <p className="bill-privacy-note">
            Agreement details stay in this browser and are included in the share link; they are not saved on CheckAm servers.
          </p>
          {(feedback || invalidShareLink) && (
            <p className="bill-form-error" role="alert">
              {feedback || "This share link is invalid or incomplete."}
            </p>
          )}
          {!valid && (
            <p className="bill-feedback" role="status">
              {Object.values(validateBillOfSale(data))[0] ?? "Complete the form to print and share."}
            </p>
          )}
          <div className="bill-actions">
            <button disabled={!valid} type="submit">Print / save as PDF</button>
            <button
              className="bill-secondary-action"
              disabled={!valid}
              onClick={() => void copyShareLink()}
              type="button"
            >
              Copy share link
            </button>
            <button
              className="bill-secondary-action"
              disabled={!valid}
              onClick={shareOnWhatsApp}
              type="button"
            >
              Share on WhatsApp
            </button>
          </div>
        </form>

        <article className="bill-document" aria-label="Bill of sale preview">
          <h2>Bill of sale</h2>
          <p className="bill-document-intro">Agreement details</p>
          <div className="bill-document-grid">
            <DocumentField label="Seller" value={data.sellerName} />
            <DocumentField label="Seller phone" value={data.sellerPhone} />
            <DocumentField label="Buyer" value={data.buyerName} />
            <DocumentField label="Buyer phone" value={data.buyerPhone} />
            <DocumentField label="Device type" value={data.deviceType} />
            <DocumentField label="Brand and model" value={[data.brand, data.model].filter(Boolean).join(" ") || "—"} />
            <DocumentField label={data.identifierType} value={data.identifier} />
            <DocumentField label="Agreed price" value={data.agreedPrice ? formatNaira(data.agreedPrice) : "—"} />
            <DocumentField label="Date" value={data.date ? formatAgreementDate(data.date) : "—"} />
            <DocumentField
              label="Condition notes"
              value={data.conditionNotes || "None"}
              wide
            />
          </div>
          <p className="bill-disclaimer">
            This document records an agreement between the parties. CheckAm is not a party to the sale and does not verify ownership.
          </p>
        </article>
      </div>
    </main>
  );
}

function DocumentField({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={`bill-document-field${wide ? " bill-document-field-wide" : ""}`}>
      <span className="bill-document-label">{label}</span>
      <span className="bill-document-value">{value || "—"}</span>
    </div>
  );
}
