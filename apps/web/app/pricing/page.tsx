import Link from "next/link";
import { AccountHeader } from "@/components/account-header";
import {
  FREE_BUYER_FULL_REPORTS_PER_30_DAYS,
  FREE_SELLER_BILL_OF_SALE_USES_PER_30_DAYS,
} from "@/lib/entitlements";

const paidPlans = [
  {
    name: "Premium",
    description:
      "Additional buyer and seller features are planned. No payment is available.",
  },
  {
    name: "Pro",
    description:
      "Higher-volume buyer and seller tools are planned. No payment is available.",
  },
] as const;

export default function PricingPage() {
  return (
    <main className="account-page">
      <AccountHeader />
      <section className="pricing-content">
        <p className="login-eyebrow">PLANS</p>
        <h1>Choose how you use CheckAm</h1>
        <p className="login-description">
          Free account limits are enforced by the server. Premium and Pro are
          shown for planning only; subscription checkout is not available.
        </p>

        <div className="pricing-roles">
          <section aria-labelledby="buyer-plans">
            <h2 id="buyer-plans">For buyers</h2>
            <div className="pricing-cards">
              <article className="pricing-card">
                <h3>Free</h3>
                <p>₦0</p>
                <ul>
                  <li>Unlimited IMEI format and Luhn checks</li>
                  <li>
                    Up to {FREE_BUYER_FULL_REPORTS_PER_30_DAYS} full report
                    unlock per rolling 30 days
                  </li>
                  <li>Report unlocks use the existing ₦500 one-time checkout</li>
                  <li>Buyer dashboard</li>
                </ul>
                <Link className="app-check-link" href="/register">
                  Create free account
                </Link>
              </article>
              {paidPlans.map((plan) => (
                <article className="pricing-card" key={plan.name}>
                  <h3>{plan.name}</h3>
                  <p>Coming soon</p>
                  <ul>
                    <li>{plan.description}</li>
                    <li>No subscription checkout or recurring charge</li>
                  </ul>
                </article>
              ))}
            </div>
          </section>

          <section aria-labelledby="seller-plans">
            <h2 id="seller-plans">For sellers</h2>
            <div className="pricing-cards">
              <article className="pricing-card">
                <h3>Free</h3>
                <p>₦0</p>
                <ul>
                  <li>
                    Up to {FREE_SELLER_BILL_OF_SALE_USES_PER_30_DAYS} bill of
                    sale actions per rolling 30 days when signed in and the
                    generator is enabled
                  </li>
                  <li>Respond to a buyer&apos;s Seller Proof request</li>
                  <li>Shop page coming soon; no listings are available</li>
                </ul>
                <Link className="app-check-link" href="/register">
                  Create free account
                </Link>
              </article>
              {paidPlans.map((plan) => (
                <article className="pricing-card" key={plan.name}>
                  <h3>{plan.name}</h3>
                  <p>Coming soon</p>
                  <ul>
                    <li>{plan.description}</li>
                    <li>No subscription checkout or recurring charge</li>
                  </ul>
                </article>
              ))}
            </div>
          </section>
        </div>
        <p className="privacy-note">
          Phone is optional and is not verified in this phase. Public device
          results continue to use the existing user-reported wording and
          disclaimer.
        </p>
      </section>
    </main>
  );
}
