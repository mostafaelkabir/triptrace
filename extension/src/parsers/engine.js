import { parsers } from "./index.js";
import { normalizeDate } from "../utils/dateNormalize.js";
import { iataToCountry } from "../utils/iataToCountry.js";

// Broad date sweep patterns tried in order when parser-specific regex fails.
// Each entry: [regex-with-capture-group, date-fns-format]
const GENERIC_DATE_SWEEPS = [
  // "Wednesday April 03 2024" — weekday prefix, no commas; capture group skips the weekday
  [/\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\s+((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}\s+\d{4})\b/i, "MMMM d yyyy"],
  // "April 03 2024" — month + day + year, no comma or ordinal
  [/\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}\s+\d{4})\b/i, "MMM d yyyy"],
  [/\b(\d{1,2}[.\-\/]\d{1,2}[.\-\/]\d{4})\b/, "dd.MM.yyyy"],        // 15.06.2024 or 15-06-2024
  [/\b(\d{4}[.\-\/]\d{1,2}[.\-\/]\d{1,2})\b/, "yyyy-MM-dd"],        // 2024-06-15
  [/\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})\b/i, "d MMM yyyy"],
  [/\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})\b/i, "MMMM d, yyyy"],
  [/\b((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})\b/i, "MMMM d, yyyy"],
];

/**
 * Sweep emailText for any recognizable date string when parser-specific formats fail.
 * @returns {string|null} ISO date or null
 */
function genericDateSweep(text) {
  for (const [re, fmt] of GENERIC_DATE_SWEEPS) {
    const m = text.match(re);
    if (m) {
      // Normalize ordinals: "15th" → "15"
      const cleaned = m[1].replace(/(\d+)(?:st|nd|rd|th)/i, "$1");
      const result = normalizeDate(cleaned, fmt);
      if (result) return result;
    }
  }
  return null;
}

/**
 * Find a parser whose senderDomains match the From header.
 * @param {string} fromHeader - e.g. "noreply@thy.com" or "Name <booking@thy.com>"
 * @returns {object|null}
 */
export function findParser(fromHeader) {
  if (!fromHeader) return null;
  const lower = fromHeader.toLowerCase();
  return (
    parsers.find((p) =>
      p.senderDomains.some((domain) => lower.includes(domain.toLowerCase()))
    ) ?? null
  );
}

/**
 * Run a single regex extractor against text.
 * @returns {string|null} First capture group or null.
 */
function extract(text, regex) {
  if (!regex) return null;
  const m = text.match(regex);
  return m ? (m[1] ?? m[0]).trim() : null;
}

/**
 * Extract the first pair of IATA codes from pipe-separated table rows.
 * Handles layouts like: "TK 1 | Istanbul (IST) | New York (JFK) | 14 Mar 2024"
 * Returns { originIATA, destinationIATA } or null if no pair found.
 */
function extractIataFromPipeRows(text) {
  const pipeLines = text.split('\n').filter((l) => l.includes('|'));
  for (const line of pipeLines) {
    const codes = [...line.matchAll(/\(([A-Z]{3})\)/g)].map((m) => m[1]);
    if (codes.length >= 2) return { originIATA: codes[0], destinationIATA: codes[1] };
  }
  return null;
}

/**
 * Extract IATA codes from "City CODE to City CODE" or "City (CODE) to City (CODE)" patterns.
 * Handles garbled text where codes appear bare: "Chicago ORD to London LHR"
 * Returns { originIATA, destinationIATA } or null.
 */
function extractIataFromRouteText(text) {
  // Match "WORD CODE to WORD CODE" or "WORD (CODE) to WORD (CODE)"
  const routeRe = /\b([A-Z]{3})\s+(?:to|→|-)\s+[A-Za-z ]+?([A-Z]{3})\b/;
  const m = text.match(routeRe);
  if (m) return { originIATA: m[1], destinationIATA: m[2] };
  return null;
}

