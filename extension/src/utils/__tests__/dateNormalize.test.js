import { describe, it, expect } from "vitest";
import { normalizeDate } from "../dateNormalize.js";

describe("normalizeDate", () => {
  it("parses DD MMM YYYY", () => {
    expect(normalizeDate("15 Mar 2024", "dd MMM yyyy")).toBe("2024-03-15");
  });

  it("parses MMM DD YYYY", () => {
    expect(normalizeDate("Mar 15 2024", "MMM dd yyyy")).toBe("2024-03-15");
  });

  it("parses DD/MM/YYYY", () => {
    expect(normalizeDate("15/03/2024", "dd/MM/yyyy")).toBe("2024-03-15");
  });

  it("parses MM/DD/YYYY", () => {
    expect(normalizeDate("03/15/2024", "MM/dd/yyyy")).toBe("2024-03-15");
  });

  it("passes through ISO 8601", () => {
    expect(normalizeDate("2024-03-15", "yyyy-MM-dd")).toBe("2024-03-15");
  });

  it("returns null on empty input", () => {
    expect(normalizeDate("", "dd MMM yyyy")).toBeNull();
  });

  it("returns null on null input", () => {
    expect(normalizeDate(null, "dd MMM yyyy")).toBeNull();
  });

  it("returns null on unparseable string", () => {
    expect(normalizeDate("not a date", "dd MMM yyyy")).toBeNull();
  });

  it("handles full month names in DD MMMM YYYY", () => {
    expect(normalizeDate("15 March 2024", "dd MMMM yyyy")).toBe("2024-03-15");
  });
});
