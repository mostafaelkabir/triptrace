import * as gmail from "./gmail.js";
import * as outlook from "./outlook.js";

/**
 * Return the email client module for the given provider.
 * Both clients expose the same interface:
 *   buildSearchQuery, searchEmails, getEmailHeaders, getEmailBody, looksLikeConfirmation
 */
export function getEmailClient(provider) {
  if (provider === "outlook") return outlook;
  return gmail;
}
