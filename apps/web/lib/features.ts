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
