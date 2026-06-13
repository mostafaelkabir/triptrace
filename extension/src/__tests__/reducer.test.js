import { describe, it, expect } from "vitest";
import { reducer } from "../App.jsx";

// Minimal initial state shape used in all tests
const BASE = {
  step: "review",
  accessToken: "tok",
  provider: "gmail",
  license: null,
  trips: [],
  dateRange: { startDate: "2019-01-01", endDate: "2024-12-31" },
  showPaywall: false,
};

function state(trips) {
  return { ...BASE, trips };
}

// ─── helpers ────────────────────────────────────────────────────────────────

function trip(overrides = {}) {
  return {
    departure_date: null,
    return_date: null,
    trip_type: null,
    origin_country: "United States",
    destination_country: null,
    airline: null,
    confirmation_number: null,
    passenger_name: null,
    confidence: "unmatched",
    confirmed: false,
    _emailId: null,
    _threadId: null,
    ...overrides,
  };
}

// ─── DEDUPLICATE action ──────────────────────────────────────────────────────

describe("DEDUPLICATE", () => {
  it("collapses rows that share the same confirmation_number", () => {
    const trips = [
      trip({ confirmation_number: "PNR123", departure_date: "2023-06-01" }),
      trip({ confirmation_number: "PNR123", destination_country: "Turkey" }),
      trip({ confirmation_number: "PNR123", return_date: "2023-06-14" }),
      trip({ confirmation_number: "OTHER", departure_date: "2022-01-01" }),
    ];
    const next = reducer(state(trips), { type: "DEDUPLICATE" });
    expect(next.trips).toHaveLength(2);

    const merged = next.trips.find((t) => t.confirmation_number === "PNR123");
    expect(merged).toBeDefined();
    expect(merged.departure_date).toBe("2023-06-01");
    expect(merged.destination_country).toBe("Turkey");
    expect(merged.return_date).toBe("2023-06-14");
  });

  it("leaves rows with null confirmation_number untouched", () => {
    const trips = [
      trip({ confirmation_number: null, departure_date: "2022-01-01" }),
      trip({ confirmation_number: null, departure_date: "2023-05-10" }),
    ];
    const next = reducer(state(trips), { type: "DEDUPLICATE" });
    expect(next.trips).toHaveLength(2);
  });

  it("keeps a single row unchanged", () => {
    const trips = [trip({ confirmation_number: "X1", departure_date: "2024-01-01" })];
    const next = reducer(state(trips), { type: "DEDUPLICATE" });
    expect(next.trips).toHaveLength(1);
  });
});

// ─── UPDATE_TRIP — duplicates stay visible until DEDUPLICATE ────────────────

describe("UPDATE_TRIP — duplicates stay visible (no auto-dedup)", () => {
  it("keeps both rows visible when AI fills a matching confirmation_number", () => {
    const trips = [
      trip({ confirmation_number: "PNR777", departure_date: "2023-08-01", destination_country: "France" }),
      trip({ confirmation_number: null, departure_date: "2023-08-01", _emailId: "msg2" }),
    ];
    const next = reducer(state(trips), {
      type: "UPDATE_TRIP",
      index: 1,
      fields: { confirmation_number: "PNR777", confidence: "ai-assisted", destination_country: "France" },
    });
    // Both rows remain — user sees the duplicate and can choose to Merge
    expect(next.trips).toHaveLength(2);
    expect(next.trips.every((t) => t.confirmation_number === "PNR777")).toBe(true);
  });

  it("DEDUPLICATE action then collapses them into one", () => {
    const trips = [
      trip({ confirmation_number: "PNR777", departure_date: "2023-08-01", destination_country: "France" }),
      trip({ confirmation_number: "PNR777", departure_date: "2023-08-01", destination_country: "France" }),
    ];
    const next = reducer(state(trips), { type: "DEDUPLICATE" });
    expect(next.trips).toHaveLength(1);
  });
});

