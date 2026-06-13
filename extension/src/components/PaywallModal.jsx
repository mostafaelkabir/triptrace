import React, { useState } from "react";
import { createCheckout } from "../api.js";

export default function PaywallModal({ dispatch }) {
  const [loading, setLoading] = useState(null); // "onetime" | "monthly" | null

  async function handleCheckout(priceType) {
    setLoading(priceType);
    try {
      const { url } = await createCheckout(priceType);
      if (url) window.open(url, "_blank");
    } catch {
      // leave modal open on error
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-xs w-full p-5 flex flex-col gap-4">
        <div className="text-center">
          <h2 className="text-base font-semibold">Unlock Full Access</h2>
          <p className="text-xs text-gray-500 mt-1">
            You hit the 10-trip free limit. Upgrade to scan all 5 years and see every trip.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={() => handleCheckout("onetime")}
            disabled={loading !== null}
            className="bg-blue-600 text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading === "onetime" ? "Opening…" : "$19 one-time"}
          </button>
          <button
            onClick={() => handleCheckout("monthly")}
            disabled={loading !== null}
            className="border border-blue-300 text-blue-700 rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-blue-50 disabled:opacity-50 transition-colors"
          >
            {loading === "monthly" ? "Opening…" : "$4.99 / month"}
          </button>
        </div>

        <button
          onClick={() => dispatch({ type: "HIDE_PAYWALL" })}
          className="text-xs text-gray-400 hover:text-gray-600 text-center"
        >
          Continue with free plan (10 trips)
        </button>
      </div>
    </div>
  );
}
