import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

# Fail fast if JWT_SECRET is missing or too weak — prevents silent license forgery.
_jwt_secret = os.environ.get("JWT_SECRET", "")
if len(_jwt_secret) < 32:
    raise RuntimeError(
        "JWT_SECRET must be set to a random string of at least 32 characters. "
        "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
    )

from routes import parse, payments, license  # noqa: E402

app = FastAPI(title="TripTrace API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"chrome-extension://.*",
    allow_origins=["http://localhost:5173"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(parse.router)
app.include_router(payments.router)
app.include_router(license.router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/ai")
async def health_ai() -> dict:
    """Shows which AI providers are configured and their priority order."""
    import os
    providers = [
        {"name": "gemini-2.5-flash-lite", "priority": 1, "configured": bool(os.environ.get("GEMINI_API_KEY"))},
        {"name": "groq-llama-3.3-70b",    "priority": 2, "configured": bool(os.environ.get("GROQ_API_KEY"))},
        {"name": "openrouter-gemma-2-9b",  "priority": 3, "configured": bool(os.environ.get("OPENROUTER_API_KEY"))},
    ]
    active = [p for p in providers if p["configured"]]
    return {
        "providers": providers,
        "active_count": len(active),
        "primary": active[0]["name"] if active else None,
    }
