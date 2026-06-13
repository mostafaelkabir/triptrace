import { describe, it, expect } from "vitest";
import { getDefaultStartDate } from "../components/ScanStep.jsx";

describe("ScanStep default date range", () => {
  it("defaults From date to 5 years ago regardless of plan tier", () => {
    const start = getDefaultStartDate();
    const fiveYearsAgo = new Date();
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
    expect(start).toBe(fiveYearsAgo.toISOString().split("T")[0]);
  });
});
