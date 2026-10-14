"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CheckAmLogo } from "@/components/checkam-logo";
import { AccountNavigation } from "@/components/account-navigation";
import { arePaymentsEnabled, isBillOfSaleEnabled } from "@/lib/features";
import { isValidImei } from "@/lib/imei";
import { trackEvent } from "@/lib/track-event";

const devices = ["phone", "laptop", "tablet"] as const;

const features = [
  "Model match",
  "Registry status",
  "Seller proof",
  "Bill of sale",
  "WhatsApp check",
  "Condition snapshot",
] as const;

type Feature = (typeof features)[number];

function useDeviceWord() {
  const [device, setDevice] = useState<string>("phone");
  const [reducedMotion, setReducedMotion] = useState(true);

  useEffect(() => {
    const mediaQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mediaQuery) return;

    const updatePreference = () => setReducedMotion(mediaQuery.matches);

    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    if (reducedMotion) return;

    let deviceIndex = 0;
    let timeout: number;

    function typeDevice(word: string, length: number) {
      setDevice(word.slice(0, length));
      if (length < word.length) {
        timeout = window.setTimeout(() => typeDevice(word, length + 1), 90);
      } else {
        timeout = window.setTimeout(() => deleteDevice(word, word.length), 1600);
      }
    }

    function deleteDevice(word: string, length: number) {
      if (length > 0) {
        setDevice(word.slice(0, length - 1));
        timeout = window.setTimeout(() => deleteDevice(word, length - 1), 50);
      } else {
        deviceIndex = (deviceIndex + 1) % devices.length;
        timeout = window.setTimeout(
          () => typeDevice(devices[deviceIndex], 1),
          90,
        );
      }
    }

    timeout = window.setTimeout(
      () => deleteDevice(devices[deviceIndex], devices[deviceIndex].length),
      1600,
    );
    return () => window.clearTimeout(timeout);
  }, [reducedMotion]);

  return reducedMotion ? "phone" : device;
}

