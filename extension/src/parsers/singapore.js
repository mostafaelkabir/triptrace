export default {
  id: "singapore-airlines",
  name: "Singapore Airlines",
  senderDomains: ["singaporeair.com", "mail.singaporeair.com", "singaporeairlines.com"],
  subjectPatterns: [/booking confirmation/i, /e-ticket/i, /itinerary/i],
  extractors: {
    confirmationNumber: /(?:Booking\s+(?:Reference|Number|Code)|PNR|Confirmation\s+(?:Code|Number))[:\s]+([A-Z0-9]{4,8})/i,
    departureDate: /(?:Departure|Outbound|Departing)[\s\S]{0,200}?(\d{1,2}\s+\w{3,9}\.?\s+\d{4})/i,
    returnDate: /(?:Return\s+(?:flight|journey)|Inbound|Returning)[\s\S]{0,200}?(\d{1,2}\s+\w{3,9}\.?\s+\d{4})/i,
    originIATA: /\(([A-Z]{3})\)\s*[→\-–>]/,
    destinationIATA: /[→\-–>]\s*[A-Za-z][^(]{0,60}\(([A-Z]{3})\)/,
    passengerName: /(?:Passenger(?:\s+name)?|Dear\s+(?:Mr\.?|Ms\.?|Mrs\.?)?\s*|Travell?er)[:\s]+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)+)/,
    flightNumber: /(?:^|\bflight\s+|[|]\s*)([A-Z]{2}\s?\d{1,4})\b/im,
    aircraftType: /(?:aircraft|equipment)[:\s]+([A-Za-z][A-Za-z0-9\s\-]{3,30})/i,
  },
  dateFormat: "dd MMM yyyy",
  alternateDateFormats: ["d MMM yyyy", "MMMM d, yyyy", "dd/MM/yyyy"],
};
