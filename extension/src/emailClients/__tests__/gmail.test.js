import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildSearchQuery,
  stripHtml,
  looksLikeConfirmation,
  preserveTableRows,
  subjectIsHardReject,
  searchEmails,
  getEmailHeaders,
  getEmailBody,
} from "../gmail.js";

// ---- buildSearchQuery ----
describe("buildSearchQuery", () => {
  it("includes known sender domains", () => {
    const q = buildSearchQuery("2021-01-01", "2026-01-01");
    expect(q).toContain("thy.com");
    expect(q).toContain("expedia.com");
  });

  it("includes known airline sender domains with subject filter", () => {
    const q = buildSearchQuery("2021-01-01", "2026-01-01");
    expect(q).toContain("thy.com");
    expect(q).toContain("lufthansa.com");
    expect(q).toContain("expedia.com");
  });

  it("includes date range in Gmail format", () => {
    const q = buildSearchQuery("2021-03-15", "2026-03-15");
    expect(q).toContain("after:2021/03/15");
    expect(q).toContain("before:2026/03/15");
  });

  it("uses individual from: clauses for each domain", () => {
    const q = buildSearchQuery("2021-01-01", "2026-01-01");
    expect(q).toContain("from:thy.com");
    expect(q).toContain("from:expedia.com");
    expect(q).toContain("from:lufthansa.com");
  });
});

// ---- subjectIsHardReject ----
describe("subjectIsHardReject", () => {
  it("rejects price alert subjects", () => {
    expect(subjectIsHardReject("Price Alert: NYC to Istanbul")).toBe(true);
    expect(subjectIsHardReject("Fare alert - flights to London dropped")).toBe(true);
  });

  it("rejects flight credit / boarding pass / gate change subjects", () => {
    expect(subjectIsHardReject("Your Flight Credit: $234.50")).toBe(true);
    expect(subjectIsHardReject("Gate Change Notice - TK 1")).toBe(true);
    expect(subjectIsHardReject("Your boarding pass is ready")).toBe(true);
  });

  it("passes through booking confirmation subjects", () => {
    expect(subjectIsHardReject("Your Booking Confirmation - PNR ABCDEF")).toBe(false);
    expect(subjectIsHardReject("E-Ticket Itinerary and Receipt")).toBe(false);
  });

  it("returns false for null/empty subject", () => {
    expect(subjectIsHardReject(null)).toBe(false);
    expect(subjectIsHardReject("")).toBe(false);
  });
});

// ---- preserveTableRows ----
describe("preserveTableRows", () => {
  it("joins table cells with pipe separator on one line per row", () => {
    const html = `<table><tr><td>TK 1</td><td>Istanbul (IST)</td><td>New York (JFK)</td><td>14 Mar 2024</td></tr></table>`;
    const result = preserveTableRows(html);
    expect(result).toContain("TK 1 | Istanbul (IST) | New York (JFK) | 14 Mar 2024");
  });

  it("handles two rows as two separate lines", () => {
    const html = `<tr><td>TK 1</td><td>IST</td><td>JFK</td><td>14 Mar 2024</td></tr>
                  <tr><td>TK 2</td><td>JFK</td><td>IST</td><td>28 Mar 2024</td></tr>`;
    const result = preserveTableRows(html);
    const lines = result.split("\n").map((l) => l.trim()).filter(Boolean);
    expect(lines[0]).toContain("TK 1 | IST | JFK | 14 Mar 2024");
    expect(lines[1]).toContain("TK 2 | JFK | IST | 28 Mar 2024");
  });

  it("strips inner HTML tags within cells", () => {
    const html = `<tr><td><strong>LH 400</strong></td><td>FRA</td><td><em>Airbus A340</em></td></tr>`;
    const result = preserveTableRows(html);
    expect(result).toContain("LH 400 | FRA | Airbus A340");
    expect(result).not.toContain("<strong>");
    expect(result).not.toContain("<em>");
  });

  it("skips empty cells", () => {
    const html = `<tr><td>AA 100</td><td>  </td><td>JFK</td></tr>`;
    const result = preserveTableRows(html);
    expect(result).toContain("AA 100 | JFK");
    expect(result).not.toContain("AA 100 |  | JFK");
  });

  it("returns non-table HTML unchanged", () => {
    const html = "<p>Hello world</p>";
    expect(preserveTableRows(html)).toBe(html);
  });

  it("handles th (header cells) as well as td", () => {
    const html = `<tr><th>Flight</th><th>From</th><th>To</th></tr>`;
    const result = preserveTableRows(html);
    expect(result).toContain("Flight | From | To");
  });
});

