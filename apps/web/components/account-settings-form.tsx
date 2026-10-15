"use client";

import { useState, type FormEvent } from "react";

type AccountSettings = {
  fullName: string;
  username: string | null;
  phone: string | null;
  role: "buyer" | "seller";
  plan: "free" | "premium" | "pro";
};

export function AccountSettingsForm({
  account,
}: {
  account: AccountSettings;
}) {
  const [fullName, setFullName] = useState(account.fullName);
  const [username, setUsername] = useState(account.username ?? "");
  const [phone, setPhone] = useState(account.phone ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/accounts/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          username,
          phone,
          ...(currentPassword || newPassword
            ? { currentPassword, newPassword }
            : {}),
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        account?: {
          fullName: string;
          username: string | null;
          phone: string | null;
        };
      };
      if (!response.ok || !result.account) {
        setError(result.error ?? "Unable to save your settings.");
        return;
      }

      setFullName(result.account.fullName);
      setUsername(result.account.username ?? "");
      setPhone(result.account.phone ?? "");
      setCurrentPassword("");
      setNewPassword("");
      setMessage("Your settings are saved.");
    } catch (saveError) {
      console.error("Account settings request failed.", saveError);
      setError("We couldn’t reach CheckAm. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="login-form settings-form" onSubmit={save}>
      <label htmlFor="settings-full-name">Full name</label>
      <input
        autoComplete="name"
        id="settings-full-name"
        maxLength={100}
        onChange={(event) => setFullName(event.target.value)}
        required
        value={fullName}
      />
      <label htmlFor="settings-username">Username (optional)</label>
      <input
        autoComplete="username"
        id="settings-username"
        maxLength={25}
        onChange={(event) => setUsername(event.target.value)}
        placeholder="@yourname"
        value={username}
      />
      <label htmlFor="settings-phone">Phone number (optional)</label>
      <input
        autoComplete="tel"
        id="settings-phone"
        maxLength={32}
        onChange={(event) => setPhone(event.target.value)}
        type="tel"
        value={phone}
      />

      <p className="settings-account-type">
        Account type: <strong>{account.role}</strong>
        <span>Plan: <strong>{account.plan}</strong></span>
      </p>

      <h2 className="settings-section-title">Change password</h2>
      <p className="login-hint">
        Leave both password fields blank to keep your current password.
      </p>
      <label htmlFor="settings-current-password">Current password</label>
      <input
        autoComplete="current-password"
        id="settings-current-password"
        maxLength={128}
        onChange={(event) => setCurrentPassword(event.target.value)}
        type="password"
        value={currentPassword}
      />
      <label htmlFor="settings-new-password">New password</label>
      <input
        autoComplete="new-password"
        id="settings-new-password"
        maxLength={128}
        minLength={12}
        onChange={(event) => setNewPassword(event.target.value)}
        type="password"
        value={newPassword}
      />

      {message && (
        <p aria-live="polite" className="feedback-success" role="status">
          {message}
        </p>
      )}
      {error && (
        <p aria-live="polite" className="feedback-error" role="alert">
          {error}
        </p>
      )}
      <button className="login-submit" disabled={isSubmitting} type="submit">
        {isSubmitting ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}
