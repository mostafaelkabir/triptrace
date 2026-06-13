export default {
  id: "united",
  name: "United Airlines",
  senderDomains: ["united.com", "unitedairlines.com", "info.united.com", "notifications.united.com"],
  subjectPatterns: [/flight confirmation/i, /reservation/i, /itinerary/i],
  extractors: {
    // "Confirmation Number: ABCDE1" or "Confirmation: ABCDE1"
    confirmationNumber: /(?:Confirmation\s+(?:Number|#|Code)|Record\s+Locator)[:\s#]+([A-Z0-9]{4,8})/i,
    // "Wednesday, April 03, 2024" or "Apr 03, 2024" — departing block
    departureDate: /(?:Departing|Outbound|Departure)[\s\S]{0,200}?\b((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)(?:nesday|rsday|turday|nday|sday|day)?,?\s+\w+\.?\s+\d{1,2},?\s+\d{4}|\w{3,9}\.?\s+\d{1,2},?\s+\d{4})/i,
    // "Returning ... Wednesday, April 17, 2024"
    returnDate: /(?:Returning|Return|Inbound)[\s\S]{0,200}?\b((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)(?:nesday|rsday|turday|nday|sday|day)?,?\s+\w+\.?\s+\d{1,2},?\s+\d{4}|\w{3,9}\.?\s+\d{1,2},?\s+\d{4})/i,
    // "(EWR)" before arrow, "(LHR)" after arrow
    originIATA: /\(([A-Z]{3})\)\s*[→\-–>]/,
    destinationIATA: /[→\-–>]\s*[A-Za-z][^(]{0,60}\(([A-Z]{3})\)/,
    passengerName: /(?:Dear|Passenger|Travell?er)[:\s]+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)+)/,
    flightNumber: /(?:^|\bflight\s+|[|]\s*)([A-Z]{2}\s?\d{1,4})\b/im,
    aircraftType: /(?:aircraft|equipment)[:\s]+([A-Za-z][A-Za-z0-9\s\-]{3,30})/i,
  },
  dateFormat: "EEEE, MMMM dd, yyyy",
  alternateDateFormats: ["EEEE, MMMM d, yyyy", "MMM dd, yyyy", "MMM d, yyyy", "MMMM d, yyyy"],
};