export default function Home() {
  const device = useDeviceWord();
  const [imei, setImei] = useState("");
  const [imeiMessage, setImeiMessage] = useState("");
  const [receiptEmail, setReceiptEmail] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [paymentState, setPaymentState] = useState<
    "idle" | "initializing" | "confirming" | "paid" | "failed" | "error"
  >("idle");
  const [paymentReference, setPaymentReference] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [feature, setFeature] = useState<Feature | "">("");
  const [signupMessage, setSignupMessage] = useState("");
  const [signupError, setSignupError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    void trackEvent("page_view");

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.error("Service worker registration failed.", error);
      });
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get("reference") ?? params.get("trxref");
    if (reference) {
      const timeout = window.setTimeout(() => {
        setPaymentReference(reference);
        setPaymentState("confirming");
      }, 0);
      return () => window.clearTimeout(timeout);
    }
  }, []);

  useEffect(() => {
    if (!paymentReference || paymentState !== "confirming") return;

    let cancelled = false;
    let timeout: number | undefined;

    async function checkPaymentStatus() {
      try {
        const response = await fetch(
          `/api/payments/status?reference=${encodeURIComponent(paymentReference)}`,
          { cache: "no-store" },
        );
        if (cancelled) return;

        if (response.status === 400 || response.status === 404) {
          setPaymentError("We couldn’t find this payment. Please try again.");
          setPaymentState("error");
          return;
        }
        if (!response.ok) {
          timeout = window.setTimeout(checkPaymentStatus, 5000);
          return;
        }

        const result: unknown = await response.json();
        if (
          typeof result === "object" &&
          result !== null &&
          "status" in result
        ) {
          if (result.status === "paid") {
            setPaymentState("paid");
            return;
          }
          if (result.status === "failed") {
            setPaymentState("failed");
            return;
          }
          if (result.status === "pending") {
            timeout = window.setTimeout(checkPaymentStatus, 5000);
            return;
          }
        }

        setPaymentError("We couldn’t confirm this payment. Please try again.");
        setPaymentState("error");
      } catch (error) {
        console.error("Payment status request failed.", error);
        if (!cancelled) {
          timeout = window.setTimeout(checkPaymentStatus, 5000);
        }
      }
    }

    void checkPaymentStatus();
    return () => {
      cancelled = true;
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, [paymentReference, paymentState]);

  function handleImeiSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void trackEvent("imei_check_attempted");

    setImeiMessage(
      isValidImei(imei)
        ? "IMEI format looks valid. This does not tell you the brand/model or whether the phone has been reported. Unlock the full report (₦500) for model match, bill of sale, and seller proof request."
        : "Enter a valid 15-digit IMEI and try again.",
    );
  }

  async function handlePaymentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPaymentError("");

    if (imei && !isValidImei(imei)) {
      setPaymentError("Enter a valid IMEI or clear the IMEI field before paying.");
      return;
    }

    setPaymentState("initializing");
    void trackEvent("full_report_click");

    try {
      const response = await fetch("/api/payments/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: receiptEmail,
          ...(imei ? { imei } : {}),
        }),
      });
      const result: unknown = await response.json();
      if (
        !response.ok ||
        typeof result !== "object" ||
        result === null ||
        !("authorization_url" in result) ||
        typeof result.authorization_url !== "string"
      ) {
        throw new Error("Payment initialization failed.");
      }

      const authorizationUrl = new URL(result.authorization_url);
      if (
        authorizationUrl.protocol !== "https:" ||
        authorizationUrl.hostname !== "checkout.paystack.com"
      ) {
        throw new Error("Paystack returned an unexpected payment URL.");
      }
      window.location.assign(authorizationUrl.toString());
    } catch (error) {
      console.error("Payment initialization request failed.", error);
      setPaymentError("We couldn’t start your payment. Please try again.");
      setPaymentState("error");
    }
  }

  async function handleWaitlistSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!feature) return;

    setIsSubmitting(true);
    setSignupMessage("");
    setSignupError("");

    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, phone, feature }),
      });

      if (!response.ok) {
        setSignupError("We couldn’t save your details. Please try again.");
        return;
      }

      setSignupMessage("You’re on the list. Thanks for helping shape CheckAm.");
      setEmail("");
      setPhone("");
      setFeature("");
    } catch (error) {
      console.error("Waitlist signup request failed.", error);
      setSignupError("We couldn’t save your details. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main>
      <header className="site-header">
        <div className="header-inner">
          <CheckAmLogo />
          <div className="header-actions">
            <AccountNavigation showPricing={false} />
            {isBillOfSaleEnabled() && (
              <a className="header-link" href="/bill-of-sale">
                Bill of sale
              </a>
            )}
            <a className="header-link" href="#waitlist">
              Get early access <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-inner">
          <div className="hero-copy">
            <p className="eyebrow"><span /> A smarter second-hand buy</p>
            <h1 aria-label="Check a phone before you pay." id="hero-title">
              Check a{" "}
              <span aria-hidden="true" className="headline-device">
                <span className="headline-device-sizer">laptop</span>
                <span className="headline-device-word">{device}</span>
                <span className="headline-cursor" />
              </span>{" "}
              before you pay.
            </h1>
            <p className="hero-description">
              Confirm the model matches what the seller says, see if the owner
              reported it lost or stolen, and ask the seller for proof.
            </p>
            <a className="primary-link" href="#imei-check">
              Check a phone <span aria-hidden="true">↓</span>
            </a>
            <p className="hero-note">
              Built for buyers and sellers across Nigeria.
            </p>
          </div>

          <div className="phone-card" aria-label="CheckAm phone preview">
            <div className="phone-card-top">
              <span className="card-label">BEFORE YOU PAY</span>
              <span className="card-dot" aria-hidden="true" />
            </div>
            <div
              aria-label="CheckAm phone illustration"
              className="phone-illustration"
              role="img"
              tabIndex={0}
            >
              <div className="phone-outline">
                <div className="phone-camera" />
                <div className="phone-screen">
                  <span className="phone-check">
                    <svg aria-hidden="true" viewBox="0 0 24 24">
                      <path className="phone-check-path" d="m3 12 6 6L21 5" />
                    </svg>
                  </span>
                  <span className="phone-screen-line" />
                  <span className="phone-screen-line short" />
                </div>
              </div>
              <span className="spark spark-one">✳</span>
              <span className="spark spark-two">✳</span>
            </div>
            <p className="card-caption">Make an informed choice.</p>
            <p className="card-subcaption">CheckAm is getting ready.</p>
          </div>
        </div>
      </section>

      <section className="check-section" id="imei-check" aria-labelledby="check-title">
        <div className="section-inner check-grid">
          <div className="section-copy">
            <p className="eyebrow">START WITH THE BASICS</p>
            <h2 id="check-title">Check a phone before you buy</h2>
            <p>
              Enter the phone&apos;s 15-digit IMEI to check its format. A full
              registry report is coming soon.
            </p>
          </div>
          <div className="check-panel">
            <form onSubmit={handleImeiSubmit} noValidate>
              <label htmlFor="imei">Phone IMEI</label>
              <div className="input-with-button">
                <input
                  autoComplete="off"
                  id="imei"
                  inputMode="numeric"
                  maxLength={15}
                  name="imei"
                  onChange={(event) => {
                    setImei(event.target.value.replace(/\D/g, "").slice(0, 15));
                    setImeiMessage("");
                  }}
                  placeholder="e.g. 490154203237518"
                  value={imei}
                />
                <button type="submit">Check IMEI</button>
              </div>
              <p className="field-hint">Find it in Settings or dial *#06#.</p>
              <p className="form-message" aria-live="polite">
                {imeiMessage}
              </p>
              <p className="field-hint">
                This result is based on information reported by users. It is not
                proof of ownership, legality or safety.
              </p>
            </form>
            <div className="report-callout" id="payment-report">
              {paymentState === "confirming" && (
                <p className="form-message" role="status">
                  Confirming payment…
                </p>
              )}
              {paymentState === "paid" && (
                <div className="payment-success" role="status">
                  <strong>Payment received. Full report is being prepared.</strong>
                  <a href={`/report/${encodeURIComponent(paymentReference)}`}>
                    Open the report
                  </a>
                  {isBillOfSaleEnabled() && (
                    <a className="header-link" href="/bill-of-sale">
                      Bill of Sale
                    </a>
                  )}
                </div>
              )}
              {paymentState === "failed" && (
                <p className="form-message error" role="status">
                  Payment wasn’t completed. You can try again.
                </p>
              )}
              {(paymentState === "idle" ||
                paymentState === "initializing" ||
                paymentState === "error" ||
                paymentState === "failed") &&
                (arePaymentsEnabled() ? (
                  <form className="payment-form" onSubmit={handlePaymentSubmit}>
                    <div>
                      <strong>Want the full report?</strong>
                      <span>Enter an email for your receipt only.</span>
                    </div>
                    <label htmlFor="payment-email">Email for receipt</label>
                    <input
                      autoComplete="email"
                      id="payment-email"
                      name="payment-email"
                      onChange={(event) => setReceiptEmail(event.target.value)}
                      required
                      type="email"
                      value={receiptEmail}
                    />
                    <button
                      className="report-button"
                      disabled={paymentState === "initializing"}
                      type="submit"
                    >
                      {paymentState === "initializing"
                        ? "Starting payment…"
                        : "Get the full report – ₦500"}
                    </button>
                    <p className="form-message error" role="alert">
                      {paymentError}
                    </p>
                  </form>
                ) : (
                  <>
                    <div>
                      <strong>Want the full report?</strong>
                      <span>Help us understand what buyers need.</span>
                    </div>
                    <button
                      className="report-button"
                      onClick={() => void trackEvent("full_report_click")}
                      type="button"
                    >
                      Get the full report – ₦500
                    </button>
                  </>
                ))}
            </div>
          </div>
        </div>
      </section>

      <section className="waitlist-section" id="waitlist" aria-labelledby="waitlist-title">
        <div className="section-inner waitlist-grid">
          <div className="section-copy waitlist-copy">
            <p className="eyebrow">HELP US BUILD WHAT MATTERS</p>
            <h2 id="waitlist-title">Be first to know when CheckAm is ready.</h2>
            <p>
              Join the early access list and tell us which feature you would
              use most.
            </p>
            <div className="waitlist-aside">
              <span className="aside-icon" aria-hidden="true">✳</span>
              <span>Your details are only used to contact you about CheckAm.</span>
            </div>
          </div>

          <form className="waitlist-form" onSubmit={handleWaitlistSubmit}>
            <label htmlFor="email">Email address</label>
            <input
              autoComplete="email"
              id="email"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
              type="email"
              value={email}
            />

            <label htmlFor="phone">Phone number <span>(optional)</span></label>
            <input
              autoComplete="tel"
              id="phone"
              inputMode="tel"
              name="phone"
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+234 800 000 0000"
              type="tel"
              value={phone}
            />

            <fieldset>
              <legend>Which feature would you use most?</legend>
              <div className="feature-options">
                {features.map((option) => (
                  <label className="feature-option" key={option}>
                    <input
                      checked={feature === option}
                      name="feature"
                      onChange={() => setFeature(option)}
                      required
                      type="radio"
                      value={option}
                    />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <button className="submit-button" disabled={isSubmitting} type="submit">
              {isSubmitting ? "Joining…" : "Join the waitlist"}
              <span aria-hidden="true">↗</span>
            </button>
            <p className="form-message success" role="status">{signupMessage}</p>
            <p className="form-message error" role="alert">{signupError}</p>
          </form>
        </div>
      </section>

      <footer className="site-footer">
        <div className="footer-inner">
          <CheckAmLogo />
          <p>
            CheckAm is a private, user-reported registry and is not affiliated
            with the NCC.
          </p>
          <p className="disclaimer">
            This result is based on information reported by users. It is not
            proof of ownership, legality or safety.
          </p>
          <span className="copyright">© CheckAm</span>
        </div>
      </footer>
    </main>
  );
}
