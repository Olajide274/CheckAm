import Link from "next/link";
import { CheckAmLogo } from "@/components/checkam-logo";
import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <main className="login-page">
      <header className="login-header">
        <CheckAmLogo />
      </header>
      <section aria-labelledby="login-title" className="login-card">
        <p className="login-eyebrow">YOUR CHECKAM ACCOUNT</p>
        <h1 id="login-title">Welcome back</h1>
        <p className="login-description">
          Sign in with your Nigerian phone number. We’ll send you a one-time
          code.
        </p>
        <LoginForm />
        <Link className="login-back" href="/">
          Back to CheckAm
        </Link>
      </section>
    </main>
  );
}
