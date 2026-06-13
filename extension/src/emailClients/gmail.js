const BASE = "https://www.googleapis.com/gmail/v1/users/me/messages";

function authHeaders(token) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function gmailFetch(token, url) {
  const res = await fetch(url, { headers: authHeaders(token) });
  if (res.status === 401) {
    // Token is expired/revoked — ask the background to refresh it
    const refreshed = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "REFRESH_AUTH_TOKEN" }, resolve);
    });
    if (refreshed?.token) {
      // Retry once with the new token
      const res2 = await fetch(url, { headers: authHeaders(refreshed.token) });
      if (!res2.ok) {
        const err = await res2.json().catch(() => ({}));
        throw new Error(err?.error?.message ?? `Gmail API error ${res2.status}`);
      }
      return res2.json();
    }
    throw new Error("401 auth");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `Gmail API error ${res.status}`);
  }
  return res.json();
}

/**
 * Build a Gmail search query covering flight confirmation subjects within a date range.
 * @param {string} startDate - ISO date "YYYY-MM-DD"
 * @param {string} endDate   - ISO date "YYYY-MM-DD"
 */
// Known airline and OTA sender domains
const AIRLINE_DOMAINS = [
  "thy.com",
  "turkishairlines.com",
  "lufthansa.com",
  "united.com",
  "delta.com",
  "aa.com",
  "emirates.com",
  "airfrance.com",
  "britishairways.com",
  "expedia.com",
  "expediamail.com",
  "kayak.com",
  "booking.com",
  "priceline.com",
  "hotels.com",
  "flightnetwork.com",
  "kiwi.com",
  "cheapoair.com",
  "orbitz.com",
  "qatarairways.com",
  "southwest.com",
  "luv.southwest.com",
  "jetblue.com",
  "email.jetblue.com",
  "alaskaair.com",
  "alaskaairlines.com",
  "etihad.com",
  "singaporeair.com",
];

export function buildSearchQuery(startDate, endDate) {
  const after = startDate.replace(/-/g, "/");
  const before = endDate.replace(/-/g, "/");

  // Gmail requires one from: clause per domain — from:(a OR b) doesn't work reliably.
  // No subject filter here: looksLikeConfirmation() in the body is the real gate.
  const domainFilter = AIRLINE_DOMAINS.map((d) => `from:${d}`).join(" OR ");
  return `(${domainFilter}) after:${after} before:${before}`;
}

/**
 * Returns true if the email body looks like a FLIGHT booking confirmation.
 * Rejects: promotions, hotel-only, car-only, newsletters.
 * @param {string} text - stripped email body
 * @param {boolean} [isKnownSender=false] - true when from a matched airline/OTA domain
 */
const _SUBJECT_HARD_REJECTS = [
  /\bprice\s*(alert|drop|watch)\b/i,
  /\bfare\s*alert\b/i,
  /\bflight\s*credit\b/i,
  /\btravel\s*credit\b/i,
  /\bmiles?\s*(earned|credited|statement)\b/i,
  /\bpoints?\s*(earned|credited)\b/i,
  /\bgate\s*change\b/i,
  /\bflight\s*(status|delay)\b/i,
  /\bdelay\s*notification\b/i,
  /\bboarding\s*pass\b/i,
  /\bcheck.?in\s*(open|reminder)\b/i,
  /\bbaggage\s*fee\b/i,
];

/**
 * Returns true when the email subject alone identifies it as a non-booking.
 * Callers should skip body fetch and body processing when this returns true.
 */
export function subjectIsHardReject(subject) {
  if (!subject) return false;
  return _SUBJECT_HARD_REJECTS.some((re) => re.test(subject));
}

