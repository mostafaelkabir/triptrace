import React, { useState } from "react";
import { createCheckout } from "../api.js";

const COPY = {
  "date-range": {
    headline: "Unlock your full 5-year history",
    sub: "Your free plan covers the last 6 months. For N-400, you need 5 years — unlock everything with one payment.",
  },
  "trip-limit": {
    headline: "See your complete travel history",
    sub: "You're on the free preview. Unlock your full 5-year travel record for your N-400 application.",
  },
  exhausted: {
    headline: "Your scan pass has expired",
    sub: "Your 12-month license has expired. Buy a new pass to scan your inbox again.",
  },
};

export default function PaywallModal({ dispatch, reason = "trip-limit" }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const extensionId =
    typeof chrome !== "undefined" && chrome.runtime?.id ? chrome.runtime.id : "";

  const { headline, sub } = COPY[reason] ?? COPY["trip-limit"];

  async function handleCheckout() {
    setLoading(true);
    setError(null);
    try {
      const { url } = await createCheckout("fullhistory", extensionId);
      if (url) window.open(url, "_blank");
    } catch {
      setError("Could not open checkout — check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-xs w-full p-5 flex flex-col gap-4">

        <div className="text-center">
          <div className="text-3xl mb-2">✈️</div>
          <h2 className="text-base font-semibold leading-snug">{headline}</h2>
          <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{sub}</p>
        </div>

        <button
          onClick={handleCheckout}
          disabled={loading}
          className="bg-blue-600 text-white rounded-lg px-4 py-3 font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors flex flex-col items-center gap-0.5"
        >
          <span className="text-sm">{loading ? "Opening Stripe…" : "Unlock Full 5-Year History"}</span>
          <span className="text-xs font-normal text-blue-200">$4.99 · one-time · no subscription</span>
        </button>

        {error && <p className="text-red-500 text-xs text-center">{error}</p>}

        <div className="text-center text-xs text-gray-400 space-y-1">
          <p>Covers both Gmail and Outlook · License valid 12 months</p>
          <button
            onClick={() => dispatch({ type: "HIDE_PAYWALL" })}
            className="underline hover:text-gray-600"
          >
            Continue with free plan (last 6 months)
          </button>
        </div>
      </div>
    </div>
  );
}
