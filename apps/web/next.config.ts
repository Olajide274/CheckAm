import type { NextConfig } from "next";
import { resolveBillOfSaleFlag, resolvePaymentsFlag } from "./lib/features";

const nextConfig: NextConfig = {
  env: {
    FEATURE_BILL_OF_SALE: resolveBillOfSaleFlag(
      process.env.FEATURE_BILL_OF_SALE,
    ),
    FEATURE_PAYMENTS: resolvePaymentsFlag(process.env.FEATURE_PAYMENTS),
    FEATURE_SELLER_PROOF: process.env.FEATURE_SELLER_PROOF === "true"
      ? "true"
      : "false",
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
