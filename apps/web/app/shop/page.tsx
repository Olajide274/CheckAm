import Link from "next/link";
import { AccountHeader } from "@/components/account-header";

export default function ShopComingSoonPage() {
  return (
    <main className="account-page">
      <AccountHeader />
      <section className="login-card">
        <p className="login-eyebrow">SELLER TOOLS</p>
        <h1>Shop page coming soon</h1>
        <p className="login-description">
          Seller listings are not available yet. No shop information is
          collected in this phase.
        </p>
        <Link className="login-back" href="/dashboard">
          Return to dashboard
        </Link>
      </section>
    </main>
  );
}
