import { parse, format, isValid } from "date-fns";

/**
 * Normalize a date string of a known format to ISO 8601 (YYYY-MM-DD).
 * @param {string|null} str - The raw date string from an email.
 * @param {string} fmt - A date-fns format token matching the input string.
 * @returns {string|null} ISO date string or null if unparseable.
 */
export function normalizeDate(str, fmt) {
  if (!str || typeof str !== "string") return null;
  const trimmed = str.trim();
  if (!trimmed) return null;

  try {
    const parsed = parse(trimmed, fmt, new Date(2000, 0, 1));
    if (!isValid(parsed)) return null;
    return format(parsed, "yyyy-MM-dd");
  } catch {
    return null;
  }
}
