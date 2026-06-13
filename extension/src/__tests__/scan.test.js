import { describe, it, expect, vi, beforeEach } from "vitest";
import { scanGmail, deduplicateTrips, mergeByThread, mergeByFields } from "../scan.js";

// Mock the email client index so scan.js gets our mock functions
const mockClient = {
  buildSearchQuery: vi.fn(() => "subject:(booking confirmation)"),
  searchEmails: vi.fn(),
  getEmailHeaders: vi.fn(),
  getEmailBody: vi.fn(),
  looksLikeConfirmation: vi.fn(() => true),
};
vi.mock("../emailClients/index.js", () => ({
  getEmailClient: vi.fn(() => mockClient),
}));

const gmail = mockClient;

const TURKISH_BODY = `
Booking Reference: ZZZ999
From: New York (JFK) To: Istanbul (IST)
Departure: 10 Apr 2024
Return Flight
Departure: 20 Apr 2024
Passenger: John Smith
`;

describe("mergeByThread", () => {
  it("merges 3 emails in the same thread into 1 trip", () => {
    const trips = [
      { _threadId: "t1", confirmation_number: "ABC", departure_date: "2024-04-10", destination_country: null },
      { _threadId: "t1", confirmation_number: null, departure_date: null, destination_country: "Turkey" },
      { _threadId: "t1", confirmation_number: null, departure_date: null, destination_country: null, return_date: "2024-04-20" },
    ];
    const result = mergeByThread(trips);
    expect(result).toHaveLength(1);
    expect(result[0].confirmation_number).toBe("ABC");
    expect(result[0].destination_country).toBe("Turkey");
    expect(result[0].departure_date).toBe("2024-04-10");
    expect(result[0].return_date).toBe("2024-04-20");
  });

  it("keeps trips without threadId as-is", () => {
    const trips = [
      { confirmation_number: "X1", departure_date: "2024-01-01" },
      { confirmation_number: "X2", departure_date: "2024-02-01" },
    ];
    expect(mergeByThread(trips)).toHaveLength(2);
  });
});

describe("mergeByFields", () => {
  it("merges trips with same departure_date + destination_country", () => {
    const trips = [
      { departure_date: "2024-04-10", destination_country: "Turkey", confirmation_number: "ABC", return_date: null },
      { departure_date: "2024-04-10", destination_country: "Turkey", confirmation_number: null, return_date: "2024-04-20" },
    ];
    const result = mergeByFields(trips);
    expect(result).toHaveLength(1);
    expect(result[0].confirmation_number).toBe("ABC");
    expect(result[0].return_date).toBe("2024-04-20");
  });

  it("keeps trips with null date/country as separate rows", () => {
    const trips = [
      { departure_date: null, destination_country: "Turkey" },
      { departure_date: null, destination_country: "Turkey" },
    ];
    expect(mergeByFields(trips)).toHaveLength(2);
  });
});

describe("deduplicateTrips", () => {
  it("removes trips with identical confirmation numbers", () => {
    const trips = [
      { confirmation_number: "ABC123", departure_date: "2024-03-15" },
      { confirmation_number: "ABC123", departure_date: "2024-03-15" },
      { confirmation_number: "XYZ456", departure_date: "2024-04-01" },
    ];
    const result = deduplicateTrips(trips);
    expect(result).toHaveLength(2);
  });

  it("keeps unmatched rows with null confirmation numbers as distinct", () => {
    const trips = [
      { confirmation_number: null, confidence: "unmatched", departure_date: "2024-03-15" },
      { confirmation_number: null, confidence: "unmatched", departure_date: "2024-04-10" },
    ];
    const result = deduplicateTrips(trips);
    expect(result).toHaveLength(2);
  });
});

