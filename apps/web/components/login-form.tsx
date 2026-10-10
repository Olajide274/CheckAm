"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type ProblemDetails = {
  title?: string;
  detail?: string;
};

export function LoginForm() {
  const router = useRouter();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [code, setCode] = useState("");
  const [codeRequested, setCodeRequested] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch(
        codeRequested ? "/api/auth/otp/verify" : "/api/auth/otp/request",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            codeRequested ? { phoneNumber, code } : { phoneNumber },
          ),
        },
      );

      if (!response.ok) {
        const problem = (await response.json()) as ProblemDetails;
        setError(problem.detail ?? problem.title ?? "Unable to sign in.");
        return;
      }

      if (codeRequested) {
        router.replace("/app");
        router.refresh();
      } else {
        setCodeRequested(true);
      }
    } catch {
      setError("Unable to reach CheckAm. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <label htmlFor="phone-number">Nigerian phone number</label>
      <input
        autoComplete="tel"
        autoFocus
        id="phone-number"
        inputMode="tel"
        onChange={(event) => setPhoneNumber(event.target.value)}
        placeholder="+234 801 234 5678"
        required
        type="tel"
        value={phoneNumber}
      />

      {codeRequested && (
        <>
          <p className="login-hint">
            Enter the six-digit code sent to your phone.
          </p>
          <label htmlFor="otp-code">Sign-in code</label>
          <input
            autoComplete="one-time-code"
            id="otp-code"
            inputMode="numeric"
            maxLength={6}
            onChange={(event) => setCode(event.target.value)}
            pattern="[0-9]{6}"
            required
            value={code}
          />
        </>
      )}

      {error && <p className="login-error" role="alert">{error}</p>}

      <button className="login-submit" disabled={isSubmitting} type="submit">
        {isSubmitting
          ? "Please wait…"
          : codeRequested
            ? "Sign in"
            : "Send a sign-in code"}
      </button>

      {codeRequested && (
        <button
          className="login-resend"
          disabled={isSubmitting}
          onClick={() => {
            setCodeRequested(false);
            setCode("");
          }}
          type="button"
        >
          Use a different number
        </button>
      )}
    </form>
  );
}
