export function resolveBillOfSaleFlag(
  featureFlag: string | undefined,
): string {
  return featureFlag === "true" ? "true" : "false";
}

export function isBillOfSaleEnabled(
  featureFlag = process.env.FEATURE_BILL_OF_SALE,
): boolean {
  return featureFlag === "true";
}

export function isSellerProofEnabled(
  featureFlag = process.env.FEATURE_SELLER_PROOF,
): boolean {
  return featureFlag === "true";
}

export function resolvePaymentsFlag(
  featureFlag: string | undefined,
  vercelEnvironment = process.env.VERCEL_ENV,
  appEnvironment = process.env.APP_ENV,
): string {
  const isProduction = vercelEnvironment
    ? vercelEnvironment === "production"
    : appEnvironment === "production";
  return featureFlag === "true" && !isProduction
    ? "true"
    : "false";
}

export function arePaymentsEnabled(
  featureFlag = process.env.FEATURE_PAYMENTS,
  vercelEnvironment = process.env.VERCEL_ENV,
  appEnvironment = process.env.APP_ENV,
): boolean {
  return resolvePaymentsFlag(
    featureFlag,
    vercelEnvironment,
    appEnvironment,
  ) === "true";
}
