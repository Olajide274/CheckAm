import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AccountHeader } from "@/components/account-header";
import { AccountSettingsForm } from "@/components/account-settings-form";
import { getAccountForToken } from "@/lib/accounts";
import { shouldShowEmailVerificationNotice } from "@/lib/features";

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <main className="account-page">
          <section className="login-card">
            <p className="login-hint">Loading your account…</p>
          </section>
        </main>
      }
    >
      <SettingsContent />
    </Suspense>
  );
}

async function SettingsContent() {
  const cookieStore = await cookies();
  const account = await getAccountForToken(
    cookieStore.get("checkam_account_session")?.value,
  );
  if (!account) redirect("/login?next=/settings");

  return (
    <main className="account-page">
      <AccountHeader />
      <section aria-labelledby="settings-title" className="login-card">
        <p className="login-eyebrow">YOUR ACCOUNT</p>
        <h1 id="settings-title">Account settings</h1>
        {shouldShowEmailVerificationNotice({
          emailVerified: account.emailVerified,
          appEnv: process.env.APP_ENV,
          emailProvider: process.env.EMAIL_PROVIDER,
        }) && (
          <p className="verification-notice" role="status">
            Your email isn’t verified yet. You can still use CheckAm.
          </p>
        )}
        <AccountSettingsForm account={account} />
      </section>
    </main>
  );
}
