import { describe, it, expect } from "vitest";
import { tripNeedsReview } from "../components/ReviewTable.jsx";

/**
 * Tests for ACC-H1: the `tripNeedsReview` helper that drives the amber badge.
 *
 * A trip needs review when any of:
 *   - trip._needs_review is truthy (set by backend V1–V3 pipeline)
 *   - departure_date is null/undefined
 *   - destination_country is null/undefined
 *
 * The badge is hidden for:
 *   - high-confidence trips with all key fields present and no flag
 *   - confirmed trips (user has already signed off)
 */
describe("tripNeedsReview", () => {
  it("returns true when _needs_review flag is set", () => {
    expect(tripNeedsReview({ _needs_review: true, departure_date: null, destination_country: null })).toBe(true);
  });

  it("returns true when departure_date is null", () => {
    expect(tripNeedsReview({ departure_date: null, destination_country: "Turkey" })).toBe(true);
  });

  it("returns true when destination_country is null", () => {
    expect(tripNeedsReview({ departure_date: "2024-03-14", destination_country: null })).toBe(true);
  });

  it("returns false for a complete high-confidence trip without the flag", () => {
    expect(tripNeedsReview({
      departure_date: "2024-03-14",
      destination_country: "Turkey",
      confidence: "high",
    })).toBe(false);
  });

  it("returns false for a confirmed trip even if _needs_review is set", () => {
    expect(tripNeedsReview({
      departure_date: null,
      destination_country: null,
      _needs_review: true,
      confirmed: true,
    })).toBe(false);
  });

  it("returns true when _needs_review is set even if both dates are present", () => {
    expect(tripNeedsReview({
      departure_date: "2024-03-14",
      destination_country: "France",
      _needs_review: true,
    })).toBe(true);
  });
});
