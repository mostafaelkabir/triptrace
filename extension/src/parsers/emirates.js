export default {
  id: "emirates",
  name: "Emirates",
  senderDomains: ["emirates.com", "dnata.com", "email.emirates.com", "booking.emirates.com"],
  subjectPatterns: [/booking confirmation/i, /e-ticket/i, /itinerary/i],
  extractors: {
    // "Booking Reference: EMR123" or "PNR: EMR123"
    confirmationNumber: /(?:Booking\s+(?:Reference|Number|Code)|PNR|Reference\s+Number)[:\s]+([A-Z0-9]{4,8})/i,
    // "Date: 20 Jul 2024" in outbound block
    departureDate: /(?:Outbound\s+Flight|Departing|Departure)[\s\S]{0,200}?Date[:\s]+(\d{1,2}\s+\w{3,9}\.?\s+\d{4})/i,
    returnDate: /(?:Return\s+Flight|Returning|Inbound)[\s\S]{0,200}?Date[:\s]+(\d{1,2}\s+\w{3,9}\.?\s+\d{4})/i,
    // "Dubai (DXB)" then "to" then "New York (JFK)"
    originIATA: /\(([A-Z]{3})\)\s+to\b/i,
    destinationIATA: /\bto\s+[A-Za-z][^(]{0,60}\(([A-Z]{3})\)/i,
    passengerName: /(?:Passenger\s+Name|Dear\s+(?:Mr\.?|Ms\.?|Mrs\.?)?\s*|Travell?er)[:\s]+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)+)/,

    flightNumber: /(?:^|\bflight\s+|[|]\s*)([A-Z]{2}\s?\d{1,4})\b/im,
    aircraftType: /(?:aircraft|equipment)[:\s]+([A-Za-z][A-Za-z0-9\s\-]{3,30})/i,
  },
  dateFormat: "dd MMM yyyy",
  alternateDateFormats: ["d MMM yyyy", "dd/MM/yyyy", "MMMM d, yyyy"],
};
