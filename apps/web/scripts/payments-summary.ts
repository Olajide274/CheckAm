import { getPaymentsSummary } from "../lib/database";

function formatNaira(amountKobo: string): string {
  if (!/^\d+$/.test(amountKobo)) {
    throw new Error("The successful payment total is not a valid amount.");
  }

  const naira = amountKobo.slice(0, -2) || "0";
  const kobo = amountKobo.slice(-2).padStart(2, "0");
  const groupedNaira = naira.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `₦${groupedNaira}.${kobo}`;
}

async function main(): Promise<void> {
  const summary = await getPaymentsSummary();

  console.log("Payments by status:");
  for (const item of summary.byStatus) {
    console.log(`  ${item.status}: ${item.count}`);
  }

  console.log("Payments by day:");
  for (const item of summary.byDay) {
    console.log(`  ${item.day}: ${item.count}`);
  }

  console.log(
    `Total successful amount in naira: ${formatNaira(summary.successfulAmountKobo)}`,
  );
}

main().catch((error: unknown) => {
  console.error(
    "Unable to generate payments summary.",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
