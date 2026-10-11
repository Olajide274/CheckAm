import type { NextConfig } from "next";
import { resolveBillOfSaleFlag } from "./lib/features";

const nextConfig: NextConfig = {
  env: {
    FEATURE_BILL_OF_SALE: resolveBillOfSaleFlag(
      process.env.FEATURE_BILL_OF_SALE,
    ),
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
