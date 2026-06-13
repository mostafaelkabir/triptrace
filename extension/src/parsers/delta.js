export default {
  id: "delta",
  name: "Delta Air Lines",
  senderDomains: ["delta.com", "notify.delta.com", "news.delta.com", "email.delta.com"],
  subjectPatterns: [/flight confirmation/i, /itinerary/i, /booking/i],
  extractors: {
    // "Confirmation #: XYZ789" or "Confirmation Code: XYZ789"
    confirmationNumber: /(?:Confirmation\s+(?:#|Number|Code)|Record\s+Locator)[:\s#]+([A-Z0-9]{4,8})/i,
    // "Fri, May 10, 2024" or "May 10, 2024" — departing block
    departureDate: /(?:Departing|Outbound|Departure)\s+(?:Flight)?[\s\S]{0,200}?\b((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+\w{3,9}\.?\s+\d{1,2},?\s+\d{4}|\w{3,9}\.?\s+\d{1,2},?\s+\d{4})/i,
    returnDate: /(?:Returning|Return)\s+(?:Flight)?[\s\S]{0,200}?\b((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+\w{3,9}\.?\s+\d{1,2},?\s+\d{4}|\w{3,9}\.?\s+\d{1,2},?\s+\d{4})/i,
    originIATA: /\(([A-Z]{3})\)\s+to\b/i,
    destinationIATA: /\bto\s+[A-Za-z][^(]{0,50}\(([A-Z]{3})\)/i,
    passengerName: /(?:Passenger|Travell?er|Dear)[:\s]+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)+)/,

    flightNumber: /(?:^|\bflight\s+|[|]\s*)([A-Z]{2}\s?\d{1,4})\b/im,
    aircraftType: /(?:aircraft|equipment)[:\s]+([A-Za-z][A-Za-z0-9\s\-]{3,30})/i,
  },
  dateFormat: "EEE, MMM d, yyyy",
  alternateDateFormats: ["EEE, MMM dd, yyyy", "MMM d, yyyy", "MMM dd, yyyy", "MMMM d, yyyy", "EEEE, MMMM d, yyyy"],
};
