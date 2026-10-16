"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

type AccountSummary = {
  email: string;
  fullName: string;
  username: string | null;
  role: "buyer" | "seller";
};

export function AccountNavigation({
  showPricing = true,
  marketingActions,
}: {
  showPricing?: boolean;
  marketingActions?: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [sessionState, setSessionState] = useState<
    "loading" | "anonymous" | "authenticated" | "error"
  >("loading");
  const [logoutError, setLogoutError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuOpenRef = useRef(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);

  function setAccountMenuOpen(open: boolean) {
    menuOpenRef.current = open;
    setMenuOpen(open);
  }

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

  useEffect(() => {
    if (pathnameRef.current === pathname) return;
    pathnameRef.current = pathname;
    if (!menuOpenRef.current) return;
    const timeout = window.setTimeout(() => setAccountMenuOpen(false), 0);
    return () => window.clearTimeout(timeout);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;

    const menuButton = menuButtonRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    menuPanelRef.current
      ?.querySelector<HTMLElement>("a, button")
      ?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setAccountMenuOpen(false);
        return;
      }

      if (event.key !== "Tab" || !menuPanelRef.current) return;
      const focusable = menuPanelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      const first = focusable.item(0);
      const last = focusable.item(focusable.length - 1);

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      } else if (!menuPanelRef.current.contains(document.activeElement)) {
        event.preventDefault();
        first?.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      if (menuButton?.isConnected) menuButton.focus();
    };
  }, [menuOpen]);

  function closeMenu() {
    setAccountMenuOpen(false);
  }

  function isActive(href: string) {
    const route = href.split("#")[0];
    return (
      pathname === route ||
      (route !== "/" && pathname.startsWith(`${route}/`))
    );
  }

  function accountLink(href: string, label: string) {
    const active = isActive(href);
    return (
      <Link
        aria-current={active ? "page" : undefined}
        className={`header-link${active ? " header-link-active" : ""}`}
        href={href}
        onClick={closeMenu}
      >
        {label}
      </Link>
    );
  }

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
      closeMenu();
      router.push("/login?notice=signed-out");
      router.refresh();
    } catch (error) {
      console.error("Account logout request failed.", error);
      setLogoutError("Unable to sign out. Please try again.");
    }
  }

  return (
    <nav
      aria-label="Account navigation"
      className={`account-nav${account ? " account-nav-authenticated" : ""}`}
    >
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
          <div className="account-desktop-links">
            {accountLink("/dashboard", "Dashboard")}
            {accountLink("/#imei-check", "Check IMEI")}
            {accountLink("/pricing", "Pricing")}
            {accountLink("/settings", "Account")}
          </div>
          <div className="account-desktop-user">
            <span className="account-desktop-identity">
              <span className="account-desktop-name">{account.fullName}</span>
              {account.username && (
                <span className="account-desktop-username">
                  @{account.username}
                </span>
              )}
            </span>
            <button
              className="header-login-link account-logout"
              onClick={logout}
              type="button"
            >
              Log out
            </button>
          </div>
          <div className="account-mobile-bar">
            <span className="account-greeting">
              Hi, {account.fullName.split(" ")[0]}
            </span>
            <button
              aria-controls="account-menu-panel"
              aria-expanded={menuOpen}
              aria-label={menuOpen ? "Close account menu" : "Open account menu"}
              className="account-menu-toggle"
              onClick={() => setAccountMenuOpen(!menuOpen)}
              ref={menuButtonRef}
              type="button"
            >
              <span aria-hidden="true" className="account-menu-icon">
                <span />
                <span />
                <span />
              </span>
              <span>{menuOpen ? "Close" : "Menu"}</span>
            </button>
          </div>
          <button
            aria-hidden={!menuOpen}
            aria-label="Close account menu"
            className="account-menu-backdrop"
            onClick={closeMenu}
            data-open={menuOpen}
            tabIndex={-1}
            type="button"
          />
          <div
            aria-hidden={!menuOpen}
            aria-label="Account menu"
            aria-modal="true"
            className="account-menu-panel"
            data-open={menuOpen}
            id="account-menu-panel"
            inert={!menuOpen}
            ref={menuPanelRef}
            role="dialog"
          >
            <div className="account-menu-heading">
              <div>
                <p className="account-menu-name">{account.fullName}</p>
                {account.username && (
                  <p className="account-menu-username">@{account.username}</p>
                )}
              </div>
              <button
                aria-label="Close account menu"
                className="account-menu-close"
                onClick={closeMenu}
                type="button"
              >
                ×
              </button>
            </div>
            <nav aria-label="Account menu links" className="account-menu-links">
              {accountLink("/dashboard", "Dashboard")}
              {accountLink("/#imei-check", "Check IMEI")}
              {accountLink("/pricing", "Pricing")}
              {accountLink("/settings", "Account / Settings")}
              <button
                className="account-menu-logout"
                onClick={logout}
                type="button"
              >
                Log out
              </button>
              {logoutError && (
                <span aria-live="polite" className="login-error">
                  {logoutError}
                </span>
              )}
            </nav>
          </div>
        </>
      ) : (
        <div className="account-anonymous-actions">
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
          {marketingActions}
        </div>
      )}
      {logoutError && !menuOpen && (
        <span aria-live="polite" className="login-error">
          {logoutError}
        </span>
      )}
    </nav>
  );
}
