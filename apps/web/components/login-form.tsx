"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type Props = {
  mode: "login" | "register";
};

type ProblemDetails = {
  error?: string;
};

export function LoginForm({ mode }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/accounts/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          ...(mode === "register" ? { phone, role } : {}),
        }),
      });

      if (!response.ok) {
        const problem = (await response.json()) as ProblemDetails;
        setError(problem.error ?? "Unable to continue.");
        return;
      }

      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Unable to reach CheckAm. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <label htmlFor={`${mode}-email`}>Email</label>
      <input
        autoComplete="email"
        autoFocus
        id={`${mode}-email`}
        maxLength={254}
        onChange={(event) => setEmail(event.target.value)}
        required
        type="email"
        value={email}
      />

      <label htmlFor={`${mode}-password`}>Password</label>
      <input
        autoComplete={mode === "register" ? "new-password" : "current-password"}
        id={`${mode}-password`}
        maxLength={128}
        minLength={12}
        onChange={(event) => setPassword(event.target.value)}
        required
        type="password"
        value={password}
      />
      {mode === "register" && (
        <>
          <p className="login-hint">
            Use at least 12 characters. We never log your password.
          </p>
          <label htmlFor="account-role">I am joining as a</label>
          <select
            id="account-role"
            onChange={(event) => setRole(event.target.value)}
            required
            value={role}
          >
            <option value="">Choose a role</option>
            <option value="buyer">Buyer</option>
            <option value="seller">Seller</option>
          </select>
          <label htmlFor="account-phone">Phone number (optional)</label>
          <input
            autoComplete="tel"
            id="account-phone"
            maxLength={32}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="+234 801 234 5678"
            type="tel"
            value={phone}
          />
          <p className="login-hint">
            Your phone number is stored for possible later verification. No SMS
            is sent in this phase.
          </p>
        </>
      )}

      {error && <p className="login-error" role="alert">{error}</p>}

      <button className="login-submit" disabled={isSubmitting} type="submit">
        {isSubmitting
          ? "Please wait…"
          : mode === "register"
            ? "Create account"
            : "Sign in"}
      </button>
    </form>
  );
}