describe("scanGmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: all bodies pass the confirmation check
    gmail.looksLikeConfirmation.mockReturnValue(true);
  });

  it("returns parsed trips for matched senders", async () => {
    gmail.searchEmails.mockResolvedValue([{ id: "msg1", threadId: "t1" }, { id: "msg2", threadId: "t2" }]);
    gmail.getEmailHeaders
      .mockResolvedValueOnce({ from: "booking@thy.com", subject: "Booking Confirmation", date: "" })
      .mockResolvedValueOnce({ from: "noreply@unknown.xyz", subject: "Sale!", date: "" });
    gmail.getEmailBody.mockResolvedValue(TURKISH_BODY);

    const trips = await scanGmail("token", {
      startDate: "2019-01-01",
      endDate: "2024-12-31",
      paywallLimit: null,
    });

    const parsed = trips.find((t) => t.airline === "Turkish Airlines");
    expect(parsed).toBeDefined();
    expect(parsed.confirmation_number).toBe("ZZZ999");
  });

  it("calls onProgress with scanned/found counts", async () => {
    gmail.searchEmails.mockResolvedValue([{ id: "msg1", threadId: "t1" }]);
    gmail.getEmailHeaders.mockResolvedValue({
      from: "booking@thy.com",
      subject: "Booking Confirmation",
      date: "",
    });
    gmail.getEmailBody.mockResolvedValue(TURKISH_BODY);

    const progress = [];
    await scanGmail(
      "token",
      { startDate: "2019-01-01", endDate: "2024-12-31", paywallLimit: null },
      (p) => progress.push(p)
    );

    expect(progress.length).toBeGreaterThan(0);
    expect(progress[progress.length - 1]).toMatchObject({ total: 1 });
  });

  it("respects paywallLimit", async () => {
    const ids = Array.from({ length: 15 }, (_, i) => ({ id: `msg${i}` }));
    gmail.searchEmails.mockResolvedValue(ids);
    gmail.getEmailHeaders.mockResolvedValue({
      from: "booking@thy.com",
      subject: "Booking Confirmation",
      date: "",
    });
    gmail.getEmailBody.mockResolvedValue(TURKISH_BODY);

    const trips = await scanGmail("token", {
      startDate: "2019-01-01",
      endDate: "2024-12-31",
      paywallLimit: 10,
    });

    expect(trips.length).toBeLessThanOrEqual(10);
  });

  it("skips emails that fail the confirmation body check", async () => {
    gmail.searchEmails.mockResolvedValue([{ id: "promo1" }, { id: "real1" }]);
    gmail.getEmailHeaders.mockResolvedValue({
      from: "deals@expedia.com",
      subject: "Flight Confirmation",
      date: "",
    });
    // First email is a promo (no flight signals), second is real
    gmail.getEmailBody.mockResolvedValue("Summer sale up to 40% off hotels");
    gmail.looksLikeConfirmation
      .mockReturnValueOnce(false) // promo1 rejected
      .mockReturnValueOnce(true); // real1 accepted
    gmail.getEmailBody
      .mockResolvedValueOnce("Summer sale up to 40% off hotels")
      .mockResolvedValueOnce(TURKISH_BODY);

    const trips = await scanGmail("token", {
      startDate: "2019-01-01",
      endDate: "2024-12-31",
      paywallLimit: null,
    });

    // Only the real confirmation should appear
    expect(trips).toHaveLength(1);
  });

  it("fetches body even for unmatched senders to check confirmation signals", async () => {
    gmail.searchEmails.mockResolvedValue([{ id: "msg1" }]);
    gmail.getEmailHeaders.mockResolvedValue({
      from: "noreply@unknownairline.xyz",
      subject: "Flight Confirmation",
      date: "",
    });
    gmail.getEmailBody.mockResolvedValue(TURKISH_BODY);

    await scanGmail("token", {
      startDate: "2019-01-01",
      endDate: "2024-12-31",
      paywallLimit: null,
    });

    // Body IS fetched for unmatched senders now (to run looksLikeConfirmation)
    expect(gmail.getEmailBody).toHaveBeenCalled();
  });
});
