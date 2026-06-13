import os
import json
import httpx

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

SYSTEM_PROMPT = """You are a travel record extractor for USCIS immigration forms.
The input is email text that may be messy — stripped HTML, collapsed whitespace, mixed languages, partial sentences. Extract flight booking information anyway.

Return ONLY a raw JSON object — no markdown, no code fences, no explanation, no trailing text.

Output schema (exactly this shape):
{
  "trips": [
    {
      "departure_date": "YYYY-MM-DD",
      "return_date": "YYYY-MM-DD or null",
      "trip_type": "one-way or round-trip or null",
      "origin_country": "full English country name",
      "destination_country": "full English country name",
      "airline": "airline name or null",
      "confirmation_number": "string or null",
      "passenger_name": "full name of traveler or null",
      "confidence": "high or low"
    }
  ]
}

Rules:
- Only record the outbound trip (origin → destination). If a return flight is clearly present, include return_date.
- trip_type: "one-way" if the email explicitly says one-way or has no return flight; "round-trip" if a return date or return flight is present; null if unclear.
- origin_country is where the outbound flight departs FROM (usually "United States")
- destination_country is the country being visited (the non-US country)
- IATA airport codes map to countries: IST/SAW = Turkey, LHR/LGW = United Kingdom, FRA/MUC = Germany, CDG/ORY = France, DXB = United Arab Emirates, AMS = Netherlands, FCO/MXP = Italy, MAD/BCN = Spain, YYZ/YVR = Canada, SYD/MEL = Australia, NRT/HND/KIX = Japan, ICN/GMP = South Korea, PVG/PEK/CAN = China, BOM/DEL = India, GRU/GIG = Brazil, MEX = Mexico, etc.
- City names also imply countries: Istanbul/Ankara = Turkey, London = UK, Paris = France, Berlin/Frankfurt/Munich = Germany, Dubai = UAE, Amsterdam = Netherlands, Rome/Milan = Italy, Madrid/Barcelona = Spain, Tokyo/Osaka = Japan, Seoul = South Korea, etc.
- Dates can appear in many formats — parse them all: "Mar 14, 2024", "14 Mar 2024", "March 14 2024", "Thu, Mar 14", "14/03/2024", "2024-03-14"
- Set confidence "high" if you found departure_date AND destination_country clearly
- Set confidence "low" if you're inferring from partial data (e.g. only city name, or only month+day without year)
- passenger_name: extract the traveler's full name if present (e.g. "Dear John Smith", "Passenger: JOHN SMITH", "Traveler: Jane Doe"). Use null if not found.
- NEVER return empty trips if there is ANY evidence of a flight booking (confirmation number, city pair, date near an airline name). Include the partial data with confidence "low".
- If truly no flight booking evidence exists, return {"trips": []}

Examples of messy input you should still parse:
- "Itinerary # 7234567890123 JFK IST Mar 14 2024 Turkish Airlines" → departure_date: 2024-03-14, destination_country: Turkey
- "Your trip to London Confirmation ABC123 Departs 15 Jun 2024" → destination_country: United Kingdom, departure_date: 2024-06-15
- "Frankfurt FRA New York JFK 10 Jun 2024 Order number 123-456" → origin_country: Germany, destination_country: United States, departure_date: 2024-06-10
"""

# Free model for all tiers — swap to a paid model for production paid users
FREE_MODEL = "google/gemma-4-31b-it:free"
PAID_MODEL = "google/gemma-4-31b-it:free"  # upgrade to e.g. anthropic/claude-3-haiku when live


async def extract_trips(email_text: str, tier: str = "free") -> dict:
    """Call AI via OpenRouter to extract trip records from an email body.
    The email_text is used only for this call and never persisted.
    Uses async httpx to avoid blocking the FastAPI event loop.
    """
    api_key = os.environ.get("OPENROUTER_API_KEY", "")
    model = PAID_MODEL if tier == "paid" else FREE_MODEL

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            OPENROUTER_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://triptrace.app",
                "X-Title": "TripTrace",
            },
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": f"Extract all trips from this email:\n\n{email_text}"},
                ],
                "max_tokens": 1024,
            },
        )

    if response.status_code == 429:
        raise RuntimeError("AI rate limit reached — wait a minute and try again.")
    if response.status_code == 402:
        raise RuntimeError("AI API out of credits — add funds at openrouter.ai.")
    response.raise_for_status()
    raw = response.json()["choices"][0]["message"]["content"].strip()

    # Strip markdown code fences if model wraps response in ``` ... ```
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[-1]
        raw = raw.rsplit("```", 1)[0].strip()

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"trips": []}
