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
): string {
  return featureFlag === "true" ? "true" : "false";
}

export function arePaymentsEnabled(
  featureFlag = process.env.FEATURE_PAYMENTS,
): boolean {
  return resolvePaymentsFlag(featureFlag) === "true";
}
