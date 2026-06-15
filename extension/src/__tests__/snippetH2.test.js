import { describe, it, expect } from "vitest";
import { buildSnippet, snippetShouldShow } from "../components/ReviewTable.jsx";

/**
 * Tests for ACC-H2: collapsible email snippet for _needs_review trips.
 *
 * Two exported helpers:
 *   buildSnippet(body: string): string
 *     - Returns first 300 non-whitespace-collapsed chars of the body
 *     - Returns "" when body is null/undefined/empty
 *
 *   snippetShouldShow(trip): boolean
 *     - Returns true only when trip._needs_review AND trip._snippet is non-empty
 *     - Returns false when confirmed (badge already dismissed)
 */
describe("buildSnippet", () => {
  it("returns first 300 chars when body is longer", () => {
    const body = "A".repeat(400);
    expect(buildSnippet(body)).toHaveLength(300);
  });

  it("returns the full body when shorter than 300 chars", () => {
    const body = "Short email body.";
    expect(buildSnippet(body)).toBe("Short email body.");
  });

  it("returns empty string for null body", () => {
    expect(buildSnippet(null)).toBe("");
  });

  it("returns empty string for undefined body", () => {
    expect(buildSnippet(undefined)).toBe("");
  });

  it("returns empty string for empty string body", () => {
    expect(buildSnippet("")).toBe("");
  });

  it("collapses leading whitespace before truncating", () => {
    const body = "   " + "B".repeat(400);
    const result = buildSnippet(body);
    expect(result.startsWith("B")).toBe(true);
    expect(result).toHaveLength(300);
  });
});

describe("snippetShouldShow", () => {
  it("returns true when _needs_review and _snippet are both set", () => {
    expect(snippetShouldShow({ _needs_review: true, _snippet: "Booking ref: ABC123..." })).toBe(true);
  });

  it("returns false when _needs_review is false", () => {
    expect(snippetShouldShow({ _needs_review: false, _snippet: "Booking ref: ABC123..." })).toBe(false);
  });

  it("returns false when _snippet is empty string", () => {
    expect(snippetShouldShow({ _needs_review: true, _snippet: "" })).toBe(false);
  });

  it("returns false when _snippet is absent", () => {
    expect(snippetShouldShow({ _needs_review: true })).toBe(false);
  });

  it("returns false when trip is confirmed even if _needs_review and _snippet are set", () => {
    expect(snippetShouldShow({ _needs_review: true, _snippet: "text", confirmed: true })).toBe(false);
  });
});
