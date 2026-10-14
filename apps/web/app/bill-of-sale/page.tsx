import { Suspense } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { AccountHeader } from "@/components/account-header";
import BillOfSaleGenerator from "@/components/bill-of-sale-generator";
import { getAccountForToken } from "@/lib/accounts";
import { consumeAccountUsage } from "@/lib/database";
import { FREE_SELLER_BILL_OF_SALE_USES_PER_30_DAYS } from "@/lib/entitlements";
import { isBillOfSaleEnabled } from "@/lib/features";

export default async function BillOfSalePage() {
  if (!isBillOfSaleEnabled()) notFound();

  return (
    <Suspense
      fallback={
        <main className="account-page">
          <section className="login-card">
            <p className="login-hint">Loading bill of sale...</p>
          </section>
        </main>
      }
    >
      <BillOfSaleContent />
    </Suspense>
  );
}

async function BillOfSaleContent() {
  const cookieStore = await cookies();
  const account = await getAccountForToken(
    cookieStore.get("checkam_account_session")?.value,
  );
  if (account?.role === "seller" && account.plan === "free") {
    const usage = await consumeAccountUsage({
      accountId: account.id,
      action: "bill_of_sale",
      limit: FREE_SELLER_BILL_OF_SALE_USES_PER_30_DAYS,
    });
    if (!usage.allowed) {
      return (
        <main className="account-page">
          <AccountHeader />
          <section className="login-card">
            <h1>Free bill of sale limit reached</h1>
            <p className="login-description">
              Your account has used its two bill of sale actions for this
              rolling 30-day period. Premium and Pro are not available yet.
            </p>
            <Link className="login-back" href="/dashboard">
              Return to dashboard
            </Link>
          </section>
        </main>
      );
    }
  }

  return <BillOfSaleGenerator />;
}
