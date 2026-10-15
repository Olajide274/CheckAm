"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type AccountSummary = {
  email: string;
  fullName: string;
  username: string | null;
  role: "buyer" | "seller";
};

export function AccountNavigation({
  showPricing = true,
}: {
  showPricing?: boolean;
}) {
  const router = useRouter();
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [sessionState, setSessionState] = useState<
    "loading" | "anonymous" | "authenticated" | "error"
  >("loading");
  const [logoutError, setLogoutError] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/accounts/session", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to check account session.");
        return (await response.json()) as {
          authenticated: boolean;
          account?: AccountSummary;
        };
      })
      .then((result) => {
        if (active && result.authenticated && result.account) {
          setAccount(result.account);
          setSessionState("authenticated");
        } else if (active) {
          setSessionState("anonymous");
        }
      })
      .catch((error: unknown) => {
        console.error("Account navigation session lookup failed.", error);
        if (active) setSessionState("error");
      });
    return () => {
      active = false;
    };
  }, []);

  async function logout() {
    setLogoutError("");
    try {
      const response = await fetch("/api/accounts/logout", { method: "POST" });
      if (!response.ok) {
        setLogoutError("Unable to sign out. Please try again.");
        return;
      }
      setAccount(null);
      setSessionState("anonymous");
      router.push("/login?notice=signed-out");
      router.refresh();
    } catch (error) {
      console.error("Account logout request failed.", error);
      setLogoutError("Unable to sign out. Please try again.");
    }
  }

  return (
    <nav aria-label="Account navigation" className="account-nav">
      {sessionState === "loading" ? (
        <span className="header-login-link">Checking account…</span>
      ) : sessionState === "error" ? (
        <>
          <span aria-live="polite" className="header-login-link">
            Account status unavailable
          </span>
          <Link className="header-login-link" href="/login">
            Sign in
          </Link>
        </>
      ) : account ? (
        <>
          <Link className="header-link" href="/dashboard">
            Dashboard
          </Link>
          <Link className="header-link" href="/#imei-check">
            Check IMEI
          </Link>
          {showPricing && (
            <Link className="header-link" href="/pricing">
              Pricing
            </Link>
          )}
          <Link className="header-link" href="/settings">
            Account
          </Link>
          <span className="account-name">
            {account.fullName}
            {account.username && <span> @{account.username}</span>}
          </span>
          <button className="header-login-link account-logout" onClick={logout} type="button">
            Log out
          </button>
        </>
      ) : (
        <>
          {showPricing && (
            <Link className="header-link" href="/pricing">
              Pricing
            </Link>
          )}
          <Link className="header-login-link" href="/login">
            Sign in
          </Link>
          <Link className="header-link" href="/register">
            Create account
          </Link>
        </>
      )}
      {logoutError && (
        <span aria-live="polite" className="login-error">
          {logoutError}
        </span>
      )}
    </nav>
  );
}
