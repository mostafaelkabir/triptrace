import { getEmailClient } from "./emailClients/index.js";
import { parseEmlFiles } from "./emailClients/emlParser.js";
import { findParser, runPipeline } from "./parsers/engine.js";
import { subjectIsHardReject } from "./emailClients/gmail.js";

const BATCH_SIZE = 10;

function _buildSnippet(body) {
  if (!body) return "";
  return body.trim().slice(0, 300);
}

/**
 * Count non-null meaningful fields in a trip record.
 */
function fieldCount(trip) {
  return ["departure_date", "return_date", "origin_country", "destination_country",
    "airline", "confirmation_number", "passenger_name"].filter((k) => trip[k] != null).length;
}

/**
 * Merge two trip records, preferring non-null fields from the more-complete one.
 */
function mergeTrips(a, b) {
  const base = fieldCount(a) >= fieldCount(b) ? { ...a } : { ...b };
  const other = fieldCount(a) >= fieldCount(b) ? b : a;
  for (const key of Object.keys(other)) {
    if (base[key] == null && other[key] != null) base[key] = other[key];
  }
  return base;
}

/**
 * Group trips by threadId and merge each group into the most complete record.
 * Trips with no threadId are kept as-is.
 * @param {TripRecord[]} trips
 * @returns {TripRecord[]}
 */
export function mergeByThread(trips) {
  const byThread = new Map();
  const noThread = [];

  for (const trip of trips) {
    if (!trip._threadId) { noThread.push(trip); continue; }
    if (!byThread.has(trip._threadId)) { byThread.set(trip._threadId, trip); continue; }
    byThread.set(trip._threadId, mergeTrips(byThread.get(trip._threadId), trip));
  }

  return [...byThread.values(), ...noThread];
}

/**
 * Merge trips that share (departure_date + destination_country) — same flight, different emails.
 * Only merges when both fields are non-null.
 * @param {TripRecord[]} trips
 * @returns {TripRecord[]}
 */
export function mergeByFields(trips) {
  const result = [];
  for (const trip of trips) {
    if (!trip.departure_date || !trip.destination_country) { result.push(trip); continue; }
    const key = `${trip.departure_date}|${trip.destination_country}`;
    const existing = result.find(
      (t) => t.departure_date === trip.departure_date && t.destination_country === trip.destination_country
    );
    if (existing) {
      Object.assign(existing, mergeTrips(existing, trip));
    } else {
      result.push(trip);
    }
  }
  return result;
}

/**
 * Remove trips with identical confirmation numbers (keep most complete).
 * Trips with null confirmation numbers are kept as-is.
 * @param {TripRecord[]} trips
 * @returns {TripRecord[]}
 */
export function deduplicateTrips(trips) {
  const byConfirmation = new Map();
  const noConfirmation = [];

  for (const trip of trips) {
    if (!trip.confirmation_number) { noConfirmation.push(trip); continue; }
    if (!byConfirmation.has(trip.confirmation_number)) {
      byConfirmation.set(trip.confirmation_number, trip);
    } else {
      byConfirmation.set(trip.confirmation_number, mergeTrips(byConfirmation.get(trip.confirmation_number), trip));
    }
  }

  return [...byConfirmation.values(), ...noConfirmation];
}

/**
 * Scan a Gmail account for flight confirmation emails and extract trip records.
 *
 * @param {string} accessToken  - OAuth access token (Gmail or Outlook)
 * @param {{ startDate: string, endDate: string, paywallLimit: number|null, provider?: string }} options
 * @param {(progress: {scanned: number, total: number, found: number}) => void} [onProgress]
 * @returns {Promise<TripRecord[]>}
 */
export async function scanGmail(accessToken, options, onProgress) {
  const { startDate, endDate, paywallLimit, provider = "gmail" } = options;
  const { buildSearchQuery, searchEmails, getEmailHeaders, getEmailBody, looksLikeConfirmation } = getEmailClient(provider);

  const query = buildSearchQuery(startDate, endDate);
  const messageRefs = await searchEmails(accessToken, query, 2000);
  const total = messageRefs.length;

  const trips = [];
  let scanned = 0;

  // Process in batches to avoid overwhelming the API
  for (let i = 0; i < total; i += BATCH_SIZE) {
    if (paywallLimit && trips.length >= paywallLimit) break;

    const batch = messageRefs.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async ({ id, threadId }) => {
        try {
          const headers = await getEmailHeaders(accessToken, id);

          // Skip body fetch entirely for obvious non-bookings identified by subject alone
          if (subjectIsHardReject(headers.subject)) return;

          const parser = findParser(headers.from);
          const isKnownSender = parser != null;

          const body = await getEmailBody(accessToken, id);
          if (!looksLikeConfirmation(body, isKnownSender)) return;

          let trip = null;
          if (parser) {
            trip = { ...runPipeline(body, headers.from, headers.subject), _emailId: id, _threadId: threadId, _from: headers.from, _subject: headers.subject, _snippet: _buildSnippet(body) };
          } else {
            trip = {
              departure_date: null, return_date: null,
              origin_country: null, destination_country: null,
              airline: null, confirmation_number: null,
              confidence: "unmatched",
              _emailId: id, _threadId: threadId, _from: headers.from, _subject: headers.subject, _snippet: _buildSnippet(body),
            };
          }

          trips.push(trip);
        } catch (err) {
          console.warn(`Skipping message ${id}:`, err.message);
        } finally {
          scanned++;
          if (onProgress) onProgress({ scanned, total, found: trips.length });
        }
      })
    );
  }

  // Merge: thread-based first, then confirmation-number dedup, then field-based fallback
  const merged = mergeByFields(deduplicateTrips(mergeByThread(trips)));
  return paywallLimit ? merged.slice(0, paywallLimit) : merged;
}

/**
 * Parse an array of .eml File objects into TripRecords using the same pipeline.
 *
 * @param {File[]} files
 * @param {(progress: {scanned, total, found}) => void} [onProgress]
 * @returns {Promise<TripRecord[]>}
 */
export async function scanEmlFiles(files, onProgress) {
  const candidates = await parseEmlFiles(files, onProgress);

  const trips = candidates.map(({ from, subject, body, _fileName }) => {
    const parser = findParser(from);
    if (parser) {
      return {
        ...runPipeline(body, from, subject),
        _from: from, _subject: subject, _fileName, _snippet: _buildSnippet(body),
      };
    }
    return {
      departure_date: null, return_date: null, trip_type: null,
      origin_country: null, destination_country: null,
      airline: null, confirmation_number: null,
      confidence: "unmatched",
      _missingFields: ["departure_date", "destination_country", "return_date"],
      _from: from, _subject: subject, _fileName, _snippet: _buildSnippet(body),
    };
  });

  return mergeByFields(deduplicateTrips(trips));
}
