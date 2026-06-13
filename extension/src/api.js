const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function apiFetch(path, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.detail ?? `API error ${res.status}`);
  }
  return res.json();
}

export async function parseWithAI(emailText, licenseToken) {
  return apiFetch("/parse", {
    email_text: emailText,
    license_token: licenseToken ?? null,
  });
}

export async function createCheckout(priceType) {
  return apiFetch("/payments/checkout", { price_type: priceType });
}

export async function verifyLicense(token) {
  return apiFetch("/license/verify", { token });
}

export async function claimLicense(sessionId) {
  const res = await fetch(`${API_URL}/payments/claim/${encodeURIComponent(sessionId)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.detail ?? `Claim error ${res.status}`);
  }
  return res.json();
}
