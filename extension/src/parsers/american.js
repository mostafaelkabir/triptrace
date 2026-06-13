export default {
  id: "american",
  name: "American Airlines",
  senderDomains: ["aa.com", "americanairlines.com", "email.aa.com", "notifications.aa.com"],
  subjectPatterns: [/reservation/i, /confirmation/i, /itinerary/i],
  extractors: {
    // "Record Locator: PQR456" or "Confirmation: PQR456"
    confirmationNumber: /(?:Record\s+Locator|Confirmation\s+(?:Code|Number|#)|PNR)[:\s#]+([A-Z0-9]{4,8})/i,
    // "Saturday, June 01, 2024" — departing block
    departureDate: /(?:DEPARTING|Departing|Outbound|Departure)[\s\S]{0,200}?\b((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)(?:day)?,?\s+\w{3,9}\.?\s+\d{1,2},?\s+\d{4}|\w{3,9}\.?\s+\d{1,2},?\s+\d{4})/i,
    returnDate: /(?:RETURNING|Returning|Return)[\s\S]{0,200}?\b((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)(?:day)?,?\s+\w{3,9}\.?\s+\d{1,2},?\s+\d{4}|\w{3,9}\.?\s+\d{1,2},?\s+\d{4})/i,
    originIATA: /\(([A-Z]{3})\)\s+to\b/i,
    destinationIATA: /\bto\s+[A-Za-z][^(]{0,60}\(([A-Z]{3})\)/i,
    passengerName: /(?:Passenger|Travell?er|Dear)[:\s]+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)+)/,

    flightNumber: /(?:^|\bflight\s+|[|]\s*)([A-Z]{2}\s?\d{1,4})\b/im,
    aircraftType: /(?:aircraft|equipment)[:\s]+([A-Za-z][A-Za-z0-9\s\-]{3,30})/i,
  },
  dateFormat: "EEEE, MMMM dd, yyyy",
  alternateDateFormats: ["EEEE, MMMM d, yyyy", "EEE, MMM d, yyyy", "MMM d, yyyy", "MMMM d, yyyy"],
};
