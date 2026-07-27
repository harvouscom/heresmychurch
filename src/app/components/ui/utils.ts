import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import type { CountryCode } from "libphonenumber-js";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Normalize phone to E.164 when possible; falls back to digits. */
export function normalizePhone(s: string, defaultCountry: string = "US"): string {
  const raw = (s ?? "").trim();
  if (!raw) return "";
  const parsed = parsePhoneNumberFromString(raw, defaultCountry.toUpperCase() as CountryCode);
  if (parsed?.isValid()) return parsed.format("E.164");
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits[0] === "1") return `+1${digits.slice(1)}`;
  if (digits.length === 10 && defaultCountry.toUpperCase() === "US") return `+1${digits}`;
  if (digits.length >= 10) return `+${digits}`;
  return "";
}

/** Format phone for display using the church's country when known. */
export function formatPhoneDisplay(phone: string, defaultCountry: string = "US"): string {
  const raw = (phone ?? "").trim();
  if (!raw) return "";
  const parsed = parsePhoneNumberFromString(raw, defaultCountry.toUpperCase() as CountryCode);
  if (parsed?.isValid()) {
    return parsed.country === "US" || parsed.country === "CA"
      ? parsed.formatNational()
      : parsed.formatInternational();
  }
  // Legacy 10-digit US storage
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return raw;
}
