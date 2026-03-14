import { parseAddressValue, formatFullAddress } from "./AddressInput";

/**
 * Format a moderation field value for display (current or proposed).
 * - address: JSON like {"address":"...","city":"...","state":"..."} → "123 Main St, City, IA"
 * - website, name, etc.: returned as-is
 */
export function formatModerationDisplayValue(field: string, value: string | null | undefined): string {
  if (value == null || value === "") return "";
  const trimmed = value.trim();
  if (field === "address" && trimmed.startsWith("{")) {
    try {
      const p = parseAddressValue(trimmed);
      return formatFullAddress(p.address, p.city, p.state);
    } catch {
      return value;
    }
  }
  return value;
}
