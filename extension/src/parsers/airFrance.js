export default {
  id: "airfrance",
  name: "Air France",
  senderDomains: ["airfrance.com", "airfrance.fr", "email.airfrance.com", "klm.com", "email.klm.com"],
  subjectPatterns: [/booking confirmation/i, /e-ticket/i, /itinerary/i, /your trip/i],
  extractors: {
    // "Booking Code: AFR999" or "Booking Reference: AFR999"
    confirmationNumber: /(?:Booking\s+(?:Code|Reference|Number)|PNR|Confirmation\s+(?:code|number))[:\s]+([A-Z0-9]{4,8})/i,
    // "09 Sep 2024" — outbound block. Air France often uses "dd MMM yyyy"
    departureDate: /(?:Outbound|Departing?|Departure|New York[^:]{0,60}\n)[\s\S]{0,150}?(\d{1,2}\s+\w{3,9}\.?\s+\d{4})/i,
    returnDate: /(?:Return|Inbound|Paris[^:]{0,60}\n)[\s\S]{0,150}?(\d{1,2}\s+\w{3,9}\.?\s+\d{4})/i,
    // "JFK →" or "JFK to" — origin before arrow
    originIATA: /\b([A-Z]{3})\s*[→–>]/,
    destinationIATA: /[→–>]\s*[A-Za-z][^(A-Z]{0,30}([A-Z]{3})\b/,
    passengerName: /(?:Passenger|Travell?er|Dear\s+(?:Mr\.?|Ms\.?|Mrs\.?)?\s*)[:\s]+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)+)/,

    flightNumber: /(?:^|\bflight\s+|[|]\s*)([A-Z]{2}\s?\d{1,4})\b/im,
    aircraftType: /(?:aircraft|equipment)[:\s]+([A-Za-z][A-Za-z0-9\s\-]{3,30})/i,
  },
  dateFormat: "dd MMM yyyy",
  alternateDateFormats: ["d MMM yyyy", "dd/MM/yyyy", "MMMM d, yyyy", "EEE, MMM d, yyyy"],
};
