import Link from "next/link";
import { AccountHeader } from "@/components/account-header";
import { AccountNotice } from "@/components/account-notice";
import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <main className="account-page">
      <AccountHeader />
      <section aria-labelledby="login-title" className="login-card">
        <p className="login-eyebrow">WELCOME BACK</p>
        <h1 id="login-title">Sign in</h1>
        <AccountNotice />
        <p className="login-description">
          Sign in to see your CheckAm dashboard.
        </p>
        <LoginForm mode="login" />
        <p className="account-switch">
          New to CheckAm? <Link href="/register">Create an account</Link>
        </p>
      </section>
    </main>
  );
}
