export default {
  id: "jetblue",
  name: "JetBlue",
  senderDomains: ["jetblue.com", "email.jetblue.com", "jetblueairways.com"],
  subjectPatterns: [/confirmation/i, /itinerary/i, /booking/i],
  extractors: {
    confirmationNumber: /(?:Confirmation(?:\s+Code|Number)?|Record\s+Locator)[:\s#]+([A-Z0-9]{4,8})/i,
    departureDate: /(?:DEPARTS?|Departing?|Outbound)[\s\S]{0,200}?\b((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)(?:day)?,?\s+\w{3,9}\.?\s+\d{1,2},?\s+\d{4}|\w{3,9}\.?\s+\d{1,2},?\s+\d{4})/i,
    returnDate: /(?:RETURNS?|Returning?|Inbound)[\s\S]{0,200}?\b((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)(?:day)?,?\s+\w{3,9}\.?\s+\d{1,2},?\s+\d{4}|\w{3,9}\.?\s+\d{1,2},?\s+\d{4})/i,
    originIATA: /\(([A-Z]{3})\)\s+to\b/i,
    destinationIATA: /\bto\s+[A-Za-z][^(]{0,60}\(([A-Z]{3})\)/i,
    passengerName: /(?:Passenger|Travell?er|Dear)[:\s]+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)+)/,
    flightNumber: /(?:^|\bflight\s+|[|]\s*)([A-Z]{2}\s?\d{1,4})\b/im,
    aircraftType: /(?:aircraft|equipment)[:\s]+([A-Za-z][A-Za-z0-9\s\-]{3,30})/i,
  },
  dateFormat: "EEE, MMM d, yyyy",
  alternateDateFormats: ["EEEE, MMMM d, yyyy", "MMM d, yyyy", "MMMM d, yyyy"],
};