/**
 * Apply all extractors in a parser to email text → raw field values.
 */
function parseEmail(emailText, parser) {
  const raw = {};
  for (const [field, regex] of Object.entries(parser.extractors)) {
    raw[field] = extract(emailText, regex);
  }
  return raw;
}

/**
 * Full pipeline: find parser → extract fields → normalise → return TripRecord.
 * Always returns an object; confidence is "unmatched" when no parser found.
 *
 * @param {string} emailText
 * @param {string} fromHeader
 * @param {string} subjectHeader
 * @returns {TripRecord}
 */
export function runPipeline(emailText, fromHeader, subjectHeader) {
  const parser = findParser(fromHeader);

  if (!parser) {
    return {
      departure_date: null,
      return_date: null,
      trip_type: null,
      origin_country: null,
      destination_country: null,
      airline: null,
      flight_number: null,
      aircraft_type: null,
      confirmation_number: null,
      confidence: "unmatched",
      _missingFields: ["departure_date", "destination_country", "return_date"],
    };
  }

  const raw = parseEmail(emailText, parser);

  // Fallback 1: extract IATA codes from pipe-table rows when parser regex missed them.
  // Handles: "TK 1 | New York (JFK) | Istanbul (IST) | 14 Mar 2024"
  if (!raw.destinationIATA) {
    const pipeIata = extractIataFromPipeRows(emailText);
    if (pipeIata) {
      raw.destinationIATA = pipeIata.destinationIATA;
      if (!raw.originIATA) raw.originIATA = pipeIata.originIATA;
    }
  }

  // Fallback 2: bare-code route text "Chicago ORD to London LHR" (no parentheses)
  if (!raw.destinationIATA) {
    const routeIata = extractIataFromRouteText(emailText);
    if (routeIata) {
      raw.destinationIATA = routeIata.destinationIATA;
      if (!raw.originIATA) raw.originIATA = routeIata.originIATA;
    }
  }

  const formats = [parser.dateFormat, ...(parser.alternateDateFormats ?? [])];

  function tryNormalize(str) {
    if (!str) return null;
    for (const fmt of formats) {
      const result = normalizeDate(str, fmt);
      if (result) return result;
    }
    return null;
  }

  const departureDate = tryNormalize(raw.departureDate) ?? genericDateSweep(emailText);
  const returnDate = tryNormalize(raw.returnDate);

  const destinationCountry = raw.destinationIATA
    ? iataToCountry(raw.destinationIATA)
    : null;
  const originCountry = raw.originIATA
    ? iataToCountry(raw.originIATA)
    : "United States"; // safe default for US-based users

  // Detect trip type from email text signals
  const hasReturnSignal = /\b(?:return\s+flight|return\s+(?:depart|trip)|round.?trip|inbound|return\s+journey)\b/i.test(emailText);
  const hasOneWaySignal = /\b(?:one.?way|one\s+way)\b/i.test(emailText);
  const tripType = hasOneWaySignal ? "one-way" : (returnDate || hasReturnSignal) ? "round-trip" : null;

  const confidence =
    departureDate && destinationCountry ? "high" : "low";

  const _missingFields = [];
  if (!departureDate) _missingFields.push("departure_date");
  if (!destinationCountry) _missingFields.push("destination_country");
  if (!returnDate) _missingFields.push("return_date");

  const flightNumber = raw.flightNumber
    ? raw.flightNumber.replace(/([A-Z]{2})\s?(\d+)/, '$1 $2').trim()
    : null;

  return {
    departure_date: departureDate,
    return_date: returnDate,
    trip_type: tripType,
    origin_country: originCountry,
    destination_country: destinationCountry,
    airline: parser.name,
    flight_number: flightNumber,
    aircraft_type: raw.aircraftType?.trim() ?? null,
    confirmation_number: raw.confirmationNumber ?? null,
    passenger_name: raw.passengerName ?? null,
    confidence,
    _missingFields,
  };
}