export function looksLikeConfirmation(text, isKnownSender = false) {
  if (!text) return false;

  // Hard reject: no year means no dated booking
  if (!/20[2-9]\d|201[5-9]/.test(text)) return false;

  // ── Hard rejects — these patterns definitively identify non-bookings ──────
  // Flight credits / refund vouchers (not an actual booking)
  if (/\b(?:flight\s+credit|travel\s+credit|future\s+travel\s+credit|trip\s+credit|airline\s+credit|e-?credit|voucher\s+code|refund\s+credit)\b/i.test(text)) return false;

  // Price alerts / fare alerts / deal emails from Google Flights, CheapOair, Kayak, Skyscanner etc.
  if (/\b(?:price\s+(?:alert|drop|watch)|fare\s+alert|flight\s+deal|cheap(?:est)?\s+flight|prices?\s+(?:have\s+)?(?:dropped|changed|found)|set\s+(?:a\s+)?price\s+alert|track\s+(?:this\s+)?flight)\b/i.test(text)) return false;

  // Loyalty / miles / points statements (post-flight receipts, not bookings)
  if (/\b(?:miles?\s+(?:earned|credited|deposited)|points?\s+(?:earned|credited|added)|your\s+(?:miles|points)\s+(?:balance|statement)|frequent\s+flyer\s+statement)\b/i.test(text)) return false;

  // Hotel-only: has hotel check-in/out keywords AND no flight-specific language
  const hasFlightLanguage = /\b(?:flight|depart(?:ure|s|ing)?|arrival|arrives?|gate|boarding|e-?ticket|aircraft|airfare)\b/i.test(text);
  if (!hasFlightLanguage) {
    if (/\b(?:check-?in|check-?out|room\s+type|room\s+rate|nights?\s+stay|hotel\s+(?:confirmation|booking|reservation)|resort|property)\b/i.test(text)) return false;
    if (/\b(?:pick-?up\s+location|drop-?off|car\s+class|vehicle\s+class|rental\s+car|car\s+rental)\b/i.test(text)) return false;
  }

  // ── Flight signal scoring ─────────────────────────────────────────────────
  let score = 0;

  // Strong signals (each worth 2): unambiguously a booked flight
  // Actual flight number: 2-letter IATA code + 1-4 digits (TK 1, AA 123, LH 400)
  if (/\b[A-Z]{2}\s?\d{1,4}\b/.test(text)) score += 2;
  // IATA airport code in parentheses — format used in confirmations: (JFK), (IST)
  if (/\([A-Z]{3}\)/.test(text)) score += 2;
  // PNR / booking reference with actual code value (e.g. "PNR: ABCDEF")
  if (/(?:pnr|booking\s*(?:ref(?:erence)?|code|number)|confirmation\s*(?:code|number|#)|record\s+locator)\s*[:\s#]+\s*[A-Z0-9]{5,10}/i.test(text)) score += 2;
  // E-ticket number (13-digit number used by IATA)
  if (/\b(?:e-?ticket|ticket\s+number)\s*[:\s#]*\d{10,13}\b/i.test(text)) score += 2;

  // Moderate signals (each worth 1)
  if (/\b(?:airline|airways|itinerary|outbound|inbound|boarding\s+pass)\b/i.test(text)) score++;
  if (/\b(?:depart(?:ure|s|ing)?|arrival|arrives?|gate\s+\w|boarding)\b/i.test(text)) score++;
  if (/\b(?:istanbul|heathrow|gatwick|frankfurt|dubai|changi|schiphol|charles\s+de\s+gaulle|o'hare|john\s+f\s+kennedy|lax\s+airport)\b/i.test(text)) score++;

  // Promotional penalty
  if (/\b(?:unsubscribe|% off|deal of the|special offer|limited time|promo(?:tion)?)\b/i.test(text)) score--;

  // Known sender needs score ≥ 2; unknown sender needs score ≥ 4
  const threshold = isKnownSender ? 2 : 4;
  return score >= threshold;
}

/**
 * Strip HTML tags from a string. Safe to use in a service worker (no DOMParser).
 * Preserves newlines around block elements so dates/airports stay on separate lines.
 * @param {string|null} html
 * @returns {string}
 */
/**
 * Convert HTML table rows to pipe-separated text lines before stripping HTML.
 * Preserves column relationships that plain tag-stripping destroys.
 * e.g. <tr><td>TK 1</td><td>IST</td><td>14 Mar 2024</td></tr>
 *   → "TK 1 | IST | 14 Mar 2024\n"
 * Non-table HTML is returned unchanged.
 */
export function preserveTableRows(html) {
  if (!html) return html;
  return html.replace(/<tr[^>]*>([\s\S]*?)<\/tr>/gi, (_, inner) => {
    const cells = [];
    inner.replace(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi, (__, cell) => {
      const text = cell.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (text) cells.push(text);
    });
    return cells.length ? cells.join(" | ") + "\n" : "";
  });
}

export function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    // Remove image tags entirely (they produce no useful text)
    .replace(/<img[^>]*>/gi, "")
    // Insert newlines around block-level elements to preserve structure
    .replace(/<\/?(tr|div|p|br|li|td|th|h[1-6]|table|section|article)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    // Decode HTML entities
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&zwnj;/g, "")      // zero-width non-joiner (common in marketing emails)
    .replace(/&zwj;/g, "")       // zero-width joiner
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    // Strip raw URLs — they add noise without any useful booking info
    .replace(/https?:\/\/\S+/g, "")
    // Remove leftover email addresses and tracking artifacts
    .replace(/\S+@\S+\.\S+/g, "")
    // Collapse whitespace
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Decode base64url-encoded string (Gmail API format).
 */
function decodeBase64Url(encoded) {
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  return atob(base64);
}

/**
 * Recursively collect all plain-text or HTML parts from a MIME payload.
 * Returns { plain: string[], html: string[] } with all non-empty parts.
 */
function collectParts(payload, acc = { plain: [], html: [] }) {
  if (!payload) return acc;

  if (payload.mimeType === "text/plain" && payload.body?.data) {
    const text = decodeBase64Url(payload.body.data).trim();
    if (text) acc.plain.push(text);
  } else if (payload.mimeType === "text/html" && payload.body?.data) {
    const text = stripHtml(preserveTableRows(decodeBase64Url(payload.body.data))).trim();
    if (text) acc.html.push(text);
  }

  if (payload.parts?.length) {
    for (const part of payload.parts) {
      collectParts(part, acc);
    }
  }

  // Top-level body fallback (non-multipart messages)
  if (!payload.mimeType?.startsWith("multipart") && payload.body?.data &&
      payload.mimeType !== "text/plain" && payload.mimeType !== "text/html") {
    const text = stripHtml(preserveTableRows(decodeBase64Url(payload.body.data))).trim();
    if (text) acc.html.push(text);
  }

  return acc;
}

/**
 * Extract the most useful text from a Gmail message payload.
 * Prefers plain text; falls back to HTML-stripped text.
 * Always returns a string (never null).
 */
function extractBodyFromPart(payload) {
  const { plain, html } = collectParts(payload);
  if (plain.length) return plain.join("\n\n");
  if (html.length) return html.join("\n\n");
  // Last resort: top-level body data
  if (payload?.body?.data) return stripHtml(preserveTableRows(decodeBase64Url(payload.body.data)));
  return "";
}

/**
 * Search Gmail for messages matching query.
 * @returns {Array<{id: string, threadId: string}>}
 */
export async function searchEmails(accessToken, query, maxResults = 2000) {
  const PAGE_SIZE = 500; // Gmail API max per page
  const results = [];
  let pageToken = null;

  while (results.length < maxResults) {
    const params = new URLSearchParams({
      q: query,
      maxResults: String(Math.min(PAGE_SIZE, maxResults - results.length)),
    });
    if (pageToken) params.set("pageToken", pageToken);

    const data = await gmailFetch(accessToken, `${BASE}?${params}`);
    const messages = data.messages ?? [];
    results.push(...messages);

    if (!data.nextPageToken || messages.length === 0) break;
    pageToken = data.nextPageToken;
  }

  return results;
}

/**
 * Fetch only the headers (From, Subject, Date) for a message.
 * @returns {{ from: string, subject: string, date: string }}
 */
export async function getEmailHeaders(accessToken, messageId) {
  const data = await gmailFetch(
    accessToken,
    `${BASE}/${messageId}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`
  );
  const headers = data.payload?.headers ?? [];
  const get = (name) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
  return { from: get("From"), subject: get("Subject"), date: get("Date") };
}

/**
 * Fetch and decode the full body of an email as plain text.
 * @returns {string}
 */
export async function getEmailBody(accessToken, messageId) {
  const data = await gmailFetch(accessToken, `${BASE}/${messageId}?format=full`);
  return extractBodyFromPart(data.payload) ?? "";
}
