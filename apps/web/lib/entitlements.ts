export const FREE_BUYER_FULL_REPORTS_PER_30_DAYS = 1;
export const FREE_SELLER_BILL_OF_SALE_USES_PER_30_DAYS = 2;
export const ACCOUNT_USAGE_WINDOW_DAYS = 30;

export const PLANS = ["free", "premium", "pro"] as const;
export type Plan = (typeof PLANS)[number];

export const ROLES = ["buyer", "seller"] as const;
export type Role = (typeof ROLES)[number];
