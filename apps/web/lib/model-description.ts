import type { ModelLookupResult } from "@/lib/model-lookup";

export type SellerDescriptionMatch =
  | "Matches the seller's description"
  | "Does not match the seller's description"
  | "Brand matches; model cannot be checked"
  | "Cannot tell";

const recognisedBrands = new Map<string, string>([
  ["apple", "Apple"],
  ["iphone", "Apple"],
  ["samsung", "Samsung"],
  ["galaxy", "Samsung"],
  ["tecno", "Tecno"],
  ["techno", "Tecno"],
  ["infinix", "Infinix"],
  ["itel", "itel"],
  ["xiaomi", "Xiaomi"],
  ["redmi", "Xiaomi"],
  ["poco", "Xiaomi"],
  ["oppo", "Oppo"],
  ["vivo", "Vivo"],
  ["realme", "Realme"],
  ["huawei", "Huawei"],
  ["honor", "Honor"],
  ["nokia", "Nokia"],
  ["hmd", "HMD"],
  ["motorola", "Motorola"],
  ["oneplus", "OnePlus"],
  ["google", "Google"],
  ["pixel", "Google"],
  ["sony", "Sony"],
  ["lg", "LG"],
  ["lenovo", "Lenovo"],
  ["gionee", "Gionee"],
  ["blackberry", "BlackBerry"],
  ["zte", "ZTE"],
  ["alcatel", "Alcatel"],
  ["nothing", "Nothing"],
]);

function tokenize(value: string): string[] {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function findRecognisedBrands(description: string): Set<string> {
  const brands = new Set<string>();
  for (const token of tokenize(description)) {
    const brand = recognisedBrands.get(token);
    if (brand) brands.add(brand);
  }
  return brands;
}

function canonicalBrand(value: string): string | null {
  const tokens = tokenize(value);
  return tokens.length === 1 ? (recognisedBrands.get(tokens[0] ?? "") ?? null) : null;
}

export function compareSellerDescription(
  description: string,
  result: ModelLookupResult,
): SellerDescriptionMatch {
  if (!description.trim() || result.status === "not_found") {
    return "Cannot tell";
  }

  if (result.status === "brand_only") {
    const claimedBrands = findRecognisedBrands(description);
    if (!claimedBrands.size) return "Cannot tell";

    const expectedBrand = canonicalBrand(result.brand);
    return expectedBrand && claimedBrands.has(expectedBrand)
      ? "Brand matches; model cannot be checked"
      : "Does not match the seller's description";
  }

  const claimedTokens = new Set(tokenize(description));
  const modelTokens = new Set(tokenize(`${result.brand} ${result.model}`));
  if (modelTokens.size === 0) {
    return "Cannot tell";
  }

  const matchedTokens = [...modelTokens].filter((token) =>
    claimedTokens.has(token),
  );
  if (matchedTokens.length === modelTokens.size) {
    return "Matches the seller's description";
  }
  if (matchedTokens.length === 0) {
    return "Does not match the seller's description";
  }
  return "Cannot tell";
}
