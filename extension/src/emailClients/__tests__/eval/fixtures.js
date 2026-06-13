/**
 * Labeled eval fixtures for the TripTrace parser pipeline.
 * Each fixture has:
 *   - id: string
 *   - from: email sender
 *   - subject: email subject
 *   - body: stripped email body (as would be produced by getEmailBody)
 *   - expected: { is_flight, departure_date, destination_country, flight_number }
 *       is_flight: true = should produce a trip record (any confidence), false = should be filtered
 *       null fields in expected mean "don't check this field"
 */
export const fixtures = [
  // ── TRUE POSITIVES: known senders (regex parsers) ─────────────────────────

  {
    id: "tk-1-roundtrip",
    from: "noreply@thy.com",
    subject: "Booking Confirmation - PNR ABCDEF",
    body: `
Booking Confirmation
PNR: ABCDEF
Passenger: John Smith

TK 1 | New York (JFK) | Istanbul (IST) | 14 Mar 2024 22:15
TK 2 | Istanbul (IST) | New York (JFK) | 28 Mar 2024 23:55
Aircraft: Boeing 777-300ER
    `,
    expected: { is_flight: true, departure_date: "2024-03-14", destination_country: "Turkey", flight_number: "TK 1" },
  },

  {
    id: "lh-400-roundtrip",
    from: "booking@lufthansa.com",
    subject: "Order Confirmation - LH 400",
    body: `
Order number: 123-4567890
Passenger: Jane Doe

Departure: 10 Jun 2024
Frankfurt (FRA) → New York (JFK)
LH 400 | Aircraft: Airbus A340-600

Return: 24 Jun 2024
New York (JFK) → Frankfurt (FRA)
LH 401
    `,
    expected: { is_flight: true, departure_date: "2024-06-10", destination_country: "United States", flight_number: "LH 400" },
  },

  {
    id: "ua-oneway",
    from: "info@united.com",
    subject: "Your flight confirmation",
    body: `
Confirmation Number: UA9XYZ
Passenger: Mike Johnson

Departing Wednesday, March 20, 2024
(ORD) → New York (JFK)
UA 23 | One-way
    `,
    expected: { is_flight: true, departure_date: "2024-03-20", destination_country: "United States", flight_number: "UA 23" },
  },

  {
    id: "aa-roundtrip",
    from: "no-reply@email.aa.com",
    subject: "Your reservation is confirmed",
    body: `
Record Locator: PQR456
Passenger: Sarah Williams

DEPARTING Saturday, June 01, 2024
New York (JFK) to London (LHR)
AA 100

RETURNING Saturday, June 15, 2024
London (LHR) to New York (JFK)
AA 101
    `,
    expected: { is_flight: true, departure_date: "2024-06-01", destination_country: "United Kingdom", flight_number: "AA 100" },
  },

  {
    id: "ek-dubai",
    from: "booking@emirates.com",
    subject: "Emirates E-Ticket Itinerary",
    body: `
Booking Reference: EK123XY
Passenger Name: Ahmed Hassan

Outbound Flight
Dubai (DXB) to New York (JFK)
Date: 05 Aug 2024
EK 201 | Aircraft: Airbus A380

Return Flight
Date: 19 Aug 2024
New York (JFK) to Dubai (DXB)
EK 202
    `,
    expected: { is_flight: true, departure_date: "2024-08-05", destination_country: "United States", flight_number: "EK 201" },
  },

  {
    id: "expedia-package",
    from: "itinerary@expedia.com",
    subject: "Itinerary confirmation",
    body: `
Itinerary # 71234567890

Departing Thu Mar 14, 2024
New York (JFK) → Istanbul (IST)
TK 1 departs 22:15

Returning Thu Mar 28, 2024
Istanbul (IST) → New York (JFK)

Hotel: Grand Hyatt Istanbul
Check-in: Mar 14 | Check-out: Mar 28
Traveler: John Smith
    `,
    expected: { is_flight: true, departure_date: "2024-03-14", destination_country: "Turkey", flight_number: "TK 1" },
  },

  {
    id: "qatar-doha",
    from: "noreply@qatarairways.com",
    subject: "Booking Confirmation QR 701",
    body: `
Booking Reference: QR8765
Passenger: Maria Garcia

Departure: 12 Sep 2024
New York (JFK) → Doha (DOH)
QR 701 | Aircraft: Boeing 777-300ER

Inbound: 26 Sep 2024
Doha (DOH) → New York (JFK)
QR 702
    `,
    expected: { is_flight: true, departure_date: "2024-09-12", destination_country: "Qatar", flight_number: "QR 701" },
  },

  {
    id: "southwest-domestic",
    from: "noreply@luv.southwest.com",
    subject: "Your trip confirmation",
    body: `
Confirmation Number: ABC123
Passenger: Tom Brown

DEPARTS Thursday, July 11, 2024
New York (LGA) to Los Angeles (LAX)
WN 1234

RETURNS Thursday, July 18, 2024
Los Angeles (LAX) to New York (LGA)
WN 5678
    `,
    expected: { is_flight: true, departure_date: "2024-07-11", destination_country: "United States", flight_number: "WN 1234" },
  },

  {
    id: "ba-london",
    from: "noreply@britishairways.com",
    subject: "British Airways booking confirmation",
    body: `
Booking reference: BAREF1
Passenger: Emma Wilson

Outbound 15 Oct 2024
New York (JFK) to London (LHR)
BA 112

Return 29 Oct 2024
London (LHR) to New York (JFK)
BA 113
    `,
    expected: { is_flight: true, departure_date: "2024-10-15", destination_country: "United Kingdom", flight_number: "BA 112" },
  },

  {
    id: "af-paris",
    from: "noreply@airfrance.com",
    subject: "Air France booking confirmation",
    body: `
Booking Code: AFR123
Passenger: Claude Monet

Outbound 09 Sep 2024
New York JFK → Paris CDG
AF 11

Return 23 Sep 2024
Paris CDG → New York JFK
AF 12
    `,
    expected: { is_flight: true, departure_date: "2024-09-09", destination_country: null, flight_number: "AF 11" },
  },

  {
    id: "sg-singapore",
    from: "noreply@singaporeair.com",
    subject: "Singapore Airlines E-Ticket",
    body: `
Booking Reference: SQ9876
Passenger: Li Wei

Departure: 20 Nov 2024
New York (JFK) → Singapore (SIN)
SQ 25 | Aircraft: Airbus A350-900ULB

Return: 04 Dec 2024
Singapore (SIN) → New York (JFK)
SQ 26
    `,
    expected: { is_flight: true, departure_date: "2024-11-20", destination_country: "Singapore", flight_number: "SQ 25" },
  },

  {
    id: "delta-atlanta",
    from: "noreply@delta.com",
    subject: "Your flight confirmation",
    body: `
Confirmation #: DL789XY

Departing Fri, May 10, 2024
Atlanta (ATL) to London (LHR)
DL 400

Returning Fri, May 24, 2024
London (LHR) to Atlanta (ATL)
DL 401
Passenger: Robert Davis
    `,
    expected: { is_flight: true, departure_date: "2024-05-10", destination_country: "United Kingdom", flight_number: "DL 400" },
  },

  // ── TRUE NEGATIVES: should be filtered out ────────────────────────────────

  {
    id: "price-alert-google",
    from: "noreply@google.com",
    subject: "Price Alert: New York to Istanbul",
    body: `
Price alert: New York to Istanbul
Prices have dropped! Flights from $420 round trip
Cheapest dates: March 14-28, 2024
Book now on Google Flights before prices go up
    `,
    expected: { is_flight: false, departure_date: null, destination_country: null, flight_number: null },
  },

  {
    id: "flight-credit-email",
    from: "noreply@expedia.com",
    subject: "Your Flight Credit: $234.50",
    body: `
Your Flight Credit is Ready
You have a flight credit of $234.50 to use on a future booking.
Original booking: New York to Istanbul, March 2024
Credit expires: December 2025
Use credit code: CREDIT2024XYZ
    `,
    expected: { is_flight: false, departure_date: null, destination_country: null, flight_number: null },
  },

  {
    id: "hotel-only-hyatt",
    from: "reservations@hyatt.com",
    subject: "Hotel Booking Confirmed",
    body: `
Hotel Booking Confirmed
Grand Hyatt Istanbul
Check-in: March 14, 2024
Check-out: March 28, 2024
Room type: Deluxe King
14 nights stay
Reservation number: HYA123456
    `,
    expected: { is_flight: false, departure_date: null, destination_country: null, flight_number: null },
  },

  {
    id: "marketing-cheapoair",
    from: "deals@cheapoair.com",
    subject: "50% off flights this weekend",
    body: `
Big Summer Sale - Up to 50% off flights!
New York to London from just $299 round trip
New York to Paris from just $349 round trip
Book by midnight Sunday. Prices subject to change.
Unsubscribe from this mailing list
    `,
    expected: { is_flight: false, departure_date: null, destination_country: null, flight_number: null },
  },

  {
    id: "gate-change-notice",
    from: "noreply@thy.com",
    subject: "Gate Change Notice - TK 1",
    body: `
Gate Change Notice
Your flight TK 1 on 14 Mar 2024 has changed gates.
New gate: B22 (previously A14)
Please proceed to the new gate.
    `,
    expected: { is_flight: false, departure_date: null, destination_country: null, flight_number: null },
  },

  // ── EDGE CASES ─────────────────────────────────────────────────────────────

  {
    id: "forwarded-with-noise",
    from: "user@gmail.com",
    subject: "Fwd: Your flight confirmation",
    body: `
---------- Forwarded message ---------
From: noreply@thy.com
Date: Wed, Mar 13, 2024
Subject: Booking Confirmation

PNR: XYZABC
Passenger: Forwarded User

TK 1 | New York (JFK) | Istanbul (IST) | 14 Mar 2024
    `,
    expected: { is_flight: true, departure_date: "2024-03-14", destination_country: "Turkey", flight_number: "TK 1" },
  },

  {
    id: "garbled-html-stripped",
    from: "noreply@united.com",
    subject: "Confirmation UA 777",
    body: `
Confirmation Number UA9ABC
Passenger Jane Smith
Departing Wednesday April 03 2024
Chicago ORD to London LHR
UA 777
Aircraft Boeing 787-10
    `,
    expected: { is_flight: true, departure_date: "2024-04-03", destination_country: "United Kingdom", flight_number: "UA 777" },
  },

  {
    id: "pipe-table-format",
    from: "booking@expedia.com",
    subject: "Itinerary # 71999888777",
    body: `
Itinerary # 71999888777
Traveler: Alex Chen

AA 100 | New York (JFK) | London (LHR) | Mar 20, 2024 | 09:00
AA 101 | London (LHR) | New York (JFK) | Apr 03, 2024 | 11:30
    `,
    expected: { is_flight: true, departure_date: "2024-03-20", destination_country: "United Kingdom", flight_number: "AA 100" },
  },
];
