"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckAmLogo } from "@/components/checkam-logo";

const tabs = ["Check", "My Devices", "History", "Account"] as const;
type AppTab = (typeof tabs)[number];

type ProblemDetails = {
  title?: string;
  detail?: string;
};

export default function AppHomePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<AppTab>("Check");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let isActive = true;

    async function checkSession() {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        if (response.status === 401) {
          router.replace("/login");
          return;
        }
        if (!response.ok) {
          const problem = (await response.json()) as ProblemDetails;
          throw new Error(problem.detail ?? problem.title ?? "Unable to check your sign-in.");
        }
        if (isActive) setIsLoading(false);
      } catch (caught) {
        if (isActive) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to check your sign-in.",
          );
          setIsLoading(false);
        }
      }
    }

    void checkSession();
    return () => {
      isActive = false;
    };
  }, [retryCount, router]);

  async function signOut() {
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) {
        setError("Unable to sign out. Please try again.");
        return;
      }
      router.replace("/login");
      router.refresh();
    } catch {
      setError("Unable to reach CheckAm. Check your connection and try again.");
    }
  }

  if (isLoading) {
    return <main className="app-loading" aria-live="polite">Loading your account…</main>;
  }

  if (error) {
    return (
      <main className="app-loading" role="alert">
        <p>{error}</p>
        <button
          className="login-submit"
          onClick={() => {
            setError("");
            setIsLoading(true);
            setRetryCount((count) => count + 1);
          }}
          type="button"
        >
          Try again
        </button>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <CheckAmLogo href="/app" />
        <button className="app-signout" onClick={() => void signOut()} type="button">
          Sign out
        </button>
      </header>

      <section aria-live="polite" className="app-content">
        {activeTab === "Check" ? (
          <div className="app-welcome">
            <p className="app-eyebrow">CHECKAM</p>
            <h1>Welcome to CheckAm</h1>
            <p className="app-description">
              Start with a phone check before you pay.
            </p>
            <Link className="app-check-link" href="/#imei-check">
              Check a phone <span aria-hidden="true">→</span>
            </Link>
          </div>
        ) : (
          <div className="app-placeholder">
            <p className="app-eyebrow">{activeTab.toUpperCase()}</p>
            <h1>{activeTab}</h1>
            <p className="app-description">Coming soon.</p>
          </div>
        )}
      </section>

      <nav aria-label="Main navigation" className="app-tabs">
        {tabs.map((tab) => (
          <button
            aria-current={activeTab === tab ? "page" : undefined}
            className={`app-tab${activeTab === tab ? " active" : ""}`}
            key={tab}
            onClick={() => setActiveTab(tab)}
            type="button"
          >
            <span aria-hidden="true" className={`app-tab-icon ${tab.toLowerCase().replace(" ", "-")}`} />
            <span>{tab}</span>
          </button>
        ))}
      </nav>
    </main>
  );
}