// ─── JOIN_TRIPS action ───────────────────────────────────────────────────────

describe("JOIN_TRIPS", () => {
  it("creates a round-trip row with outbound departure and inbound departure as return", () => {
    const trips = [
      trip({ departure_date: "2024-04-03", destination_country: "Turkey", origin_country: "United States", trip_type: "one-way" }),
      trip({ departure_date: "2024-04-17", destination_country: "United States", origin_country: "Turkey", trip_type: "one-way" }),
    ];
    const next = reducer(state(trips), { type: "JOIN_TRIPS", indexA: 0, indexB: 1 });
    expect(next.trips).toHaveLength(1);

    const joined = next.trips[0];
    expect(joined.departure_date).toBe("2024-04-03");
    expect(joined.return_date).toBe("2024-04-17");
    expect(joined.trip_type).toBe("round-trip");
    expect(joined.destination_country).toBe("Turkey");
    expect(joined.origin_country).toBe("United States");
  });

  it("handles indices in either order — always sorts by departure_date", () => {
    const trips = [
      trip({ departure_date: "2024-09-20", destination_country: "United States", origin_country: "Germany" }),
      trip({ departure_date: "2024-09-05", destination_country: "Germany", origin_country: "United States" }),
    ];
    // indexA = later trip, indexB = earlier trip
    const next = reducer(state(trips), { type: "JOIN_TRIPS", indexA: 0, indexB: 1 });
    const joined = next.trips[0];
    expect(joined.departure_date).toBe("2024-09-05");
    expect(joined.return_date).toBe("2024-09-20");
    expect(joined.destination_country).toBe("Germany");
  });

  it("removes both original rows", () => {
    const trips = [
      trip({ departure_date: "2023-01-10", confirmation_number: "AA1" }),
      trip({ departure_date: "2023-01-20", confirmation_number: "AA2" }),
      trip({ departure_date: "2023-06-01", confirmation_number: "BB1" }),
    ];
    const next = reducer(state(trips), { type: "JOIN_TRIPS", indexA: 0, indexB: 1 });
    expect(next.trips).toHaveLength(2); // joined + BB1
    expect(next.trips.some((t) => t.confirmation_number === "BB1")).toBe(true);
  });

  it("inserts the joined row at the position of the lower index", () => {
    const trips = [
      trip({ departure_date: "2024-02-01", confirmation_number: "FIRST" }),
      trip({ departure_date: "2024-03-01", confirmation_number: "SECOND" }),
      trip({ departure_date: "2024-04-01", confirmation_number: "THIRD" }),
    ];
    const next = reducer(state(trips), { type: "JOIN_TRIPS", indexA: 1, indexB: 2 });
    expect(next.trips).toHaveLength(2);
    expect(next.trips[0].confirmation_number).toBe("FIRST");
    // joined is inserted at index 1 (min of 1,2)
    expect(next.trips[1].trip_type).toBe("round-trip");
  });

  it("deduplicates the same airline name instead of doubling it", () => {
    const trips = [
      trip({ airline: "Turkish Airlines", departure_date: "2024-05-01" }),
      trip({ airline: "Turkish Airlines", departure_date: "2024-05-15" }),
    ];
    const next = reducer(state(trips), { type: "JOIN_TRIPS", indexA: 0, indexB: 1 });
    expect(next.trips[0].airline).toBe("Turkish Airlines");
  });

  it("joins different airlines with a plus sign", () => {
    const trips = [
      trip({ airline: "Delta", departure_date: "2024-07-01" }),
      trip({ airline: "Emirates", departure_date: "2024-07-21" }),
    ];
    const next = reducer(state(trips), { type: "JOIN_TRIPS", indexA: 0, indexB: 1 });
    expect(next.trips[0].airline).toBe("Delta + Emirates");
  });

  it("joins different confirmation numbers with a plus sign", () => {
    const trips = [
      trip({ confirmation_number: "ABC123", departure_date: "2024-03-01" }),
      trip({ confirmation_number: "XYZ789", departure_date: "2024-03-14" }),
    ];
    const next = reducer(state(trips), { type: "JOIN_TRIPS", indexA: 0, indexB: 1 });
    expect(next.trips[0].confirmation_number).toBe("ABC123 + XYZ789");
  });

  it("sets confidence to manual on the joined row", () => {
    const trips = [
      trip({ departure_date: "2024-01-01", confidence: "ai-assisted" }),
      trip({ departure_date: "2024-01-10", confidence: "unmatched" }),
    ];
    const next = reducer(state(trips), { type: "JOIN_TRIPS", indexA: 0, indexB: 1 });
    expect(next.trips[0].confidence).toBe("manual");
  });

  it("uses passenger_name from the outbound leg when available", () => {
    const trips = [
      trip({ departure_date: "2024-06-01", passenger_name: "Jane Doe" }),
      trip({ departure_date: "2024-06-15", passenger_name: null }),
    ];
    const next = reducer(state(trips), { type: "JOIN_TRIPS", indexA: 0, indexB: 1 });
    expect(next.trips[0].passenger_name).toBe("Jane Doe");
  });
});

