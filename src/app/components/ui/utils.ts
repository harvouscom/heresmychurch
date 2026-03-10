import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Normalize phone to digits-only (e.g. 5551234567). Strips non-digits; 11-digit US starting with 1 becomes 10 digits. Returns "" if invalid. */
export function normalizePhone(s: string): string {
  const digits = (s ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits[0] === "1") return digits.slice(1);
  if (digits.length < 10) return "";
  return digits;
}

/** Format 10-digit US phone for display, e.g. (555) 123-4567. Pass-through if not 10 digits. */
export function formatPhoneDisplay(phone: string): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length !== 10) return phone || "";
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}
