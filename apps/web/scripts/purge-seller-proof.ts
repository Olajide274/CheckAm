import { purgeExpiredSellerProofAttachments } from "@/lib/database";

async function purgeSellerProofAttachments(): Promise<void> {
  const deleted = await purgeExpiredSellerProofAttachments();
  console.info(`Purged ${deleted} expired Seller Proof attachments.`);
}

purgeSellerProofAttachments().catch((error: unknown) => {
  console.error("Unable to purge expired Seller Proof attachments.", error);
  process.exitCode = 1;
});
