import type { ModelLookupResult } from "@/lib/model-lookup";

export type SellerDescriptionMatch =
  | "Matches the seller's description"
  | "Does not match the seller's description"
  | "Cannot tell";

function tokenize(value: string): Set<string> {
  return new Set(
    value
      .normalize("NFKD")
      .toLocaleLowerCase("en")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean),
  );
}

export function compareSellerDescription(
  description: string,
  result: ModelLookupResult,
): SellerDescriptionMatch {
  if (!description.trim() || result.status !== "found") {
    return "Cannot tell";
  }

  const claimedTokens = tokenize(description);
  const modelTokens = tokenize(`${result.brand} ${result.model}`);
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
