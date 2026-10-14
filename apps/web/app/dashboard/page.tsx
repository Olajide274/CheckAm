import { Suspense } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AccountHeader } from "@/components/account-header";
import { getAccountForToken } from "@/lib/accounts";
import {
  getAccountReportUsageCount,
  getAccountUsageCount,
} from "@/lib/database";
import {
  FREE_BUYER_FULL_REPORTS_PER_30_DAYS,
  FREE_SELLER_BILL_OF_SALE_USES_PER_30_DAYS,
} from "@/lib/entitlements";
import { isBillOfSaleEnabled } from "@/lib/features";

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <main className="account-page">
          <section className="app-content">
            <p className="login-hint">Loading your dashboard...</p>
          </section>
        </main>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}

async function DashboardContent() {
  const cookieStore = await cookies();
  const account = await getAccountForToken(
    cookieStore.get("checkam_account_session")?.value,
  );
  if (!account) redirect("/login?next=/dashboard");

  const reportUsage =
    account.role === "buyer" && account.plan === "free"
      ? await getAccountReportUsageCount(account.id)
      : null;
  const billOfSaleUsage =
    account.role === "seller" && account.plan === "free"
      ? await getAccountUsageCount({
          accountId: account.id,
          action: "bill_of_sale",
        })
      : null;

  return (
    <main className="account-page">
      <AccountHeader />
      <section className="app-content">
        <div className="app-welcome">
          <p className="app-eyebrow">{account.role.toUpperCase()} DASHBOARD</p>
          <h1>Welcome to CheckAm</h1>
          <p className="app-description">
            Signed in as {account.email}. Your current plan is{" "}
            <strong>{account.plan}</strong>.
          </p>
          {!account.emailVerified && (
            <p className="verification-notice" role="status">
              Your email is not verified yet. You can use your account; email
              delivery is not connected in this phase.
            </p>
          )}
          {account.role === "buyer" ? (
            <>
              <p className="entitlement-summary">
                Full report access: {reportUsage} of{" "}
                {FREE_BUYER_FULL_REPORTS_PER_30_DAYS} used in the rolling
                30-day period. Format-only IMEI checks remain unlimited.
              </p>
              <div className="dashboard-actions">
                <Link className="app-check-link" href="/#imei-check">
                  Check an IMEI
                </Link>
                <Link className="dashboard-action-link" href="/#payment-report">
                  Get a full report
                </Link>
                {isBillOfSaleEnabled() ? (
                  <Link className="dashboard-action-link" href="/bill-of-sale">
                    Bill of sale
                  </Link>
                ) : (
                  <Link className="dashboard-action-link" href="/pricing">
                    Bill of sale (coming soon)
                  </Link>
                )}
                <Link className="dashboard-action-link" href="/pricing">
                  Seller Proof information
                </Link>
              </div>
            </>
          ) : (
            <>
              <p className="entitlement-summary">
                Bill of sale actions: {billOfSaleUsage} of{" "}
                {FREE_SELLER_BILL_OF_SALE_USES_PER_30_DAYS} used in the rolling
                30-day period on this account.
              </p>
              <div className="dashboard-actions">
                {isBillOfSaleEnabled() ? (
                  <Link
                    className="app-check-link"
                    href="/bill-of-sale"
                    prefetch={false}
                  >
                    Create a bill of sale
                  </Link>
                ) : (
                  <Link className="dashboard-action-link" href="/pricing">
                    Bill of sale (coming soon)
                  </Link>
                )}
                <Link className="dashboard-action-link" href="/pricing">
                  Seller Proof: learn how to respond to a buyer&apos;s request
                </Link>
                <Link className="dashboard-action-link" href="/shop">
                  Shop page coming soon
                </Link>
              </div>
              <p className="login-hint" id="shop">
                A shop page is not available yet. No listings or shop data are
                collected in this phase.
              </p>
            </>
          )}
          <p className="login-hint">
            Need a different plan?{" "}
            <Link href="/pricing" className="inline-link">Compare plans</Link>.
            Premium and Pro billing are not available yet.
          </p>
          {!isBillOfSaleEnabled() && account.role === "buyer" && (
            <p className="login-hint">
              The browser-only bill of sale generator is not enabled on this
              deployment.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
