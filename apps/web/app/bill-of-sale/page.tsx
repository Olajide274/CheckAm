import { notFound } from "next/navigation";
import BillOfSaleGenerator from "@/components/bill-of-sale-generator";
import { isBillOfSaleEnabled } from "@/lib/features";

export default function BillOfSalePage() {
  if (!isBillOfSaleEnabled()) notFound();

  return <BillOfSaleGenerator />;
}
