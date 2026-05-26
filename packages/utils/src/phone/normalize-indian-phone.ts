export function normalizeIndianPhoneNumber(input: string): string {
  if (!input) {
    throw new Error("Phone number is required");
  }

  // remove spaces, hyphens, parentheses
  let cleaned = input.replace(/[\s\-()]/g, "");

  // remove leading zeros
  cleaned = cleaned.replace(/^0+/, "");

  // add + if missing
  if (cleaned.startsWith("91") && !cleaned.startsWith("+91")) {
    cleaned = `+${cleaned}`;
  }

  // add +91 if only 10-digit Indian number
  if (/^[6-9]\d{9}$/.test(cleaned)) {
    cleaned = `+91${cleaned}`;
  }

  // validate final format
  if (!/^\+91[6-9]\d{9}$/.test(cleaned)) {
    throw new Error("Invalid Indian phone number");
  }

  return cleaned;
}
