export default {
  id: "british-airways",
  name: "British Airways",
  senderDomains: ["britishairways.com", "ba.com", "email.britishairways.com"],
  subjectPatterns: [/booking confirmation/i, /e-ticket/i, /itinerary/i],
  extractors: {
    // "Booking reference: BAREF1" or "PNR: BAREF1"
    confirmationNumber: /(?:Booking\s+reference|PNR|Confirmation\s+(?:number|code|reference))[:\s]+([A-Z0-9]{4,8})/i,
    // "Outbound: ... 15 Oct 2024" or "Departure: 15 Oct 2024"
    departureDate: /(?:Outbound|Departing?|Departure)[\s\S]{0,200}?(\d{1,2}\s+\w{3,9}\.?\s+\d{4})/i,
    returnDate: /(?:Return|Inbound|Returning)[\s\S]{0,200}?(\d{1,2}\s+\w{3,9}\.?\s+\d{4})/i,
    originIATA: /\(([A-Z]{3})\)\s+to\b/i,
    destinationIATA: /\bto\s+[A-Za-z][^(]{0,60}\(([A-Z]{3})\)/i,
    passengerName: /(?:Dear\s+(?:Mr\.?|Ms\.?|Mrs\.?)?\s*|Passenger|Travell?er)[:\s]+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)+)/,

    flightNumber: /(?:^|\bflight\s+|[|]\s*)([A-Z]{2}\s?\d{1,4})\b/im,
    aircraftType: /(?:aircraft|equipment)[:\s]+([A-Za-z][A-Za-z0-9\s\-]{3,30})/i,
  },
  dateFormat: "dd MMM yyyy",
  alternateDateFormats: ["d MMM yyyy", "dd/MM/yyyy", "MMMM d, yyyy", "EEE d MMM yyyy"],
};
