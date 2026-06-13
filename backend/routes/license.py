import os
import jwt
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/license", tags=["license"])


class VerifyRequest(BaseModel):
    token: str


@router.post("/verify")
async def verify_license(req: VerifyRequest) -> dict:
    secret = os.environ.get("JWT_SECRET", "")
    try:
        payload = jwt.decode(req.token, secret, algorithms=["HS256"])
        return {"valid": True, "tier": payload.get("tier", "paid")}
    except jwt.ExpiredSignatureError:
        return {"valid": False, "tier": None, "reason": "expired"}
    except jwt.PyJWTError:
        return {"valid": False, "tier": None, "reason": "invalid"}
