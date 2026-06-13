import os
import jwt
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from ai_client import extract_trips
from slowapi import Limiter
from slowapi.util import get_remote_address

router = APIRouter(prefix="/parse", tags=["parse"])
_limiter = Limiter(key_func=get_remote_address)


class ParseRequest(BaseModel):
    email_text: str
    license_token: str | None = None


@router.post("")
@_limiter.limit("20/minute")
async def parse_email(request: Request, req: ParseRequest) -> dict:
    # Require at least one AI provider key to be configured
    configured = any(os.environ.get(k) for k in ("GEMINI_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY"))
    if not configured:
        raise HTTPException(status_code=503, detail="AI parsing not configured — set GEMINI_API_KEY, GROQ_API_KEY, or OPENROUTER_API_KEY.")

    tier = _get_license_tier(req.license_token)

    try:
        result = await extract_trips(req.email_text, tier=tier)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    # email_text is not stored or logged — it goes out of scope here
    result["tier"] = tier
    return result


def _get_license_tier(token: str | None) -> str:
    """Return 'paid' if token is valid, 'free' otherwise. Never blocks the request."""
    if not token:
        return "free"
    secret = os.environ.get("JWT_SECRET", "")
    if not secret:
        return "free"
    try:
        payload = jwt.decode(token, secret, algorithms=["HS256"])
        return payload.get("tier", "paid")
    except jwt.PyJWTError:
        return "free"
