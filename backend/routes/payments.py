import os
import jwt
import time
import stripe
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

router = APIRouter(prefix="/payments", tags=["payments"])

# Initialize Stripe once at import time (not per-request).
_stripe_key = os.environ.get("STRIPE_SECRET_KEY", "")
if _stripe_key and not _stripe_key.startswith("sk_test_...") and len(_stripe_key) >= 20:
    stripe.api_key = _stripe_key

# In-memory store: Stripe session_id → issued JWT. Claimed once via GET /payments/claim/{id}.
_pending_licenses: dict[str, str] = {}


class CheckoutRequest(BaseModel):
    price_type: str  # "onetime" | "monthly"


@router.post("/checkout")
async def create_checkout(req: CheckoutRequest) -> dict:
    stripe_key = os.environ.get("STRIPE_SECRET_KEY", "")
    if not stripe_key or stripe_key.startswith("sk_test_...") or len(stripe_key) < 20:
        raise HTTPException(status_code=503, detail="Payments not configured yet.")

    price_id = (
        os.environ.get("STRIPE_PRICE_ONETIME")
        if req.price_type == "onetime"
        else os.environ.get("STRIPE_PRICE_MONTHLY")
    )
    if not price_id or price_id.startswith("price_..."):
        raise HTTPException(status_code=503, detail="Stripe prices not configured yet.")

    session = stripe.checkout.Session.create(
        payment_method_types=["card"],
        line_items=[{"price": price_id, "quantity": 1}],
        mode="payment" if req.price_type == "onetime" else "subscription",
        # Stripe substitutes {CHECKOUT_SESSION_ID} server-side before redirecting.
        success_url="https://triptrace.app/success?session_id={CHECKOUT_SESSION_ID}",
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
        email = session.get("customer_email", "") or session.get("customer_details", {}).get("email", "")
        token = _issue_license(email, "paid")
        if session_id:
            _pending_licenses[session_id] = token

    return {"received": True}


@router.get("/claim/{session_id}")
async def claim_license(session_id: str) -> dict:
    """One-time endpoint: exchange a Stripe session ID for the issued license JWT."""
    token = _pending_licenses.pop(session_id, None)
    if not token:
        raise HTTPException(status_code=404, detail="License not found or already claimed.")
    return {"token": token}


def _issue_license(email: str, tier: str) -> str:
    secret = os.environ["JWT_SECRET"]
    payload = {
        "email": email,
        "tier": tier,
        "iat": int(time.time()),
        "exp": int(time.time()) + 365 * 24 * 3600,
    }
    return jwt.encode(payload, secret, algorithm="HS256")
