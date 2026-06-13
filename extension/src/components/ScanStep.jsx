import React, { useState } from "react";

const FREE_TRIP_LIMIT_DEFAULT = 10;
const FREE_MONTHS = 6;

export function getDefaultStartDate() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 5);
  return d.toISOString().split("T")[0];
}

function getFreeMonthsCutoff() {
  const d = new Date();
  d.setMonth(d.getMonth() - FREE_MONTHS);
  return d.toISOString().split("T")[0];
}

function providerLabel(provider) {
  if (provider === "outlook") return "Outlook";
  return "Gmail";
}

async function signOut(dispatch, provider = "gmail") {
  if (typeof chrome !== "undefined" && chrome.identity) {
    const msgType = provider === "outlook" ? "REMOVE_OUTLOOK_TOKEN" : "REMOVE_AUTH_TOKEN";
    await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: msgType }, resolve);
    });
  }
  dispatch({ type: "DISCONNECT" });
}

export default function ScanStep({
  accessToken,
  provider = "gmail",
  dateRange,
  isPaid,
  isDevMode = false,
  freeTripLimit = FREE_TRIP_LIMIT_DEFAULT,
  dispatch,
  onStartJob,
}) {
  const [error, setError] = useState(null);

  const isUnlocked = isPaid || isDevMode;
  const today = new Date().toISOString().split("T")[0];
  const [startDate, setStartDate] = useState(dateRange?.startDate ?? getDefaultStartDate());
  const [endDate, setEndDate] = useState(today);

  const effectiveStartDate = isUnlocked ? startDate : getFreeMonthsCutoff();

  async function handleScan() {
    setError(null);
    try {
      await onStartJob({
        token: accessToken,
        provider,
        dateRange: { startDate: effectiveStartDate, endDate },
        isUnlocked,
      });
    } catch (err) {
      if (err.message?.includes("401") || err.message?.includes("auth")) {
        setError(`Session expired. Please reconnect your ${providerLabel(provider)} account.`);
        dispatch({ type: "DISCONNECT" });
      } else {
        setError(err.message || "Scan failed. Please try again.");
      }
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold mb-1">Scan for flight confirmations</h2>
          <p className="text-gray-500 text-xs">
            TripTrace searches your {providerLabel(provider)} for booking
            confirmation emails within the date range below.
          </p>
        </div>
        <button
          onClick={() => signOut(dispatch, provider)}
          className="shrink-0 text-xs text-gray-400 hover:text-red-500 underline"
        >
          Sign out
        </button>
      </div>

      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-600">From</span>
          <input
            type="date"
            value={startDate}
            max={endDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-600">To</span>
          <input
            type="date"
            value={endDate}
            max={today}
            onChange={(e) => setEndDate(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm"
          />
        </label>
        {!isUnlocked && (
          <p className="text-xs text-amber-600">
            Free plan: scans the last {FREE_MONTHS} months and shows up to {freeTripLimit} trips.{" "}
            <button onClick={() => dispatch({ type: "SHOW_PAYWALL" })} className="underline font-medium">
              Upgrade for full 5-year scan →
            </button>
          </p>
        )}
        {isDevMode && (
          <p className="text-xs text-emerald-600 font-medium">⚙ Dev mode — all limits bypassed</p>
        )}
      </div>

      <button
        onClick={handleScan}
        className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors"
      >
        Start Scan
      </button>

      <p className="text-xs text-gray-400 -mt-2">
        Scan runs in the background — you can switch providers or review results while it runs.
      </p>

      {error && <p className="text-red-600 text-xs">{error}</p>}
    </div>
  );
}
