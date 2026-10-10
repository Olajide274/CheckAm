import { saveWaitlistSignup } from "@/lib/database";

const allowedFeatures = new Set([
  "Model match",
  "Registry status",
  "Seller proof",
  "Bill of sale",
  "WhatsApp check",
  "Condition snapshot",
]);

function isValidPhone(phone: string): boolean {
  return /^[+\d()\-\s]{7,25}$/.test(phone) && /\d/.test(phone);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return Response.json({ error: "Invalid signup details." }, { status: 400 });
  }

  const email = "email" in body ? body.email : undefined;
  const phone = "phone" in body ? body.phone : undefined;
  const feature = "feature" in body ? body.feature : undefined;
  if (
    typeof email !== "string" ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
    (phone !== undefined &&
      phone !== null &&
      (typeof phone !== "string" ||
        (phone.trim() !== "" && !isValidPhone(phone.trim())))) ||
    typeof feature !== "string" ||
    !allowedFeatures.has(feature)
  ) {
    return Response.json({ error: "Invalid signup details." }, { status: 400 });
  }

  try {
    await saveWaitlistSignup({
      email: email.trim().toLowerCase(),
      phone: typeof phone === "string" && phone.trim() ? phone.trim() : null,
      feature,
    });
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("Unable to save waitlist signup.", error);
    return Response.json({ error: "Unable to save signup." }, { status: 500 });
  }
}
