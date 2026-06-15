import { describe, it, expect } from "vitest";
import { findParser, runPipeline } from "../engine.js";

// --- Turkish Airlines fixture ---
const TURKISH_EMAIL = `
From: bookingconfirmation@thy.com
Subject: Your booking confirmation - PNR: ABC123

Dear Passenger,

Booking Reference: ABC123

FLIGHT DETAILS
From: New York (JFK) To: Istanbul (IST)
Departure: 15 Mar 2024  09:30
Arrival:   16 Mar 2024  08:00

Return Flight
From: Istanbul (IST) To: New York (JFK)
Departure: 28 Mar 2024  11:00
Arrival:   28 Mar 2024  16:30

Thank you for choosing Turkish Airlines.
`;

// --- Lufthansa fixture ---
const LUFTHANSA_EMAIL = `
From: lufthansa@m.lufthansa.com
Subject: Your booking confirmation LH / Order number: XY9876

Dear Traveller,

Your booking confirmation
Order number: XY9876

Outbound flight
Chicago (ORD) → Frankfurt (FRA)
Date: 10 Jun 2024
Departure: 10:15

Return flight
Frankfurt (FRA) → Chicago (ORD)
Date: 20 Jun 2024
Departure: 14:30

Thank you for booking with Lufthansa.
`;

