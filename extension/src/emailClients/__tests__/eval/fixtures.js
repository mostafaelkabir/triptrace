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

  // ── NEW PARSER FIXTURES: Qatar Airways ───────────────────────────────────

  {
    id: "qr-london-roundtrip",
    from: "noreply@email.qatarairways.com",
    subject: "E-Ticket Itinerary QR 3",
    body: `
Booking Reference: QR9001
Passenger: Fatima Al-Rashid

Departure: 05 Jul 2024
New York (JFK) → London (LHR)
QR 3 | Aircraft: Boeing 777-200LR
Stopover: Doha (DOH)

Return: 19 Jul 2024
London (LHR) → New York (JFK)
QR 4
    `,
    expected: { is_flight: true, departure_date: "2024-07-05", destination_country: "United Kingdom", flight_number: "QR 3" },
  },

  {
    id: "qr-tokyo-business",
    from: "booking@qatarairways.com",
    subject: "Booking Confirmation QR 807",
    body: `
Booking Reference: QTRBIZ7
Passenger: David Kim

Outbound: 10 Oct 2024
Chicago (ORD) → Tokyo (NRT)
QR 807 | Business Class | Aircraft: Airbus A350-1000

Inbound: 24 Oct 2024
Tokyo (NRT) → Chicago (ORD)
QR 808
    `,
    expected: { is_flight: true, departure_date: "2024-10-10", destination_country: "Japan", flight_number: "QR 807" },
  },

  // ── NEW PARSER FIXTURES: Southwest Airlines ───────────────────────────────

  {
    id: "wn-chicago-oneway",
    from: "noreply@southwest.com",
    subject: "Your trip confirmation",
    body: `
Confirmation Number: XYZ789
Passenger: Laura Martinez

DEPARTS Thursday, August 15, 2024
Dallas (DAL) to Chicago (MDW)
WN 456 | One-way

Bags fly free!
    `,
    expected: { is_flight: true, departure_date: "2024-08-15", destination_country: "United States", flight_number: "WN 456" },
  },

  {
    id: "wn-denver-roundtrip",
    from: "noreply@luv.southwest.com",
    subject: "Reservation confirmed",
    body: `
Confirmation Number: SWCONF99
Passenger: Kevin Nguyen

DEPARTS Friday, September 06, 2024
Los Angeles (LAX) to Denver (DEN)
WN 2200

RETURNS Sunday, September 08, 2024
Denver (DEN) to Los Angeles (LAX)
WN 2201
    `,
    expected: { is_flight: true, departure_date: "2024-09-06", destination_country: "United States", flight_number: "WN 2200" },
  },

  // ── NEW PARSER FIXTURES: JetBlue ──────────────────────────────────────────

  {
    id: "b6-boston-roundtrip",
    from: "noreply@jetblue.com",
    subject: "Your JetBlue itinerary",
    body: `
Confirmation Code: JBCONF5
Passenger: Olivia Chen

DEPARTS Sat, Oct 12, 2024
New York (JFK) to Boston (BOS)
B6 702 | Mint Class

RETURNS Mon, Oct 14, 2024
Boston (BOS) to New York (JFK)
B6 703
    `,
    expected: { is_flight: true, departure_date: "2024-10-12", destination_country: "United States", flight_number: "B6 702" },
  },

  {
    id: "b6-cancun-oneway",
    from: "noreply@email.jetblue.com",
    subject: "JetBlue booking confirmation",
    body: `
Confirmation Code: CANB6X1
Passenger: James Wilson

DEPARTS Thu, Mar 07, 2024
Fort Lauderdale (FLL) to Cancun (CUN)
B6 220 | One-way
    `,
    expected: { is_flight: true, departure_date: "2024-03-07", destination_country: "Mexico", flight_number: "B6 220" },
  },

  // ── NEW PARSER FIXTURES: Alaska Airlines ──────────────────────────────────

  {
    id: "as-seattle-roundtrip",
    from: "noreply@alaskaair.com",
    subject: "Your Alaska Airlines itinerary",
    body: `
Record Locator: ASKL77
Passenger: Rachel Turner

DEPARTS Sat, Nov 02, 2024
Los Angeles (LAX) to Seattle (SEA)
AS 301

RETURNS Sat, Nov 09, 2024
Seattle (SEA) to Los Angeles (LAX)
AS 302
    `,
    expected: { is_flight: true, departure_date: "2024-11-02", destination_country: "United States", flight_number: "AS 301" },
  },

  {
    id: "as-anchorage-oneway",
    from: "noreply@email.alaskaair.com",
    subject: "Confirmation AS 177",
    body: `
Confirmation Code: ANCH88
Passenger: Brian Hoffman

DEPARTS Fri, Dec 20, 2024
Seattle (SEA) to Anchorage (ANC)
AS 177 | One-way
Aircraft: Boeing 737-900ER
    `,
    expected: { is_flight: true, departure_date: "2024-12-20", destination_country: "United States", flight_number: "AS 177" },
  },

  // ── NEW PARSER FIXTURES: Etihad Airways ──────────────────────────────────

  {
    id: "ey-abudhabi-roundtrip",
    from: "booking@etihad.com",
    subject: "Etihad Airways E-Ticket",
    body: `
Booking Reference: ETYHD11
Passenger: Sara Al-Khalifa

Departure: 18 Apr 2024
New York (JFK) → Abu Dhabi (AUH)
EY 101 | Aircraft: Boeing 787-9 Dreamliner

Return: 02 May 2024
Abu Dhabi (AUH) → New York (JFK)
EY 102
    `,
    expected: { is_flight: true, departure_date: "2024-04-18", destination_country: "United Arab Emirates", flight_number: "EY 101" },
  },

  {
    id: "ey-milan-oneway",
    from: "noreply@email.etihad.com",
    subject: "Booking Confirmed EY 89",
    body: `
PNR: MILETY9
Passenger: Giorgio Bianchi

Departing: 07 Jun 2024
Chicago (ORD) → Milan (MXP)
EY 89 | One-way
    `,
    expected: { is_flight: true, departure_date: "2024-06-07", destination_country: "Italy", flight_number: "EY 89" },
  },

  // ── NEW PARSER FIXTURES: Singapore Airlines ───────────────────────────────

  {
    id: "sq-sydney-roundtrip",
    from: "noreply@mail.singaporeair.com",
    subject: "Singapore Airlines Booking Confirmation",
    body: `
Booking Reference: SQSYD22
Passenger: Priya Sharma

Departure: 15 Feb 2024
Los Angeles (LAX) → Sydney (SYD)
SQ 37 | Aircraft: Airbus A350-900ULR

Return: 01 Mar 2024
Sydney (SYD) → Los Angeles (LAX)
SQ 38
    `,
    expected: { is_flight: true, departure_date: "2024-02-15", destination_country: "Australia", flight_number: "SQ 37" },
  },

  {
    id: "sq-delhi-business",
    from: "booking@singaporeairlines.com",
    subject: "E-Ticket Itinerary SQ 63",
    body: `
Booking Reference: SQDELB1
Passenger: Vikram Patel

Departure: 22 Aug 2024
New York (JFK) → Delhi (DEL)
SQ 63 | Business Class | Aircraft: Airbus A380-800

Return: 05 Sep 2024
Delhi (DEL) → New York (JFK)
SQ 64
    `,
    expected: { is_flight: true, departure_date: "2024-08-22", destination_country: "India", flight_number: "SQ 63" },
  },

  // ── NEGATIVE FIXTURES ──────────────────────────────────────────────────────

  {
    id: "subscription-cancellation",
    from: "noreply@southwest.com",
    subject: "Subscription cancellation confirmed",
    body: `
You have successfully cancelled your subscription to Southwest Rapid Rewards updates.
You will no longer receive promotional emails from us.
To resubscribe visit our website.
Your account remains active at southwest.com.
    `,
    expected: { is_flight: false, departure_date: null, destination_country: null, flight_number: null },
  },

  {
    id: "hotel-upgrade-notice",
    from: "upgrade@marriott.com",
    subject: "Room upgrade confirmed",
    body: `
Great news! Your room has been upgraded.
Hotel: Marriott Grand Paris
Check-in: April 10, 2024
Check-out: April 14, 2024
Original room: Standard King
Upgraded room: Deluxe Suite
Reservation number: MAR456789
    `,
    expected: { is_flight: false, departure_date: null, destination_country: null, flight_number: null },
  },

  {
    id: "car-rental-only",
    from: "reservations@hertz.com",
    subject: "Hertz car rental confirmation",
    body: `
Car Rental Confirmation
Hertz Reference: HR9876543
Renter: Michael Scott
Pick-up location: JFK Airport Terminal 4
Pick-up date: June 03, 2024
Drop-off date: June 10, 2024
Vehicle class: Intermediate SUV
Total estimated cost: $423.00
    `,
    expected: { is_flight: false, departure_date: null, destination_country: null, flight_number: null },
  },

  {
    id: "mileage-statement",
    from: "noreply@delta.com",
    subject: "Your SkyMiles statement",
    body: `
SkyMiles Activity Statement
Account: Robert Davis
Balance: 45,230 miles

Recent activity:
DL 400 ATL-LHR May 10, 2024 — 5,456 miles earned
DL 401 LHR-ATL May 24, 2024 — 5,456 miles earned

Redeemable miles: 45,230
    `,
    expected: { is_flight: false, departure_date: null, destination_country: null, flight_number: null },
  },

  {
    id: "newsletter-airline",
    from: "deals@email.aa.com",
    subject: "This week's best fares",
    body: `
Deals of the Week
New York to London from $399 round trip
New York to Paris from $349 round trip
New York to Tokyo from $599 round trip
Prices subject to change. Limited time offer.
Unsubscribe | Privacy Policy
    `,
    expected: { is_flight: false, departure_date: null, destination_country: null, flight_number: null },
  },

  // ── NON-ENGLISH FIXTURES ──────────────────────────────────────────────────

  {
    id: "tk-turkish-language",
    from: "noreply@thy.com",
    subject: "Rezervasyon Onayı - PNR TRKTR1",
    body: `
Rezervasyon Onayı
PNR: TRKTR1
Yolcu: Mustafa Yıldız

TK 1 | New York (JFK) | İstanbul (IST) | 20 Nis 2024 22:15
TK 2 | İstanbul (IST) | New York (JFK) | 04 May 2024 23:55

Uçak: Boeing 777-300ER
    `,
    expected: { is_flight: true, departure_date: null, destination_country: "Turkey", flight_number: "TK 1" },
  },

  {
    id: "af-french-language",
    from: "noreply@airfrance.com",
    subject: "Confirmation de réservation AF 11",
    body: `
Confirmation de réservation
Code de réservation: AFR456
Passager: Pierre Dubois

Outbound: 15 Jun 2024
New York (JFK) → Paris (CDG)
AF 11 | Airbus A350-900

Return: 29 Jun 2024
Paris (CDG) → New York (JFK)
AF 12
    `,
    expected: { is_flight: true, departure_date: "2024-06-15", destination_country: null, flight_number: "AF 11" },
  },

  {
    id: "ek-arabic-language",
    from: "booking@emirates.com",
    subject: "تأكيد الحجز EK 201",
    body: `
تأكيد الحجز
رقم الحجز: EK456AB
الراكب: محمد الأمين

رحلة المغادرة
Dubai (DXB) to New York (JFK)
Date: 12 Jul 2024
EK 201 | Aircraft: Airbus A380

رحلة العودة
New York (JFK) to Dubai (DXB)
Date: 26 Jul 2024
EK 202
    `,
    expected: { is_flight: true, departure_date: "2024-07-12", destination_country: "United States", flight_number: "EK 201" },
  },

  // ── EDGE CASES ────────────────────────────────────────────────────────────

  {
    id: "multi-city-three-legs",
    from: "booking@expedia.com",
    subject: "Multi-city itinerary confirmed",
    body: `
Itinerary # 72111222333
Traveler: Anna Schmidt
Multi-city trip

Leg 1: 05 Mar 2024
New York (JFK) → London (LHR)
BA 112 | 09:00

Leg 2: 12 Mar 2024
London (LHR) → Paris (CDG)
AF 1680 | 14:30

Leg 3: 19 Mar 2024
Paris (CDG) → New York (JFK)
AF 11 | 11:15
    `,
    expected: { is_flight: true, departure_date: "2024-03-05", destination_country: "United Kingdom", flight_number: "BA 112" },
  },

  {
    id: "one-way-international",
    from: "noreply@united.com",
    subject: "One-way flight confirmation",
    body: `
Confirmation Number: UA5OWINT
Passenger: Carlos Rivera
One-way trip

Departing Thursday, May 23, 2024
New York (EWR) → Sao Paulo (GRU)
UA 860 | One-way
Aircraft: Boeing 767-300ER
    `,
    expected: { is_flight: true, departure_date: "2024-05-23", destination_country: "Brazil", flight_number: "UA 860" },
  },

  {
    id: "missing-return-date",
    from: "noreply@britishairways.com",
    subject: "BA booking confirmation",
    body: `
Booking reference: BANORET
Passenger: Thomas Hughes

Outbound 08 Aug 2024
New York (JFK) to London (LHR)
BA 178

Return flight details to follow.
Return booking reference: pending
    `,
    expected: { is_flight: true, departure_date: "2024-08-08", destination_country: "United Kingdom", flight_number: "BA 178" },
  },

  {
    id: "partial-forward-email",
    from: "noreply@lufthansa.com",
    subject: "Re: Fwd: LH booking",
    body: `
---- Forwarded message ----
Order number: 999-8887776
Passenger: Stefan Müller

Departure: 17 Apr 2024
Munich (MUC) → New York (JFK)
LH 410 | Aircraft: Airbus A340-600
    `,
    expected: { is_flight: true, departure_date: "2024-04-17", destination_country: "United States", flight_number: "LH 410" },
  },

  {
    id: "very-long-email",
    from: "itinerary@expedia.com",
    subject: "Complete travel itinerary",
    body: `
Complete Travel Package Confirmation
Itinerary # 73000111222
Traveler: Jennifer Adams
Booking date: January 15, 2024

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FLIGHT DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Departing Thu Mar 21, 2024
New York (JFK) → Tokyo (NRT)
JL 006 | Japan Airlines | Aircraft: Boeing 777-300ER
Departure: 11:45 | Arrival: 14:35+1
Seat: 14A (Economy)
Baggage: 2 checked bags included

Return Mon Apr 08, 2024
Tokyo (NRT) → New York (JFK)
JL 007 | Japan Airlines
Departure: 16:30 | Arrival: 14:00

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HOTEL DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Shinjuku Washington Hotel
Check-in: March 21, 2024
Check-out: April 08, 2024
17 nights | Superior Twin Room
Room rate: $145/night
Total hotel: $2,465.00

APA Hotel Akihabara Ekimae
Check-in: March 25, 2024
Check-out: March 28, 2024
3 nights | Standard Single
Room rate: $110/night
Total: $330.00

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ACTIVITIES BOOKED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

March 22: Tokyo City Tour - Full Day ($89)
March 24: Nikko Day Trip by Shinkansen ($145)
March 27: TeamLab Planets admission ($32)
March 29: Mount Fuji & Hakone Tour ($189)
April 01: Kyoto & Nara Day Trip ($210)
April 03: Osaka Castle + Dotonbori food tour ($99)
April 05: Universal Studios Japan ($98)
April 06: Hiroshima & Miyajima Day Trip ($175)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PAYMENT SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Flights: $1,890.00
Hotels: $2,795.00
Activities: $1,037.00
Travel Insurance: $189.00
Total Charged: $5,911.00
Payment method: Visa ending in 4242

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IMPORTANT INFORMATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Please ensure your passport is valid for at least 6 months beyond your travel dates.
Japan does not require a visa for US citizens for stays up to 90 days.
All times shown are local times at origin/destination airports.
Expedia customer support: 1-800-EXPEDIA
    `,
    expected: { is_flight: true, departure_date: "2024-03-21", destination_country: "Japan", flight_number: "JL 006" },
  },

  // ── ACC-F1: 15 new fixtures ────────────────────────────────────────────────

  {
    id: "connection-flight",
    from: "noreply@thy.com",
    subject: "E-Ticket - PNR TRK123",
    body: `
E-Ticket Itinerary
PNR: TRK123
Passenger: Ali Hassan

Leg 1: JFK → FRA | TK 9  | 05 Apr 2024 21:30
Leg 2: FRA → IST | TK 1791| 06 Apr 2024 10:15
Aircraft: Boeing 777
Booking reference: TRK123
    `,
    expected: { is_flight: true, departure_date: "2024-04-05", destination_country: null, flight_number: "TK 9" },
  },

  {
    id: "codeshare-marketed",
    from: "customercare@aa.com",
    subject: "Your American Airlines booking confirmation",
    body: `
Your Booking is Confirmed
Record locator: CODESH

Passenger: Robert Green
AA 6999 (operated by British Airways)
New York (JFK) → London (LHR)
Departure: March 12, 2024 at 10:45 PM
    `,
    expected: { is_flight: true, departure_date: "2024-03-12", destination_country: null, flight_number: "AA 6999" },
  },

  {
    id: "ryanair-no-iata",
    from: "noreply@ryanair.com",
    subject: "Booking Confirmation",
    body: `
Booking Confirmed — ref RYRB5678
Passenger: Sophie Martin

Flight FR 1234
Route: Dublin to Barcelona
Saturday 15 June 2024 — Departure 06:25
Arrive 09:40 local time
    `,
    expected: { is_flight: false, departure_date: null, destination_country: null, flight_number: null },
  },

  {
    id: "hotel-plus-flight",
    from: "noreply@airfrance.fr",
    subject: "Your trip to Paris — hotel + flight",
    body: `
Trip Confirmation — Paris, France
Booking ID: HTL-FLT-9988

FLIGHT
Air France AF 007 | New York (JFK) → Paris (CDG)
Departure: April 20, 2024 | 09:00

HOTEL
Hotel Le Marais, Paris
Check-in: April 20, 2024 | Check-out: April 27, 2024
Room: Deluxe Double — $240/night
    `,
    expected: { is_flight: true, departure_date: "2024-04-20", destination_country: "France", flight_number: null },
  },

  {
    id: "seat-upgrade",
    from: "no-reply@delta.com",
    subject: "You've been upgraded to First Class",
    body: `
Congratulations! You've been upgraded to First Class based on your Medallion Elite status.
Your new boarding pass will be issued automatically at check-in.
No action required. Enjoy your flight!
    `,
    expected: { is_flight: false, departure_date: null, destination_country: null, flight_number: null },
  },

  {
    id: "checkin-reminder",
    from: "checkin@united.com",
    subject: "Check-in now open for your flight tomorrow",
    body: `
Your check-in window is now open!
Log in to united.com or use the United app to check in and choose your seat.
Online check-in closes 60 minutes before departure.
Have a great trip!
    `,
    expected: { is_flight: false, departure_date: null, destination_country: null, flight_number: null },
  },

  {
    id: "bookingcom-flights",
    from: "noreply@booking.com",
    subject: "Your flight to Istanbul is confirmed",
    body: `
Your flight booking is confirmed.
Booking number: BDC-889921

Passenger: Maria Garcia

EK 101 | New York (JFK) → Dubai (DXB) | 18 May 2024 | 23:05
EK 103 | Dubai (DXB) → Istanbul (IST)  | 19 May 2024 | 09:30

Confirmation sent to: maria@example.com
    `,
    expected: { is_flight: true, departure_date: "2024-05-18", destination_country: null, flight_number: "EK 101" },
  },

  {
    id: "tripcom-itinerary",
    from: "ticket@singaporeair.com",
    subject: "Singapore Airlines — Flight Booking Confirmed",
    body: `
Order Number: SQ-20240912-5678
Flight Booking Confirmed

Outbound
SQ 37 | Los Angeles (LAX) → Singapore (SIN)
Departure: 12 Sep 2024 23:45  Arrival: 14 Sep 2024 07:00

Passenger: James Wong
Adult × 1
    `,
    expected: { is_flight: true, departure_date: "2024-09-12", destination_country: "Singapore", flight_number: "SQ 37" },
  },

  {
    id: "two-passengers",
    from: "confirmation@kayak.com",
    subject: "Flight to Rome — 2 passengers confirmed",
    body: `
Booking Confirmed — 2 Passengers
Confirmation: KYK-554321

Passengers:
1. David Kim
2. Sarah Kim

AZ 606 | New York (JFK) → Rome (FCO)
Departure: July 4, 2024
Economy | 2 seats
    `,
    expected: { is_flight: true, departure_date: "2024-07-04", destination_country: "Italy", flight_number: null },
  },

  {
    id: "infant-on-ticket",
    from: "confirm@emirates.com",
    subject: "Emirates booking EK55X — Adult + Infant",
    body: `
Booking Reference: EK55XINF
Passengers:
  Adult — Fatima Al-Rashid
  Infant (lap) — Yusuf Al-Rashid (11 months)

EK 202 | New York (JFK) → Dubai (DXB)
Date: August 10, 2024
Departure: 23:00
    `,
    expected: { is_flight: true, departure_date: "2024-08-10", destination_country: "United Arab Emirates", flight_number: "EK 202" },
  },

  {
    id: "sparse-see-pdf",
    from: "tickets@airtickets.com",
    subject: "Your e-ticket is attached",
    body: `
Dear Passenger,

Please find your e-ticket attached to this email as a PDF.
All booking details are contained in the attachment.

Booking reference: ATP-99871
    `,
    expected: { is_flight: false, departure_date: null, destination_country: null, flight_number: null },
  },

  {
    id: "amtrak-rail",
    from: "noreply@amtrak.com",
    subject: "Amtrak eTicket — Acela Express",
    body: `
Amtrak Booking Confirmation
Reservation Number: 1234567

Acela Express | Train 2154
New York Penn Station → Washington Union Station
Departure: May 20, 2024 at 7:00 AM
Business Class | Seat 12C

Passenger: Thomas Brady
    `,
    expected: { is_flight: false, departure_date: null, destination_country: null, flight_number: null },
  },

  {
    id: "cruise-ship",
    from: "reservations@carnival.com",
    subject: "Carnival Cruise Line — Booking Confirmation",
    body: `
BOOKING CONFIRMATION
Reservation #: CCL-8821099

Carnival Horizon — 7-Day Caribbean Cruise
Sail Date: November 3, 2024
Embarkation: Miami (Port of Miami)
Ports of Call: Nassau, Grand Turk, Amber Cove, La Romana

Stateroom: Ocean View, Deck 6
Guests: 2 adults
    `,
    expected: { is_flight: false, departure_date: null, destination_country: null, flight_number: null },
  },

  {
    id: "forwarded-gmail-noise",
    from: "friend@gmail.com",
    subject: "Fwd: Your Qatar Airways booking QR55Z",
    body: `
---------- Forwarded message ---------
From: noreply@qatarairways.com
Subject: Your Qatar Airways booking QR55Z
To: traveler@gmail.com

Booking Confirmation
Booking Reference: QR55Z
Passenger: Carlos Mendez

QR 702 | New York (JFK) → Doha (DOH)
Departure: February 14, 2024 | 22:15
Economy Class
    `,
    expected: { is_flight: true, departure_date: "2024-02-14", destination_country: "Qatar", flight_number: "QR 702" },
  },

  {
    id: "mileage-statement",
    from: "memberservices@aadvantage.com",
    subject: "Your January AAdvantage Statement",
    body: `
AAdvantage Member Statement — January 2024
Account: 1234567890
Member: Patricia Chen
Status: Gold

Miles earned this month: 8,450
Miles redeemed: 0
Current balance: 127,340 miles

Earning activity:
Jan 5  AA 100 JFK→LHR   3,450 miles
Jan 5  AA 101 LHR→JFK   3,450 miles
Jan 18 Shopping partner   1,550 miles

Miles expire: Never (active account)
    `,
    expected: { is_flight: false, departure_date: null, destination_country: null, flight_number: null },
  },
];
