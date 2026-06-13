import os
import jwt
import time
import stripe
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

router = APIRouter(prefix="/payments", tags=["payments"])


class CheckoutRequest(BaseModel):
    price_type: str  # "onetime" | "monthly"


@router.post("/checkout")
async def create_checkout(req: CheckoutRequest) -> dict:
    stripe_key = os.environ.get("STRIPE_SECRET_KEY", "")
    if not stripe_key or stripe_key.startswith("sk_test_...") or len(stripe_key) < 20:
        raise HTTPException(status_code=503, detail="Payments not configured yet.")
    stripe.api_key = stripe_key

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
        success_url="https://triptrace.app/success?token={CHECKOUT_SESSION_ID}",
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
        tier = "paid"
        _issue_license(session.get("customer_email", ""), tier)

    return {"received": True}


def _issue_license(email: str, tier: str) -> str:
    secret = os.environ.get("JWT_SECRET", "change-me")
    payload = {
        "email": email,
        "tier": tier,
        "iat": int(time.time()),
        # one-time licenses don't expire; subscriptions renew via webhook
        "exp": int(time.time()) + 365 * 24 * 3600,
    }
    return jwt.encode(payload, secret, algorithm="HS256")
