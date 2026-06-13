// Parsers for booking aggregators: Expedia, Kayak, Google Flights, Booking.com

export const expedia = {
  id: "expedia",
  name: "Expedia",
  senderDomains: ["expedia.com", "expediamail.com", "expedia.co.uk"],
  subjectPatterns: [/booking confirmation/i, /itinerary/i, /your trip/i],
  extractors: {
    // "Itinerary # 7123456789012" (long numeric) or "Confirmation: ABC123"
    confirmationNumber: /(?:Itinerary\s*#\s*|Confirmation(?:\s+number)?[:\s#]+)(\d{6,15}|[A-Z0-9]{6,20})/i,
    // Expedia dates: "Thu, Mar 14, 2024" or "Thursday, March 14, 2024" or "Mar 14, 2024"
    departureDate: /(?:Departs?(?:ing)?|Departure|Outbound)[^\n]{0,30}\n?[^\n]{0,30}?(\w{3,10}\.?,?\s*\d{1,2},?\s+\d{4})/i,
    returnDate: /(?:Returns?(?:ing)?|Return\s+(?:flight|depart)|Inbound)[^\n]{0,30}\n?[^\n]{0,30}?(\w{3,10}\.?,?\s*\d{1,2},?\s+\d{4})/i,
    // IATA codes in parentheses: "(JFK)" or "(IST)"
    originIATA: /\(([A-Z]{3})\)[^\n(]{0,80}(?:→|to\b|-|→)/i,
    destinationIATA: /(?:→|to\s+)[^\n(]{0,60}\(([A-Z]{3})\)/i,
    passengerName: /(?:Travell?er(?:\s+name)?|Passenger|Guest|Booked\s+(?:for|by)|Dear\s+(?:Mr\.?|Ms\.?|Mrs\.?)?\s*)([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)+)/,

    flightNumber: /(?:^|\bflight\s+|[|]\s*)([A-Z]{2}\s?\d{1,4})\b/im,
    aircraftType: /(?:aircraft|equipment)[:\s]+([A-Za-z][A-Za-z0-9\s\-]{3,30})/i,
  },
  dateFormat: "MMM d, yyyy",
  alternateDateFormats: ["EEE, MMM d, yyyy", "EEEE, MMMM d, yyyy", "MMMM d, yyyy", "MMM d yyyy"],
};

export const kayak = {
  id: "kayak",
  name: "Kayak",
  senderDomains: ["kayak.com", "kayak.co.uk"],
  subjectPatterns: [/booking confirmation/i, /itinerary/i],
  extractors: {
    confirmationNumber: /(?:Booking|Confirmation|Record\s+Locator)[:\s#]+([A-Z0-9]{4,10})/i,
    departureDate: /(?:Departs?|Outbound)[:\s]+(\w{3,9}\.?\s+\d{1,2},?\s+\d{4})/i,
    returnDate: /(?:Returns?|Inbound)[:\s]+(\w{3,9}\.?\s+\d{1,2},?\s+\d{4})/i,
    originIATA: /\(([A-Z]{3})\)\s*(?:→|to|-)/i,
    destinationIATA: /(?:→|to\s+)[^(]{0,60}\(([A-Z]{3})\)/i,

    flightNumber: /(?:^|\bflight\s+|[|]\s*)([A-Z]{2}\s?\d{1,4})\b/im,
    aircraftType: /(?:aircraft|equipment)[:\s]+([A-Za-z][A-Za-z0-9\s\-]{3,30})/i,
  },
  dateFormat: "MMM d, yyyy",
  alternateDateFormats: ["EEE, MMM d, yyyy", "MMMM d, yyyy"],
};

export const googleFlights = {
  id: "google-flights",
  name: "Google Flights",
  senderDomains: ["google.com"],
  subjectPatterns: [/your flight itinerary/i, /trip to/i],
  extractors: {
    confirmationNumber: /(?:Confirmation|Record\s+Locator|PNR)[:\s#]+([A-Z0-9]{4,8})/i,
    departureDate: /(?:Departs?|Outbound)[:\s]+(\w{3,9}\.?\s+\d{1,2},?\s+\d{4})/i,
    returnDate: /(?:Returns?|Return\s+flight)[:\s]+(\w{3,9}\.?\s+\d{1,2},?\s+\d{4})/i,
    originIATA: /\(([A-Z]{3})\)\s*(?:→|to|-)/i,
    destinationIATA: /(?:→|to\s+)[^(]{0,60}\(([A-Z]{3})\)/i,

    flightNumber: /(?:^|\bflight\s+|[|]\s*)([A-Z]{2}\s?\d{1,4})\b/im,
    aircraftType: /(?:aircraft|equipment)[:\s]+([A-Za-z][A-Za-z0-9\s\-]{3,30})/i,
  },
  dateFormat: "MMM d, yyyy",
  alternateDateFormats: ["EEE, MMM d, yyyy", "MMMM d, yyyy"],
};

export const bookingCom = {
  id: "booking-com",
  name: "Booking.com",
  senderDomains: ["booking.com", "noreply.booking.com"],
  subjectPatterns: [/booking confirmation/i, /your booking/i],
  extractors: {
    confirmationNumber: /(?:Booking(?:\s+number)?|Confirmation(?:\s+number)?|PIN)[:\s#]+([0-9]{6,12})/i,
    departureDate: /(?:Check-?in|Arrival|Departs?)[:\s]+(\w{3,9}\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+\w{3,9}\s+\d{4})/i,
    returnDate: /(?:Check-?out|Departure|Returns?)[:\s]+(\w{3,9}\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+\w{3,9}\s+\d{4})/i,
    destinationIATA: /\(([A-Z]{3})\)/,

    flightNumber: /(?:^|\bflight\s+|[|]\s*)([A-Z]{2}\s?\d{1,4})\b/im,
    aircraftType: /(?:aircraft|equipment)[:\s]+([A-Za-z][A-Za-z0-9\s\-]{3,30})/i,
  },
  dateFormat: "MMM d, yyyy",
  alternateDateFormats: ["dd MMM yyyy", "MMMM d, yyyy"],
};
