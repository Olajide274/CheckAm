import Link from "next/link";
import { AccountHeader } from "@/components/account-header";
import {
  FREE_BUYER_FULL_REPORTS_PER_30_DAYS,
  FREE_SELLER_BILL_OF_SALE_USES_PER_30_DAYS,
} from "@/lib/entitlements";
import { isBillOfSaleEnabled } from "@/lib/features";

export default function PricingPage() {
  const billOfSaleEnabled = isBillOfSaleEnabled();
  const buyerPlans = [
    {
      name: "Free",
      price: "₦0",
      description: "A practical starting point for every buyer.",
      features: [
        "Unlimited IMEI format and Luhn checks",
        `${FREE_BUYER_FULL_REPORTS_PER_30_DAYS} full report checkout per rolling 30 days`,
        "One-time full report checkout is ₦500",
      ],
      cta: "Create free account",
      href: "/register",
    },
    {
      name: "Premium",
      price: "Coming soon",
      description: "More report access is planned.",
      features: ["Planned for regular buyers", "No subscription checkout yet"],
      cta: "Not available yet",
    },
    {
      name: "Pro",
      price: "Coming soon",
      description: "Higher-volume buyer access is planned.",
      features: ["Planned for frequent buyers", "No subscription checkout yet"],
      cta: "Not available yet",
    },
  ] as const;
  const sellerPlans = [
    {
      name: "Free",
      price: "₦0",
      description: "Tools to help with your next device sale.",
      features: [
        `${FREE_SELLER_BILL_OF_SALE_USES_PER_30_DAYS} bill of sale actions per rolling 30 days when enabled`,
        ...(!billOfSaleEnabled
          ? ["Bill of sale isn’t available on this deployment"]
          : []),
        "Respond to a buyer’s Seller Proof request",
        "Shop page coming soon; no listings are available",
      ],
      cta: "Create free account",
      href: "/register",
    },
    {
      name: "Premium",
      price: "Coming soon",
      description: "More seller usage is planned.",
      features: ["Planned for active sellers", "No subscription checkout yet"],
      cta: "Not available yet",
    },
    {
      name: "Pro",
      price: "Coming soon",
      description: "Higher-volume seller access is planned.",
      features: ["Planned for frequent sellers", "No subscription checkout yet"],
      cta: "Not available yet",
    },
  ] as const;

  return (
    <main className="account-page">
      <AccountHeader />
      <section className="pricing-content">
        <p className="login-eyebrow">PLANS</p>
        <h1>Choose how you use CheckAm</h1>
        <p className="login-description">
          Start free. Premium and Pro plans are presented for what’s planned;
          billing is not available yet.
        </p>

        <div className="pricing-roles">
          <section aria-labelledby="buyer-plans">
            <h2 id="buyer-plans">Buyer plans</h2>
            <div className="pricing-cards">
              {buyerPlans.map((plan) => (
                <article
                  className={`pricing-card${plan.name === "Free" ? " featured" : ""}`}
                  key={plan.name}
                >
                  <h3>{plan.name}</h3>
                  <p className="pricing-price">{plan.price}</p>
                  <p className="pricing-description">{plan.description}</p>
                  <ul>{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
                  {"href" in plan ? (
                    <Link className="app-check-link" href={plan.href}>
                      {plan.cta}
                    </Link>
                  ) : (
                    <button className="pricing-unavailable" disabled type="button">
                      {plan.cta}
                    </button>
                  )}
                </article>
              ))}
            </div>
          </section>

          <section aria-labelledby="seller-plans">
            <h2 id="seller-plans">Seller plans</h2>
            <div className="pricing-cards">
              {sellerPlans.map((plan) => (
                <article
                  className={`pricing-card${plan.name === "Free" ? " featured" : ""}`}
                  key={plan.name}
                >
                  <h3>{plan.name}</h3>
                  <p className="pricing-price">{plan.price}</p>
                  <p className="pricing-description">{plan.description}</p>
                  <ul>{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
                  {"href" in plan ? (
                    <Link className="app-check-link" href={plan.href}>
                      {plan.cta}
                    </Link>
                  ) : (
                    <button className="pricing-unavailable" disabled type="button">
                      {plan.cta}
                    </button>
                  )}
                </article>
              ))}
            </div>
          </section>
        </div>
        <p className="privacy-note">
          Free account limits are applied by CheckAm. Phone is optional. Public
          device results continue to use the existing user-reported wording and
          disclaimer.
        </p>
      </section>
    </main>
  );
}
