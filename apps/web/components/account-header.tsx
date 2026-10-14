import { CheckAmLogo } from "@/components/checkam-logo";
import { AccountNavigation } from "@/components/account-navigation";

export function AccountHeader() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <CheckAmLogo />
        <AccountNavigation />
      </div>
    </header>
  );
}
