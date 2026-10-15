import Link from "next/link";
import { AccountHeader } from "@/components/account-header";
import { LoginForm } from "@/components/login-form";

export default function RegisterPage() {
  return (
    <main className="account-page">
      <AccountHeader />
      <section aria-labelledby="register-title" className="login-card">
        <p className="login-eyebrow">START WITH CHECKAM</p>
        <h1 id="register-title">Create your account</h1>
        <p className="login-description">
          Choose a buyer or seller account and make CheckAm yours.
        </p>
        <LoginForm mode="register" />
        <p className="account-switch">
          Already registered? <Link href="/login">Sign in</Link>
        </p>
      </section>
    </main>
  );
}