describe("findParser", () => {
  it("matches Turkish Airlines by sender domain", () => {
    const parser = findParser("bookingconfirmation@thy.com");
    expect(parser).not.toBeNull();
    expect(parser.id).toBe("turkish-airlines");
  });

  it("matches Turkish Airlines alternate domain", () => {
    const parser = findParser("noreply@turkishairlines.com");
    expect(parser).not.toBeNull();
    expect(parser.id).toBe("turkish-airlines");
  });

  it("matches Lufthansa by sender domain", () => {
    const parser = findParser("lufthansa@m.lufthansa.com");
    expect(parser).not.toBeNull();
    expect(parser.id).toBe("lufthansa");
  });

  it("returns null for unknown sender", () => {
    expect(findParser("noreply@unknownairline.xyz")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(findParser("")).toBeNull();
  });
});

describe("runPipeline - Turkish Airlines", () => {
  it("extracts confirmation number", () => {
    const result = runPipeline(TURKISH_EMAIL, "bookingconfirmation@thy.com", "Your booking confirmation");
    expect(result.confirmation_number).toBe("ABC123");
  });

  it("extracts departure date as ISO 8601", () => {
    const result = runPipeline(TURKISH_EMAIL, "bookingconfirmation@thy.com", "Your booking confirmation");
    expect(result.departure_date).toBe("2024-03-15");
  });

  it("extracts return date as ISO 8601", () => {
    const result = runPipeline(TURKISH_EMAIL, "bookingconfirmation@thy.com", "Your booking confirmation");
    expect(result.return_date).toBe("2024-03-28");
  });

  it("resolves destination country from IATA", () => {
    const result = runPipeline(TURKISH_EMAIL, "bookingconfirmation@thy.com", "Your booking confirmation");
    expect(result.destination_country).toBe("Turkey");
  });

  it("sets origin_country to United States (from JFK)", () => {
    const result = runPipeline(TURKISH_EMAIL, "bookingconfirmation@thy.com", "Your booking confirmation");
    expect(result.origin_country).toBe("United States");
  });

  it("sets airline name", () => {
    const result = runPipeline(TURKISH_EMAIL, "bookingconfirmation@thy.com", "Your booking confirmation");
    expect(result.airline).toBe("Turkish Airlines");
  });

  it("sets confidence high", () => {
    const result = runPipeline(TURKISH_EMAIL, "bookingconfirmation@thy.com", "Your booking confirmation");
    expect(result.confidence).toBe("high");
  });
});

describe("runPipeline - Lufthansa", () => {
  it("extracts order/confirmation number", () => {
    const result = runPipeline(LUFTHANSA_EMAIL, "lufthansa@m.lufthansa.com", "Your booking confirmation LH");
    expect(result.confirmation_number).toBe("XY9876");
  });

  it("extracts departure date", () => {
    const result = runPipeline(LUFTHANSA_EMAIL, "lufthansa@m.lufthansa.com", "Your booking confirmation LH");
    expect(result.departure_date).toBe("2024-06-10");
  });

  it("extracts return date", () => {
    const result = runPipeline(LUFTHANSA_EMAIL, "lufthansa@m.lufthansa.com", "Your booking confirmation LH");
    expect(result.return_date).toBe("2024-06-20");
  });

  it("resolves destination country from IATA", () => {
    const result = runPipeline(LUFTHANSA_EMAIL, "lufthansa@m.lufthansa.com", "Your booking confirmation LH");
    expect(result.destination_country).toBe("Germany");
  });

  it("sets airline name", () => {
    const result = runPipeline(LUFTHANSA_EMAIL, "lufthansa@m.lufthansa.com", "Your booking confirmation LH");
    expect(result.airline).toBe("Lufthansa");
  });
});

describe("runPipeline - unmatched sender", () => {
  it("returns unmatched confidence for unknown sender", () => {
    const result = runPipeline("some email body", "no@unknown.xyz", "some subject");
    expect(result.confidence).toBe("unmatched");
  });
});

// ─── United Airlines ─────────────────────────────────────────────────────────

const UNITED_EMAIL = `
From: united@united.com
Subject: Your United Airlines flight confirmation

Dear John Smith,

Confirmation Number: ABCDE1

Departing
New York, NY (EWR) → London, England (LHR)
Wednesday, April 03, 2024
United 110

Returning
London, England (LHR) → New York, NY (EWR)
Wednesday, April 17, 2024
United 111

Thank you for choosing United Airlines.
`;

describe("runPipeline - United Airlines", () => {
  it("matches United by sender domain", () => {
    expect(findParser("united@united.com")?.id).toBe("united");
  });

  it("extracts confirmation number", () => {
    const result = runPipeline(UNITED_EMAIL, "united@united.com", "Your United Airlines flight confirmation");
    expect(result.confirmation_number).toBe("ABCDE1");
  });

  it("extracts departure date", () => {
    const result = runPipeline(UNITED_EMAIL, "united@united.com", "Your United Airlines flight confirmation");
    expect(result.departure_date).toBe("2024-04-03");
  });

  it("extracts return date", () => {
    const result = runPipeline(UNITED_EMAIL, "united@united.com", "Your United Airlines flight confirmation");
    expect(result.return_date).toBe("2024-04-17");
  });

  it("resolves destination as United Kingdom", () => {
    const result = runPipeline(UNITED_EMAIL, "united@united.com", "Your United Airlines flight confirmation");
    expect(result.destination_country).toBe("United Kingdom");
  });

  it("sets airline name to United Airlines", () => {
    const result = runPipeline(UNITED_EMAIL, "united@united.com", "Your United Airlines flight confirmation");
    expect(result.airline).toBe("United Airlines");
  });
});

// ─── Delta Air Lines ──────────────────────────────────────────────────────────

const DELTA_EMAIL = `
From: noreply@notify.delta.com
Subject: Your flight confirmation - DL

Confirmation #: XYZ789

Departing Flight
Atlanta (ATL) to Paris (CDG)
Fri, May 10, 2024

Return Flight
Paris (CDG) to Atlanta (ATL)
Sun, May 19, 2024

Passenger: Jane Doe
`;

describe("runPipeline - Delta Air Lines", () => {
  it("matches Delta by sender domain", () => {
    expect(findParser("noreply@notify.delta.com")?.id).toBe("delta");
  });

  it("extracts confirmation number", () => {
    const result = runPipeline(DELTA_EMAIL, "noreply@notify.delta.com", "Your flight confirmation - DL");
    expect(result.confirmation_number).toBe("XYZ789");
  });

  it("extracts departure date", () => {
    const result = runPipeline(DELTA_EMAIL, "noreply@notify.delta.com", "Your flight confirmation - DL");
    expect(result.departure_date).toBe("2024-05-10");
  });

  it("extracts return date", () => {
    const result = runPipeline(DELTA_EMAIL, "noreply@notify.delta.com", "Your flight confirmation - DL");
    expect(result.return_date).toBe("2024-05-19");
  });

  it("resolves destination as France", () => {
    const result = runPipeline(DELTA_EMAIL, "noreply@notify.delta.com", "Your flight confirmation - DL");
    expect(result.destination_country).toBe("France");
  });

  it("sets airline name to Delta Air Lines", () => {
    const result = runPipeline(DELTA_EMAIL, "noreply@notify.delta.com", "Your flight confirmation - DL");
    expect(result.airline).toBe("Delta Air Lines");
  });
});

// ─── American Airlines ────────────────────────────────────────────────────────

const AMERICAN_EMAIL = `
From: confirmation@aa.com
Subject: Your American Airlines flight reservation

Record Locator: PQR456

Passenger: Robert Johnson

DEPARTING
Dallas/Fort Worth (DFW) to Tokyo (NRT)
Saturday, June 01, 2024
AA 175

RETURNING
Tokyo (NRT) to Dallas/Fort Worth (DFW)
Friday, June 14, 2024
AA 176
`;

describe("runPipeline - American Airlines", () => {
  it("matches American Airlines by sender domain", () => {
    expect(findParser("confirmation@aa.com")?.id).toBe("american");
  });

  it("extracts record locator", () => {
    const result = runPipeline(AMERICAN_EMAIL, "confirmation@aa.com", "Your American Airlines flight reservation");
    expect(result.confirmation_number).toBe("PQR456");
  });

  it("extracts departure date", () => {
    const result = runPipeline(AMERICAN_EMAIL, "confirmation@aa.com", "Your American Airlines flight reservation");
    expect(result.departure_date).toBe("2024-06-01");
  });

  it("extracts return date", () => {
    const result = runPipeline(AMERICAN_EMAIL, "confirmation@aa.com", "Your American Airlines flight reservation");
    expect(result.return_date).toBe("2024-06-14");
  });

  it("resolves destination as Japan", () => {
    const result = runPipeline(AMERICAN_EMAIL, "confirmation@aa.com", "Your American Airlines flight reservation");
    expect(result.destination_country).toBe("Japan");
  });

  it("sets airline name", () => {
    const result = runPipeline(AMERICAN_EMAIL, "confirmation@aa.com", "Your American Airlines flight reservation");
    expect(result.airline).toBe("American Airlines");
  });
});

// ─── Emirates ─────────────────────────────────────────────────────────────────

const EMIRATES_EMAIL = `
From: dnata@emirates.com
Subject: Emirates booking confirmation

Booking Reference: EMR123

Dear Traveller,

Outbound Flight
New York (JFK) to Dubai (DXB)
Date: 20 Jul 2024

Return Flight
Dubai (DXB) to New York (JFK)
Date: 03 Aug 2024

Passenger Name: AHMED HASSAN
`;

describe("runPipeline - Emirates", () => {
  it("matches Emirates by sender domain", () => {
    expect(findParser("dnata@emirates.com")?.id).toBe("emirates");
  });

  it("extracts booking reference", () => {
    const result = runPipeline(EMIRATES_EMAIL, "dnata@emirates.com", "Emirates booking confirmation");
    expect(result.confirmation_number).toBe("EMR123");
  });

  it("extracts departure date", () => {
    const result = runPipeline(EMIRATES_EMAIL, "dnata@emirates.com", "Emirates booking confirmation");
    expect(result.departure_date).toBe("2024-07-20");
  });

  it("extracts return date", () => {
    const result = runPipeline(EMIRATES_EMAIL, "dnata@emirates.com", "Emirates booking confirmation");
    expect(result.return_date).toBe("2024-08-03");
  });

  it("resolves destination as United Arab Emirates", () => {
    const result = runPipeline(EMIRATES_EMAIL, "dnata@emirates.com", "Emirates booking confirmation");
    expect(result.destination_country).toBe("United Arab Emirates");
  });

  it("sets airline name", () => {
    const result = runPipeline(EMIRATES_EMAIL, "dnata@emirates.com", "Emirates booking confirmation");
    expect(result.airline).toBe("Emirates");
  });
});

// ─── Air France ───────────────────────────────────────────────────────────────

const AIR_FRANCE_EMAIL = `
From: confirmation@airfrance.fr
Subject: Your Air France booking confirmation

Booking Code: AFR999

Passenger: Marie Dupont

Outbound
New York JFK → Paris CDG (AF 006)
09 Sep 2024

Return
Paris CDG → New York JFK (AF 007)
22 Sep 2024
`;

describe("runPipeline - Air France", () => {
  it("matches Air France by sender domain", () => {
    expect(findParser("confirmation@airfrance.fr")?.id).toBe("airfrance");
  });

  it("extracts booking code", () => {
    const result = runPipeline(AIR_FRANCE_EMAIL, "confirmation@airfrance.fr", "Your Air France booking confirmation");
    expect(result.confirmation_number).toBe("AFR999");
  });

  it("extracts departure date", () => {
    const result = runPipeline(AIR_FRANCE_EMAIL, "confirmation@airfrance.fr", "Your Air France booking confirmation");
    expect(result.departure_date).toBe("2024-09-09");
  });

  it("extracts return date", () => {
    const result = runPipeline(AIR_FRANCE_EMAIL, "confirmation@airfrance.fr", "Your Air France booking confirmation");
    expect(result.return_date).toBe("2024-09-22");
  });

  it("resolves destination as France", () => {
    const result = runPipeline(AIR_FRANCE_EMAIL, "confirmation@airfrance.fr", "Your Air France booking confirmation");
    expect(result.destination_country).toBe("France");
  });

  it("sets airline name", () => {
    const result = runPipeline(AIR_FRANCE_EMAIL, "confirmation@airfrance.fr", "Your Air France booking confirmation");
    expect(result.airline).toBe("Air France");
  });
});

// ─── British Airways ──────────────────────────────────────────────────────────

const BRITISH_AIRWAYS_EMAIL = `
From: ba@britishairways.com
Subject: British Airways booking confirmation

Booking reference: BAREF1

Dear Passenger,

Outbound: Chicago (ORD) to London Heathrow (LHR)
Departure: 15 Oct 2024  BA 295

Return: London Heathrow (LHR) to Chicago (ORD)
Departure: 28 Oct 2024  BA 296
`;

describe("runPipeline - British Airways", () => {
  it("matches British Airways by sender domain", () => {
    expect(findParser("ba@britishairways.com")?.id).toBe("british-airways");
  });

  it("extracts booking reference", () => {
    const result = runPipeline(BRITISH_AIRWAYS_EMAIL, "ba@britishairways.com", "British Airways booking confirmation");
    expect(result.confirmation_number).toBe("BAREF1");
  });

  it("extracts departure date", () => {
    const result = runPipeline(BRITISH_AIRWAYS_EMAIL, "ba@britishairways.com", "British Airways booking confirmation");
    expect(result.departure_date).toBe("2024-10-15");
  });

  it("extracts return date", () => {
    const result = runPipeline(BRITISH_AIRWAYS_EMAIL, "ba@britishairways.com", "British Airways booking confirmation");
    expect(result.return_date).toBe("2024-10-28");
  });

  it("resolves destination as United Kingdom", () => {
    const result = runPipeline(BRITISH_AIRWAYS_EMAIL, "ba@britishairways.com", "British Airways booking confirmation");
    expect(result.destination_country).toBe("United Kingdom");
  });

  it("sets airline name", () => {
    const result = runPipeline(BRITISH_AIRWAYS_EMAIL, "ba@britishairways.com", "British Airways booking confirmation");
    expect(result.airline).toBe("British Airways");
  });
});

// ── Pipe-table IATA fallback ──────────────────────────────────────────────────

// Turkish Airlines pipe-table format: origin city first, destination city second.
// Real TK emails show US departure city (JFK) before destination (IST).
const TK_PIPE_TABLE_EMAIL = `
Booking Confirmation
PNR: TKPIPE

TK 1 | New York (JFK) | Istanbul (IST) | 14 Mar 2024 | Boeing 777-300ER
TK 2 | Istanbul (IST) | New York (JFK) | 28 Mar 2024

Passenger: John Smith
`;

describe("runPipeline - pipe-table IATA fallback", () => {
  it("extracts destination_country from pipe-table rows when parser regex misses it", () => {
    const result = runPipeline(TK_PIPE_TABLE_EMAIL, "info@thy.com", "Booking Confirmation");
    expect(result.destination_country).toBe("Turkey");
  });

  it("resolves origin_country to United States when origin IATA is JFK", () => {
    // TK_PIPE_TABLE_EMAIL: JFK | IST — origin is JFK → United States
    const result = runPipeline(TK_PIPE_TABLE_EMAIL, "info@thy.com", "Booking Confirmation");
    expect(result.origin_country).toBe("United States");
  });

  it("confidence is high when both departure_date and destination_country are found via fallback", () => {
    const result = runPipeline(TK_PIPE_TABLE_EMAIL, "info@thy.com", "Booking Confirmation");
    expect(result.confidence).toBe("high");
  });
});

// ── Forwarded email re-sender detection ──────────────────────────────────────

const FORWARDED_TK_EMAIL = `
---------- Forwarded message ---------
From: noreply@thy.com
Date: Wed, Mar 13, 2024
Subject: Booking Confirmation

PNR: XYZABC
Passenger: Forwarded User

TK 1 | New York (JFK) | Istanbul (IST) | 14 Mar 2024
`;

describe("findParser - forwarded email re-sender detection", () => {
  it("returns null when sender is gmail.com and no body given", () => {
    const parser = findParser("user@gmail.com");
    expect(parser).toBeNull();
  });

  it("finds Turkish Airlines parser from body when outer sender is gmail.com", () => {
    const parser = findParser("user@gmail.com", FORWARDED_TK_EMAIL);
    expect(parser).not.toBeNull();
    expect(parser.id).toBe("turkish-airlines");
  });

  it("direct sender still takes priority over forwarded body", () => {
    const parser = findParser("bookingconfirmation@thy.com", FORWARDED_TK_EMAIL);
    expect(parser).not.toBeNull();
    expect(parser.id).toBe("turkish-airlines");
  });

  it("runPipeline extracts destination_country from forwarded email", () => {
    const result = runPipeline(FORWARDED_TK_EMAIL, "user@gmail.com", "Fwd: Your flight confirmation");
    expect(result.destination_country).toBe("Turkey");
  });

  it("runPipeline extracts departure_date from forwarded email", () => {
    const result = runPipeline(FORWARDED_TK_EMAIL, "user@gmail.com", "Fwd: Your flight confirmation");
    expect(result.departure_date).toBe("2024-03-14");
  });
});

// ── origin_country IATA resolution ──────────────────────────────────────────

const IST_TO_JFK = `
PNR: RETURN1
Passenger: Return User

TK 2 | Istanbul (IST) | New York (JFK) | 28 Mar 2024
`;

const NO_IATA_EMAIL = `
PNR: NOIATA
Booking Reference: NOIATA1
Flight to Istanbul on 14 Mar 2024
Departure time: 09:30
`;

describe("runPipeline - origin_country IATA resolution", () => {
  it("resolves origin_country to Turkey when origin IATA is IST", () => {
    const result = runPipeline(IST_TO_JFK, "noreply@thy.com", "Booking Confirmation");
    expect(result.origin_country).toBe("Turkey");
  });

  it("resolves destination_country to United States when destination IATA is JFK", () => {
    const result = runPipeline(IST_TO_JFK, "noreply@thy.com", "Booking Confirmation");
    expect(result.destination_country).toBe("United States");
  });

  it("falls back to United States when no origin IATA is found", () => {
    const result = runPipeline(NO_IATA_EMAIL, "noreply@thy.com", "Booking Confirmation");
    expect(result.origin_country).toBe("United States");
  });
});