// ---- stripHtml ----
describe("stripHtml", () => {
  it("strips basic tags", () => {
    expect(stripHtml("<p>Hello <b>world</b></p>")).toContain("Hello");
    expect(stripHtml("<p>Hello <b>world</b></p>")).toContain("world");
    expect(stripHtml("<p>Hello <b>world</b></p>")).not.toContain("<p>");
  });

  it("removes style blocks entirely", () => {
    const html = "<style>.x{color:red}</style><p>Text</p>";
    const result = stripHtml(html);
    expect(result).not.toContain("color");
    expect(result).toContain("Text");
  });

  it("removes script blocks entirely", () => {
    const html = "<script>alert(1)</script><p>Safe</p>";
    const result = stripHtml(html);
    expect(result).not.toContain("alert");
    expect(result).toContain("Safe");
  });

  it("removes image tags entirely", () => {
    const html = '<img src="tracking.gif" alt="spacer"> Hello';
    expect(stripHtml(html)).not.toContain("img");
    expect(stripHtml(html)).not.toContain("tracking");
    expect(stripHtml(html)).toContain("Hello");
  });

  it("strips URLs", () => {
    const html = "Book now https://click.expedia.com/?qs=ABB7longtoken123 today";
    const result = stripHtml(html);
    expect(result).not.toContain("https://");
    expect(result).toContain("Book now");
    expect(result).toContain("today");
  });

  it("strips &zwnj; zero-width non-joiners", () => {
    const html = "&zwnj; &zwnj; &zwnj; Booking Confirmation &zwnj;";
    const result = stripHtml(html);
    expect(result).not.toContain("zwnj");
    expect(result).toContain("Booking Confirmation");
  });

  it("decodes common HTML entities", () => {
    expect(stripHtml("Hello &amp; World")).toContain("Hello & World");
    expect(stripHtml("A &gt; B")).toContain("A > B");
    expect(stripHtml("A &lt; B")).toContain("A < B");
  });

  it("decodes numeric entities", () => {
    // &#8594; is → (right arrow)
    expect(stripHtml("JFK &#8594; IST")).toContain("→");
  });

  it("preserves newlines around block elements", () => {
    const html = "<tr><td>Istanbul</td><td>IST</td></tr><tr><td>Mar 15</td></tr>";
    const result = stripHtml(html);
    // Istanbul and Mar 15 should be on different lines
    const lines = result.split("\n").map((l) => l.trim()).filter(Boolean);
    expect(lines.some((l) => l.includes("Istanbul"))).toBe(true);
    expect(lines.some((l) => l.includes("Mar 15"))).toBe(true);
  });

  it("returns empty string for null input", () => {
    expect(stripHtml(null)).toBe("");
  });
});

// ---- looksLikeConfirmation ----
describe("looksLikeConfirmation", () => {
  it("accepts a Turkish Airlines confirmation", () => {
    const text = `
      Booking Reference: ZZZ999
      From: New York (JFK) To: Istanbul (IST)
      Departure: 10 Apr 2024
      Flight TK 1 departs at 09:30
    `;
    expect(looksLikeConfirmation(text)).toBe(true);
  });

  it("accepts an Expedia booking with flight number", () => {
    const text = `
      Itinerary # 7123456789012
      New York (JFK) to Istanbul (IST)
      Departure: Mar 14, 2024
      Flight TK 3
    `;
    expect(looksLikeConfirmation(text)).toBe(true);
  });

  it("rejects a promotional marketing email", () => {
    const text = `
      The Big Summer Sale
      Up to 40% off select stays
      Book now and save big this season
    `;
    expect(looksLikeConfirmation(text)).toBe(false);
  });

  it("rejects hotel-only confirmation (no flight)", () => {
    const text = `
      Hotel Reservation Confirmed
      Check-in: June 10, 2024
      Check-out: June 15, 2024
      Room type: Deluxe King
      Hotel: Grand Hyatt Istanbul 2024
    `;
    expect(looksLikeConfirmation(text)).toBe(false);
  });

  it("rejects car-rental-only confirmation", () => {
    const text = `
      Car Rental Confirmed 2024
      Pick-up location: Istanbul Airport
      Drop-off: Same location
      Vehicle: Economy Class
    `;
    expect(looksLikeConfirmation(text)).toBe(false);
  });

  it("accepts mixed Expedia email with flight + hotel", () => {
    const text = `
      Itinerary # 7123456789012
      Flight TK 3 New York (JFK) to Istanbul (IST)
      Departure: Mar 14, 2024
      Hotel: Grand Hyatt Istanbul
      Check-in: Mar 14 Check-out: Mar 20 2024
    `;
    expect(looksLikeConfirmation(text)).toBe(true);
  });

  it("rejects email with no year", () => {
    const text = "Flight TK1 JFK to IST boarding pass gate 23";
    expect(looksLikeConfirmation(text)).toBe(false);
  });

  it("rejects email with only one signal", () => {
    const text = "Your trip is coming up! Have a great 2024.";
    expect(looksLikeConfirmation(text)).toBe(false);
  });

  it("accepts promotional email from known sender (2 signals, isKnownSender=true)", () => {
    const text = `
      Big Summer Sale departing JFK 2024
      unsubscribe
      Flight TK1 New York to Istanbul (IST)
      Departure: Jun 15 2024
    `;
    // Known sender: threshold=2, promotional penalty reduces signals but there are enough strong ones
    expect(looksLikeConfirmation(text, true)).toBe(true);
  });

  it("rejects promotional email from unknown sender (needs 3 signals but penalty reduces count)", () => {
    const text = `
      50% off flights departing JFK 2024
      unsubscribe from our mailing list
      Book now and save big!
    `;
    expect(looksLikeConfirmation(text, false)).toBe(false);
  });

  it("counts booking reference as a strong signal", () => {
    const text = `
      Your booking is confirmed for 2024
      PNR: ABCDEF
      Flight TK 1 departs from New York (JFK) to Istanbul (IST)
    `;
    // PNR (2) + flight number (2) + IATA codes (2) + departure language (1) = 7, well above threshold of 4
    expect(looksLikeConfirmation(text, false)).toBe(true);
  });
});

