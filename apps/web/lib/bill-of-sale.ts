import { isValidImei } from "@/lib/imei";

export type DeviceType = "Phone" | "Laptop" | "Tablet" | "Other";
export type IdentifierType = "IMEI" | "Serial number";

export type BillOfSaleData = {
  sellerName: string;
  sellerPhone: string;
  buyerName: string;
  buyerPhone: string;
  deviceType: DeviceType;
  brand: string;
  model: string;
  identifierType: IdentifierType;
  identifier: string;
  agreedPrice: string;
  date: string;
  conditionNotes: string;
};

export type BillOfSaleErrors = Partial<Record<keyof BillOfSaleData, string>>;

const deviceTypes: DeviceType[] = ["Phone", "Laptop", "Tablet", "Other"];
const identifierTypes: IdentifierType[] = ["IMEI", "Serial number"];

function isDeviceType(value: unknown): value is DeviceType {
  return typeof value === "string" && deviceTypes.includes(value as DeviceType);
}

function isIdentifierType(value: unknown): value is IdentifierType {
  return typeof value === "string" && identifierTypes.includes(value as IdentifierType);
}

function isBillOfSaleData(value: unknown): value is BillOfSaleData {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;

  return (
    typeof record.sellerName === "string" &&
    typeof record.sellerPhone === "string" &&
    typeof record.buyerName === "string" &&
    typeof record.buyerPhone === "string" &&
    isDeviceType(record.deviceType) &&
    typeof record.brand === "string" &&
    typeof record.model === "string" &&
    isIdentifierType(record.identifierType) &&
    typeof record.identifier === "string" &&
    typeof record.agreedPrice === "string" &&
    typeof record.date === "string" &&
    typeof record.conditionNotes === "string"
  );
}

export function validateBillOfSale(data: BillOfSaleData): BillOfSaleErrors {
  const errors: BillOfSaleErrors = {};

  if (!data.sellerName.trim()) errors.sellerName = "Enter the seller name.";
  if (!isValidPhoneNumber(data.sellerPhone)) {
    errors.sellerPhone = "Enter a valid seller phone number.";
  }
  if (!data.buyerName.trim()) errors.buyerName = "Enter the buyer name.";
  if (!isValidPhoneNumber(data.buyerPhone)) {
    errors.buyerPhone = "Enter a valid buyer phone number.";
  }
  if (!deviceTypes.includes(data.deviceType)) errors.deviceType = "Choose a device type.";
  if (!data.brand.trim()) errors.brand = "Enter the brand.";
  if (!data.model.trim()) errors.model = "Enter the model.";
  if (!identifierTypes.includes(data.identifierType)) {
    errors.identifierType = "Choose an identifier type.";
  } else if (
    data.identifierType === "IMEI"
      ? !isValidImei(data.identifier.trim())
      : !data.identifier.trim()
  ) {
    errors.identifier =
      data.identifierType === "IMEI"
        ? "Enter a valid 15-digit IMEI."
        : "Enter the device serial number.";
  }

  const price = Number(data.agreedPrice);
  if (
    !data.agreedPrice.trim() ||
    !Number.isFinite(price) ||
    price < 0 ||
    !/^\d+(\.\d{1,2})?$/.test(data.agreedPrice)
  ) {
    errors.agreedPrice = "Enter a valid price in naira.";
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
    errors.date = "Enter the agreement date.";
  } else {
    const parsedDate = new Date(`${data.date}T00:00:00Z`);
    if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== data.date) {
      errors.date = "Enter a valid agreement date.";
    }
  }

  return errors;
}

function isValidPhoneNumber(value: string): boolean {
  return /^\d{7,15}$/.test(value.replace(/[\s()+.-]/g, ""));
}

export function isValidBillOfSale(data: BillOfSaleData): boolean {
  return Object.keys(validateBillOfSale(data)).length === 0;
}

export function createBillOfSaleShareUrl(
  data: BillOfSaleData,
  origin: string,
): string {
  return `${origin.replace(/\/$/, "")}/bill-of-sale#data=${encodeURIComponent(JSON.stringify(data))}`;
}

export function readBillOfSaleShareHash(hash: string): BillOfSaleData | null {
  if (!hash.startsWith("#data=")) return null;

  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(hash.slice(6)));
    if (!isBillOfSaleData(parsed) || !isValidBillOfSale(parsed)) return null;

    return parsed;
  } catch {
    return null;
  }
}
