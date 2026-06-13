import { stripHtml, looksLikeConfirmation, preserveTableRows } from "./gmail.js";

const BASE = "https://graph.microsoft.com/v1.0/me/messages";

async function graphFetch(token, url, extraHeaders = {}) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = body?.error?.message ?? `Graph API error ${res.status}`;
    console.error("[Outlook] Graph error:", res.status, JSON.stringify(body));
    throw new Error(msg);
  }
  return res.json();
}

// Graph $search doesn't support complex KQL — kept for interface compatibility
// but searchEmails ignores it and uses its own keyword list.
export function buildSearchQuery(startDate, endDate) {
  return `${startDate}..${endDate}`;
}

/**
 * Search Outlook messages via Microsoft Graph.
 * Uses $filter (date range) + $search (keyword) in separate requests.
 *
 * IMPORTANT: Microsoft Graph does NOT allow combining $search with $orderby or $filter.
 * $search is used alone with ConsistencyLevel: eventual for keyword matching.
 * Date filtering is done client-side after results arrive.
 */
export async function searchEmails(accessToken, query, maxResults = 2000) {
  const [startDate, endDate] = query.split("..");

  // Broader keyword set to catch more airline/OTA confirmation emails
  const keywords = [
    "confirmation",
    "itinerary",
    "e-ticket",
    "booking",
    "flight",
    "reservation",
    "ticket",
  ];
  const PAGE_SIZE = 250;
  const seen = new Set();
  const results = [];
  const errors = [];

  for (const kw of keywords) {
    if (results.length >= maxResults) break;
    let nextLink = null;
    let pagesFetched = 0;
    const maxPages = 4; // 4 × 250 = 1000 per keyword (7 keywords × 1000 = 7000 candidates max)

    do {
      // NOTE: $search cannot be combined with $orderby or $filter — Graph returns 400 if you do.
      // Date filtering is applied client-side below.
      const url = nextLink ?? `${BASE}?${new URLSearchParams({
        $search: `"${kw}"`,
        $top: String(PAGE_SIZE),
        $select: "id,conversationId,receivedDateTime",
      })}`;

      try {
        const data = await graphFetch(accessToken, url, { ConsistencyLevel: "eventual" });
        for (const m of data.value ?? []) {
          if (seen.has(m.id)) continue;
          // Client-side date range filter
          if (startDate && endDate) {
            const received = m.receivedDateTime?.slice(0, 10) ?? "";
            if (received < startDate || received > endDate) continue;
          }
          seen.add(m.id);
          results.push({ id: m.id, threadId: m.conversationId });
          if (results.length >= maxResults) break;
        }
        nextLink = data["@odata.nextLink"] ?? null;
        pagesFetched++;
      } catch (err) {
        errors.push(`"${kw}" p${pagesFetched + 1}: ${err.message}`);
        console.warn(`[Outlook] Search "${kw}" page ${pagesFetched + 1} failed:`, err.message);
        break;
      }
    } while (nextLink && pagesFetched < maxPages && results.length < maxResults);
  }

  if (results.length === 0 && errors.length > 0) {
    console.error("[Outlook] All keyword searches failed:", errors.join("; "));
  }

  return results;
}

/**
 * Fetch subject, from address, and date for a single message.
 */
export async function getEmailHeaders(accessToken, messageId) {
  const params = new URLSearchParams({ $select: "subject,from,receivedDateTime" });
  const m = await graphFetch(accessToken, `${BASE}/${messageId}?${params}`);
  return {
    from: m.from?.emailAddress?.address ?? "",
    subject: m.subject ?? "",
    date: m.receivedDateTime ?? "",
  };
}

/**
 * Fetch the plain-text body of a message.
 * Requests text conversion via Prefer header; strips HTML if Graph returns HTML anyway.
 */
export async function getEmailBody(accessToken, messageId) {
  const params = new URLSearchParams({ $select: "body" });
  const m = await graphFetch(
    accessToken,
    `${BASE}/${messageId}?${params}`,
    { Prefer: 'outlook.body-content-type="text"' }
  );
  const content = m.body?.content ?? "";
  if (m.body?.contentType?.toLowerCase() === "html") {
    return stripHtml(preserveTableRows(content));
  }
  return content;
}

export { looksLikeConfirmation };