// ─── MERGE_GROUP action ──────────────────────────────────────────────────────

describe("MERGE_GROUP", () => {
  it("collapses all tickets with the same PNR into one row", () => {
    const trips = [
      trip({ confirmation_number: "PNR1", departure_date: "2024-04-01", destination_country: "Turkey" }),
      trip({ confirmation_number: "PNR1", departure_date: "2024-04-01", destination_country: "Turkey" }),
      trip({ confirmation_number: "PNR1", departure_date: "2024-04-01", destination_country: "Turkey" }),
      trip({ confirmation_number: "OTHER", departure_date: "2023-01-10" }),
    ];
    const next = reducer(state(trips), { type: "MERGE_GROUP", confirmationNumber: "PNR1" });
    expect(next.trips).toHaveLength(2);
    expect(next.trips.filter((t) => t.confirmation_number === "PNR1")).toHaveLength(1);
  });

  it("uses the earliest departure_date across all tickets in the group", () => {
    const trips = [
      trip({ confirmation_number: "ABC", departure_date: "2024-06-15" }),
      trip({ confirmation_number: "ABC", departure_date: "2024-06-10" }), // earliest
      trip({ confirmation_number: "ABC", departure_date: "2024-06-12" }),
    ];
    const next = reducer(state(trips), { type: "MERGE_GROUP", confirmationNumber: "ABC" });
    expect(next.trips[0].departure_date).toBe("2024-06-10");
  });

  it("uses the latest return_date across all tickets in the group", () => {
    const trips = [
      trip({ confirmation_number: "ABC", departure_date: "2024-05-01", return_date: "2024-05-10" }),
      trip({ confirmation_number: "ABC", departure_date: "2024-05-01", return_date: "2024-05-20" }), // latest
      trip({ confirmation_number: "ABC", departure_date: "2024-05-01", return_date: null }),
    ];
    const next = reducer(state(trips), { type: "MERGE_GROUP", confirmationNumber: "ABC" });
    expect(next.trips[0].return_date).toBe("2024-05-20");
  });

  it("treats last departure_date as return when no return_date but multiple legs", () => {
    // Delayed / rescheduled flights: 3 one-way tickets with different departure dates, no return
    const trips = [
      trip({ confirmation_number: "DEL1", departure_date: "2024-03-01", return_date: null }),
      trip({ confirmation_number: "DEL1", departure_date: "2024-03-03", return_date: null }), // rescheduled
      trip({ confirmation_number: "DEL1", departure_date: "2024-03-05", return_date: null }), // final departure
    ];
    const next = reducer(state(trips), { type: "MERGE_GROUP", confirmationNumber: "DEL1" });
    expect(next.trips[0].departure_date).toBe("2024-03-01"); // earliest
    expect(next.trips[0].return_date).toBe("2024-03-05");   // last leg treated as return
  });

  it("fills null fields from other records in the group", () => {
    const trips = [
      trip({ confirmation_number: "X1", departure_date: "2024-07-01", destination_country: null, airline: "Delta" }),
      trip({ confirmation_number: "X1", departure_date: null,          destination_country: "France", airline: null }),
    ];
    const next = reducer(state(trips), { type: "MERGE_GROUP", confirmationNumber: "X1" });
    const merged = next.trips[0];
    expect(merged.destination_country).toBe("France");
    expect(merged.airline).toBe("Delta");
    expect(merged.departure_date).toBe("2024-07-01");
  });

  it("sets confidence to 'merged' on the result row", () => {
    const trips = [
      trip({ confirmation_number: "M1", departure_date: "2024-08-01", confidence: "ai-assisted" }),
      trip({ confirmation_number: "M1", departure_date: "2024-08-01", confidence: "unmatched" }),
    ];
    const next = reducer(state(trips), { type: "MERGE_GROUP", confirmationNumber: "M1" });
    expect(next.trips[0].confidence).toBe("merged");
  });

  it("sets trip_type to round-trip when a return date is resolved", () => {
    const trips = [
      trip({ confirmation_number: "RT1", departure_date: "2024-09-01", return_date: "2024-09-14" }),
      trip({ confirmation_number: "RT1", departure_date: "2024-09-01", return_date: null }),
    ];
    const next = reducer(state(trips), { type: "MERGE_GROUP", confirmationNumber: "RT1" });
    expect(next.trips[0].trip_type).toBe("round-trip");
  });

  it("inserts the merged row at the position of the first matching ticket", () => {
    const trips = [
      trip({ confirmation_number: "FIRST",  departure_date: "2024-01-01" }),
      trip({ confirmation_number: "GROUP1", departure_date: "2024-03-01" }),
      trip({ confirmation_number: "GROUP1", departure_date: "2024-03-15" }),
      trip({ confirmation_number: "LAST",   departure_date: "2024-06-01" }),
    ];
    const next = reducer(state(trips), { type: "MERGE_GROUP", confirmationNumber: "GROUP1" });
    expect(next.trips).toHaveLength(3);
    expect(next.trips[0].confirmation_number).toBe("FIRST");
    expect(next.trips[1].confirmation_number).toBe("GROUP1"); // merged row at position 1
    expect(next.trips[2].confirmation_number).toBe("LAST");
  });

  it("does not affect other trips with different confirmation numbers", () => {
    const trips = [
      trip({ confirmation_number: "AAA", departure_date: "2024-02-01" }),
      trip({ confirmation_number: "AAA", departure_date: "2024-02-10" }),
      trip({ confirmation_number: "BBB", departure_date: "2024-05-01" }),
      trip({ confirmation_number: "BBB", departure_date: "2024-05-15" }),
    ];
    const next = reducer(state(trips), { type: "MERGE_GROUP", confirmationNumber: "AAA" });
    expect(next.trips).toHaveLength(3); // AAA merged to 1, BBB untouched (still 2)
    const bbbTrips = next.trips.filter((t) => t.confirmation_number === "BBB");
    expect(bbbTrips).toHaveLength(2);
  });

  it("prefers the most complete record as the base for field merging", () => {
    const trips = [
      // incomplete: only has departure
      trip({ confirmation_number: "BASE", departure_date: "2024-10-01", destination_country: null, passenger_name: null }),
      // complete: has all key fields
      trip({ confirmation_number: "BASE", departure_date: "2024-10-01", destination_country: "Italy", passenger_name: "John Smith", airline: "Alitalia" }),
    ];
    const next = reducer(state(trips), { type: "MERGE_GROUP", confirmationNumber: "BASE" });
    const merged = next.trips[0];
    expect(merged.destination_country).toBe("Italy");
    expect(merged.passenger_name).toBe("John Smith");
    expect(merged.airline).toBe("Alitalia");
  });
});
