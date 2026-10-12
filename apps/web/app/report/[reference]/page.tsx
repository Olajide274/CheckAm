import type { Metadata } from "next";
import { redirect } from "next/navigation";
import ReportPageContent from "@/components/report-page";
import { getPaymentByReference, getSellerProofStatus } from "@/lib/database";
import { arePaymentsEnabled, isSellerProofEnabled } from "@/lib/features";
import { modelLookup } from "@/lib/model-lookup";

const referencePattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const instant = false;

export async function headers() {
  return { "Cache-Control": "no-store" };
}

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
  title: "CheckAm report",
};

export default async function ReportPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;

  if (!arePaymentsEnabled() || !referencePattern.test(reference)) {
    redirect("/");
  }

  const payment = await getPaymentByReference(reference);
  if (!payment || payment.status !== "success") {
    redirect("/");
  }

  const [model, sellerProof] = await Promise.all([
    modelLookup.lookup(payment.tac ?? ""),
    isSellerProofEnabled()
      ? getSellerProofStatus(payment.reference)
      : Promise.resolve({
          requested: false,
          respondedAt: null,
          proofId: null,
          proofMime: null,
          sellerPhone: null,
        }),
  ]);

  return (
    <ReportPageContent
      model={model}
      payment={payment}
      sellerProof={sellerProof}
    />
  );
}
