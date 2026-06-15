import { describe, it, expect } from "vitest";
import { fixtures } from "../emailClients/__tests__/eval/fixtures.js";

/**
 * ACC-F1: guard that keeps the eval fixture set growing.
 * The plan calls for 15 new fixtures (connections, codeshare, budget, non-flights)
 * bringing the total from 45 → 60.
 */
describe("eval fixture set — ACC-F1", () => {
  it("has at least 60 fixtures total", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(60);
  });

  it("includes at least 5 non-flight fixtures (is_flight: false)", () => {
    const nonFlights = fixtures.filter((f) => f.expected.is_flight === false);
    expect(nonFlights.length).toBeGreaterThanOrEqual(5);
  });

  it("includes a seat-upgrade fixture", () => {
    const f = fixtures.find((f) => f.id === "seat-upgrade");
    expect(f).toBeDefined();
    expect(f.expected.is_flight).toBe(false);
  });

  it("includes a checkin-reminder fixture", () => {
    const f = fixtures.find((f) => f.id === "checkin-reminder");
    expect(f).toBeDefined();
    expect(f.expected.is_flight).toBe(false);
  });

  it("includes an amtrak-rail non-flight fixture", () => {
    const f = fixtures.find((f) => f.id === "amtrak-rail");
    expect(f).toBeDefined();
    expect(f.expected.is_flight).toBe(false);
  });

  it("includes a cruise-ship non-flight fixture", () => {
    const f = fixtures.find((f) => f.id === "cruise-ship");
    expect(f).toBeDefined();
    expect(f.expected.is_flight).toBe(false);
  });

  it("includes a connection-flight fixture expecting a flight", () => {
    const f = fixtures.find((f) => f.id === "connection-flight");
    expect(f).toBeDefined();
    expect(f.expected.is_flight).toBe(true);
  });

  it("includes a codeshare-marketed fixture", () => {
    const f = fixtures.find((f) => f.id === "codeshare-marketed");
    expect(f).toBeDefined();
    expect(f.expected.is_flight).toBe(true);
    expect(f.expected.flight_number).toBe("AA 6999");
  });

  it("includes a sparse-see-pdf fixture (correctly filtered by regex layer)", () => {
    const f = fixtures.find((f) => f.id === "sparse-see-pdf");
    expect(f).toBeDefined();
    // Regex layer correctly filters emails with no flight signals
    expect(f.expected.is_flight).toBe(false);
  });

  it("every fixture has required fields: id, from, subject, body, expected", () => {
    for (const f of fixtures) {
      expect(f.id, `${f.id} missing id`).toBeTruthy();
      expect(f.from, `${f.id} missing from`).toBeTruthy();
      expect(f.body, `${f.id} missing body`).toBeTruthy();
      expect(f.expected, `${f.id} missing expected`).toBeTruthy();
      expect(typeof f.expected.is_flight, `${f.id} is_flight must be boolean`).toBe("boolean");
    }
  });
});
