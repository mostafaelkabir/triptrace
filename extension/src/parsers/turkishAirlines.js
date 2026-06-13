export default {
  id: "turkish-airlines",
  name: "Turkish Airlines",
  senderDomains: ["thy.com", "turkishairlines.com"],
  subjectPatterns: [/booking confirmation/i, /e-ticket/i, /itinerary/i],
  extractors: {
    // PNR: ABC123 or Booking Reference: ABC123 or Booking Code: ABCDEF
    confirmationNumber: /(?:Booking\s+(?:Reference|Code|Number)|PNR|Reference\s+Number|Confirmation\s+(?:Code|Number))[:\s]+([A-Z0-9]{4,8})/i,
    // "Departure: 15 Mar 2024" or "Departure Date: March 15, 2024" or "Date: 15 Mar 2024"
    departureDate: /(?:Departure(?:\s+Date)?|Outbound[\s\S]{0,80}?Date)[:\s]+(\d{1,2}\s+\w{3,9}\.?\s+\d{4}|\w{3,9}\.?\s+\d{1,2},?\s+\d{4})/i,
    // Return flight section's date
    returnDate: /(?:Return\s+(?:Flight|Date)|Inbound[\s\S]{0,80}?Date)[\s\S]{0,200}?(?:Departure|Date)[:\s]+(\d{1,2}\s+\w{3,9}\.?\s+\d{4}|\w{3,9}\.?\s+\d{1,2},?\s+\d{4})/i,
    // Increase lookahead to 120 chars for IATA codes
    destinationIATA: /(?:To|Destination|Arrival|Arrives?)[^(]{0,120}\(([A-Z]{3})\)/i,
    originIATA: /(?:From|Origin|Departs?\s+from|Departure\s+Airport)[^(]{0,120}\(([A-Z]{3})\)/i,
    // "Passenger: JOHN DOE" or "Dear John Doe," or "Mr./Ms. LASTNAME FIRSTNAME"
    passengerName: /(?:Passenger(?:\s+name)?|Travell?er|Dear\s+(?:Mr\.?|Ms\.?|Mrs\.?)?\s*)([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)+)/,
    flightNumber: /(?:^|\bflight\s+|[|]\s*)([A-Z]{2}\s?\d{1,4})\b/im,
    aircraftType: /(?:aircraft|equipment)[:\s]+([A-Za-z][A-Za-z0-9\s\-]{3,30})/i,
  },
  dateFormat: "dd MMM yyyy",
  alternateDateFormats: ["MMMM d, yyyy", "dd.MM.yyyy", "MM/dd/yyyy", "d MMM yyyy"],
};
