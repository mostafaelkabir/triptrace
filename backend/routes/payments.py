import os
import jwt
import time
import uuid
import stripe
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

router = APIRouter(prefix="/payments", tags=["payments"])

_stripe_key = os.environ.get("STRIPE_SECRET_KEY", "")
if _stripe_key and not _stripe_key.startswith("sk_test_...") and len(_stripe_key) >= 20:
    stripe.api_key = _stripe_key

_pending_licenses: dict[str, dict] = {}

# One product: Full History Pass — $4.99, covers all accounts, 12-month JWT
FULL_HISTORY_MONTHS = 60   # 5 years of email history
JWT_VALIDITY_MONTHS = 12   # license valid for 12 months from purchase


class CheckoutRequest(BaseModel):
    extension_id: str = ""   # chrome.runtime.id — embedded in Stripe success_url


@router.post("/checkout")
async def create_checkout(req: CheckoutRequest) -> dict:
    stripe_key = os.environ.get("STRIPE_SECRET_KEY", "")
    if not stripe_key or stripe_key.startswith("sk_test_...") or len(stripe_key) < 20:
        raise HTTPException(status_code=503, detail="Payments not configured yet.")

    price_id = os.environ.get("STRIPE_PRICE_FULLHISTORY", "")
    if not price_id or price_id.startswith("price_..."):
        raise HTTPException(status_code=503, detail="Stripe price not configured yet.")

    if req.extension_id:
        success_url = (
            f"chrome-extension://{req.extension_id}/success.html"
            f"?session_id={{CHECKOUT_SESSION_ID}}"
        )
    else:
        success_url = "https://triptrace.app/success?session_id={CHECKOUT_SESSION_ID}"

    session = stripe.checkout.Session.create(
        payment_method_types=["card"],
        line_items=[{"price": price_id, "quantity": 1}],
        mode="payment",
        success_url=success_url,
        cancel_url="https://triptrace.app/cancel",
    )
    return {"url": session.url}


@router.post("/webhook")
async def stripe_webhook(request: Request) -> dict:
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    webhook_secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "")

    try:
        event = stripe.Webhook.construct_event(payload, sig, webhook_secret)
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid webhook signature.")

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        session_id = session.get("id", "")
        email = (
            session.get("customer_email")
            or session.get("customer_details", {}).get("email", "")
        )
        token = _issue_license(email)
        if session_id:
            _pending_licenses[session_id] = {"token": token, "months_allowed": FULL_HISTORY_MONTHS}

    return {"received": True}


@router.get("/claim/{session_id}")
async def claim_license(session_id: str) -> dict:
    """One-time endpoint: exchange Stripe session ID for the issued license."""
    pending = _pending_licenses.pop(session_id, None)
    if not pending:
        raise HTTPException(status_code=404, detail="License not found or already claimed.")
    return pending


def _issue_license(email: str) -> str:
    secret = os.environ["JWT_SECRET"]
    now = int(time.time())
    payload = {
        "email": email,
        "tier": "paid",
        "months_allowed": FULL_HISTORY_MONTHS,
        "jti": str(uuid.uuid4()),
        "iat": now,
        "exp": now + JWT_VALIDITY_MONTHS * 30 * 24 * 3600,
    }
    return jwt.encode(payload, secret, algorithm="HS256")
