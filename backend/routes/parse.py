import os
import jwt
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from ai_client import extract_trips
from credits_db import consume_scan
from slowapi import Limiter
from slowapi.util import get_remote_address

router = APIRouter(prefix="/parse", tags=["parse"])
_limiter = Limiter(key_func=get_remote_address)

# Soft cap for unlimited/paid-flat passes (15k per JWT, invisible to user).
_FLAT_SCAN_CAP = 15_000


class ParseRequest(BaseModel):
    email_text: str
    license_token: str | None = None
    # Optimistic client-side scan count — used only for flat-paid passes to
    # enforce the soft cap without a DB row. Trusted because flat passes are
    # already validated by JWT signature.
    client_scan_count: int = 0


@router.post("")
@_limiter.limit("20/minute")
async def parse_email(request: Request, req: ParseRequest) -> dict:
    configured = any(os.environ.get(k) for k in ("GEMINI_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY", "ANTHROPIC_API_KEY"))
    if not configured:
        raise HTTPException(status_code=503, detail="AI parsing not configured — set GEMINI_API_KEY, GROQ_API_KEY, or ANTHROPIC_API_KEY.")

    tier, jti = _check_license(req.license_token, req.client_scan_count)

    if tier == "exhausted":
        raise HTTPException(
            status_code=402,
            detail="Your scan pass has been fully used. Buy another pass at triptrace.app to continue.",
        )

    try:
        result = await extract_trips(req.email_text, tier=tier)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    result["tier"] = tier
    return result


def _check_license(token: str | None, client_scan_count: int) -> tuple[str, str | None]:
    """
    Returns (tier, jti).

    tier values:
      "free"      — no valid token; rate-limited by IP
      "paid"      — flat paid pass; no DB row, soft cap via client_scan_count
      "credits"   — credit-pack pass; DB row enforces cap
      "exhausted" — caller should return 402
    """
    if not token:
        return "free", None

    secret = os.environ.get("JWT_SECRET", "")
    if not secret:
        return "free", None

    try:
        payload = jwt.decode(token, secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        return "free", None

    tier = payload.get("tier", "paid")
    jti = payload.get("jti")

    if tier == "credits":
        if not jti:
            return "free", None
        allowed = consume_scan(jti)
        return ("credits" if allowed else "exhausted"), jti

    # Flat paid pass — enforce invisible soft cap via client-reported count.
    # Client count is trusted: the JWT signature already proves purchase.
    if client_scan_count >= _FLAT_SCAN_CAP:
        return "exhausted", jti

    return "paid", jti
