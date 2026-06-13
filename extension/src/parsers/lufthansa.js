export default {
  id: "lufthansa",
  name: "Lufthansa",
  senderDomains: ["lufthansa.com", "m.lufthansa.com", "miles-and-more.com"],
  subjectPatterns: [/booking confirmation/i, /order number/i, /e-ticket/i],
  extractors: {
    // "Order number 123-4567890" or numeric-only order numbers
    confirmationNumber: /(?:Order\s+(?:number|no\.?)|Booking\s+(?:reference|number|code)|PNR)[:\s]+([A-Z0-9][\-A-Z0-9]{3,12})/i,
    // "Departure: 10 Jun 2024" or "Date: 10 Jun 2024" — outbound block
    departureDate: /(?:Departure|Outbound[\s\S]{0,100}?Date|^Date)[:\s]+(\d{1,2}\s+\w{3,9}\.?\s+\d{4})/im,
    // Return block date
    returnDate: /(?:Return\s+(?:flight|journey)|Inbound)[\s\S]{0,200}?(?:Departure|Date)[:\s]+(\d{1,2}\s+\w{3,9}\.?\s+\d{4})/i,
    // "Frankfurt (FRA)" before arrow
    originIATA: /\(([A-Z]{3})\)\s*[→\-–]/,
    destinationIATA: /[→\-–]\s*[A-Za-z][\w\s,]{0,40}\(([A-Z]{3})\)/,
    passengerName: /(?:Passenger(?:\s+name)?|Travell?er|Booked\s+for|Dear\s+(?:Mr\.?|Ms\.?|Mrs\.?)?\s*)([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)+)/,

    flightNumber: /(?:^|\bflight\s+|[|]\s*)([A-Z]{2}\s?\d{1,4})\b/im,
    aircraftType: /(?:aircraft|equipment)[:\s]+([A-Za-z][A-Za-z0-9\s\-]{3,30})/i,
  },
  dateFormat: "dd MMM yyyy",
  alternateDateFormats: ["d MMM yyyy", "MMMM d, yyyy", "dd.MM.yyyy"],
};
