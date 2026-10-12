import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SellerProofForm from "@/components/seller-proof-form";
import { arePaymentsEnabled, isSellerProofEnabled } from "@/lib/features";
import { isSellerProofToken } from "@/lib/seller-proof";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
  title: "Seller proof request | CheckAm",
};

export default async function SellerProofPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (
    !arePaymentsEnabled() ||
    !isSellerProofEnabled() ||
    !isSellerProofToken(token)
  ) {
    notFound();
  }
  return <SellerProofForm token={token} />;
}
