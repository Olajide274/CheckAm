import Link from "next/link";
import { CheckAmLogo } from "@/components/checkam-logo";

export function ComingSoonPage() {
  return (
    <main className="login-page">
      <header className="login-header">
        <CheckAmLogo />
      </header>
      <section aria-labelledby="coming-soon-title" className="login-card">
        <h1 id="coming-soon-title">Coming soon</h1>
        <p className="login-description">
          We&apos;re getting CheckAm ready. Please check back soon.
        </p>
        <Link className="login-back" href="/">
          Back to CheckAm home
        </Link>
      </section>
    </main>
  );
}