// ---- API calls (mocked fetch) ----
describe("searchEmails", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it("calls the Gmail messages list endpoint", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ messages: [{ id: "abc", threadId: "t1" }] }),
    });

    const results = await searchEmails("token123", "subject:test", 50);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("https://www.googleapis.com/gmail/v1/users/me/messages"),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer token123" }),
      })
    );
    expect(results).toEqual([{ id: "abc", threadId: "t1" }]);
  });

  it("returns empty array when no messages found", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });
    const results = await searchEmails("token", "q", 10);
    expect(results).toEqual([]);
  });
});

describe("getEmailHeaders", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it("extracts From, Subject and Date headers", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        payload: {
          headers: [
            { name: "From", value: "noreply@thy.com" },
            { name: "Subject", value: "Booking Confirmation" },
            { name: "Date", value: "Thu, 15 Mar 2024 09:00:00 +0000" },
          ],
        },
      }),
    });

    const headers = await getEmailHeaders("tok", "msgId");
    expect(headers.from).toBe("noreply@thy.com");
    expect(headers.subject).toBe("Booking Confirmation");
    expect(headers.date).toBe("Thu, 15 Mar 2024 09:00:00 +0000");
  });
});

describe("getEmailBody", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it("decodes base64url body and strips HTML", async () => {
    const raw = "<p>Hello <b>world</b></p>";
    const encoded = btoa(raw).replace(/\+/g, "-").replace(/\//g, "_");
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        payload: {
          mimeType: "text/html",
          body: { data: encoded },
          parts: [],
        },
      }),
    });

    const text = await getEmailBody("tok", "msgId");
    expect(text).toContain("Hello");
    expect(text).toContain("world");
    expect(text).not.toContain("<p>");
  });

  it("prefers plain text part over HTML when both are present", async () => {
    const plainEncoded = btoa("Plain text content").replace(/\+/g, "-").replace(/\//g, "_");
    const htmlEncoded = btoa("<p>HTML content</p>").replace(/\+/g, "-").replace(/\//g, "_");
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        payload: {
          mimeType: "multipart/alternative",
          body: {},
          parts: [
            { mimeType: "text/plain", body: { data: plainEncoded } },
            { mimeType: "text/html", body: { data: htmlEncoded } },
          ],
        },
      }),
    });

    const text = await getEmailBody("tok", "msgId");
    expect(text).toContain("Plain text content");
    expect(text).not.toContain("HTML content");
  });

  it("returns empty string when payload has no body data", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ payload: { mimeType: "multipart/mixed", parts: [] } }),
    });
    const text = await getEmailBody("tok", "msgId");
    expect(text).toBe("");
  });

  it("correctly decodes UTF-8 multi-byte characters (Turkish, Arabic)", async () => {
    // "İstanbul" contains a multi-byte UTF-8 character (İ = U+0130, encoded as 0xC4 0xB0).
    // atob() alone would produce mojibake; TextDecoder must be used.
    const utf8 = "Sayın yolcumuz, İstanbul uçuşunuz onaylandı.";
    const encoder = new TextEncoder();
    const bytes = encoder.encode(utf8);
    // Convert to base64url (the format Gmail API uses)
    const base64 = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_");

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        payload: { mimeType: "text/plain", body: { data: base64 } },
      }),
    });
    const text = await getEmailBody("tok", "msgId");
    expect(text).toContain("İstanbul");
    expect(text).not.toContain("Ä°stanbul"); // mojibake that atob() alone would produce
  });
});
