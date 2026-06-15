import React, { useState } from "react";

export function getDefaultStartDate() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 5);
  return d.toISOString().split("T")[0];
}

function monthsAgoDate(months) {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().split("T")[0];
}

function providerLabel(provider) {
  return provider === "outlook" ? "Outlook" : "Gmail";
}

async function signOut(dispatch, provider = "gmail") {
  if (typeof chrome !== "undefined" && chrome.identity) {
    const msgType = provider === "outlook" ? "REMOVE_OUTLOOK_TOKEN" : "REMOVE_AUTH_TOKEN";
    await new Promise((resolve) => chrome.runtime.sendMessage({ type: msgType }, resolve));
  }
  dispatch({ type: "DISCONNECT" });
}

async function requestToken(provider) {
  if (typeof chrome === "undefined" || !chrome.identity) {
    throw new Error("Chrome Identity API unavailable. Load as a Chrome extension.");
  }
  const msgType = provider === "outlook" ? "GET_OUTLOOK_TOKEN" : "GET_AUTH_TOKEN";
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: msgType }, (response) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else if (response?.error) reject(new Error(response.error));
      else if (response?.token) resolve(response.token);
      else reject(new Error("No token returned."));
    });
  });
}

const PROVIDER_ICONS = {
  gmail: (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 5.5L5.5 19v24h11V26.5l7.5 5.5 7.5-5.5V43h11V19z"/>
      <path fill="#FBBC05" d="M5.5 19L24 5.5 42.5 19v5.5L24 19 5.5 24.5z"/>
      <path fill="#34A853" d="M36.5 43h6V19l-6 5.5z"/>
      <path fill="#4285F4" d="M5.5 43h6V24.5L5.5 19z"/>
    </svg>
  ),
  outlook: (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 48 48">
      <rect x="2" y="8" width="26" height="32" rx="2" fill="#0078D4"/>
      <path fill="#fff" d="M15 16a7 7 0 100 16 7 7 0 000-16zm0 12a5 5 0 110-10 5 5 0 010 10z"/>
      <rect x="28" y="8" width="18" height="32" rx="2" fill="#50D9FF" opacity=".35"/>
      <rect x="30" y="16" width="14" height="2" rx="1" fill="#0078D4"/>
      <rect x="30" y="21" width="14" height="2" rx="1" fill="#0078D4"/>
      <rect x="30" y="26" width="14" height="2" rx="1" fill="#0078D4"/>
    </svg>
  ),
};

export default function ScanStep({
  accessToken,
  provider = "gmail",
  dateRange,
  monthsAllowed = 6,      // 6 = free tier, 60 = paid (5 years)
  isPaid = false,
  isDevMode = false,
  dispatch,
  onStartJob,
  activeJobs = [],
}) {
  const [error, setError] = useState(null);
  const [secondaryState, setSecondaryState] = useState("idle");
  const [secondaryError, setSecondaryError] = useState(null);

  const isUnlocked = isPaid || isDevMode;
  const today = new Date().toISOString().split("T")[0];
  const earliestAllowed = monthsAgoDate(isDevMode ? 60 : monthsAllowed);

  const [startDate, setStartDate] = useState(() => {
    const saved = dateRange?.startDate ?? getDefaultStartDate();
    // Clamp saved date to what's allowed
    return saved < earliestAllowed ? earliestAllowed : saved;
  });
  const [endDate, setEndDate] = useState(today);

  const otherProvider = provider === "gmail" ? "outlook" : "gmail";
  const otherJobRunning = activeJobs.some((j) => j.provider === otherProvider);
  const primaryJobRunning = activeJobs.some((j) => j.provider === provider);

  function handleStartDateChange(val) {
    if (!isUnlocked && val < earliestAllowed) {
      // User tried to go back further than allowed — show paywall
      dispatch({ type: "SHOW_PAYWALL", reason: "date-range" });
      return;
    }
    setStartDate(val);
  }

  async function handleScan() {
    setError(null);
    try {
      await onStartJob({
        token: accessToken,
        provider,
        dateRange: { startDate, endDate },
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

  async function handleConnectOther() {
    setSecondaryState("connecting");
    setSecondaryError(null);
    try {
      const token = await requestToken(otherProvider);
      setSecondaryState("scanning");
      await onStartJob({
        token,
        provider: otherProvider,
        dateRange: { startDate, endDate },
        isUnlocked,
      });
    } catch (err) {
      setSecondaryState("error");
      setSecondaryError(err.message || `Failed to connect ${providerLabel(otherProvider)}.`);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold mb-1">Scan for flight confirmations</h2>
          <p className="text-gray-500 text-xs">
            TripTrace searches your {providerLabel(provider)} for booking confirmation emails.
          </p>
        </div>
        <button
          onClick={() => signOut(dispatch, provider)}
          className="shrink-0 text-xs text-gray-400 hover:text-red-500 underline"
        >
          Sign out
        </button>
      </div>

      {/* Date range */}
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-600">From</span>
          <input
            type="date"
            value={startDate}
            min={isUnlocked ? undefined : earliestAllowed}
            max={endDate}
            onChange={(e) => handleStartDateChange(e.target.value)}
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

        {/* License status line */}
        {isDevMode ? (
          <p className="text-xs text-emerald-600 font-medium">⚙ Dev mode — all limits bypassed</p>
        ) : isUnlocked ? (
          <p className="text-xs text-green-600 font-medium">✓ Full history unlocked — scan up to 5 years</p>
        ) : (
          <p className="text-xs text-amber-600">
            Free plan: last 6 months only.{" "}
            <button
              onClick={() => dispatch({ type: "SHOW_PAYWALL", reason: "date-range" })}
              className="underline font-medium"
            >
              Unlock 5-year history — $4.99 →
            </button>
          </p>
        )}
      </div>

      <button
        onClick={handleScan}
        disabled={primaryJobRunning}
        className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {primaryJobRunning ? `Scanning ${providerLabel(provider)}…` : "Start Scan"}
      </button>

      {error && <p className="text-red-600 text-xs">{error}</p>}

      {/* Also scan the other provider */}
      <div className="border border-dashed border-gray-200 rounded-lg p-3 flex flex-col gap-2 bg-gray-50">
        {otherJobRunning || secondaryState === "scanning" ? (
          <div className="flex items-center gap-2 text-xs text-gray-600">
            {PROVIDER_ICONS[otherProvider]}
            <span className="font-medium">{providerLabel(otherProvider)}</span>
            <span className="animate-pulse text-blue-500 ml-auto">● scanning…</span>
          </div>
        ) : (
          <>
            <p className="text-xs text-gray-500">
              Also have flights in your{" "}
              <span className="font-medium">{providerLabel(otherProvider)}</span>?
            </p>
            <button
              onClick={handleConnectOther}
              disabled={secondaryState === "connecting"}
              className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-400 disabled:opacity-50 transition-colors shadow-sm w-full"
            >
              {PROVIDER_ICONS[otherProvider]}
              <span className="flex-1 text-left">
                {secondaryState === "connecting"
                  ? `Connecting ${providerLabel(otherProvider)}…`
                  : `Connect & scan ${providerLabel(otherProvider)} too`}
              </span>
              {secondaryState === "connecting" && <span className="animate-spin text-xs">⏳</span>}
            </button>
            {secondaryState === "error" && secondaryError && (
              <p className="text-red-500 text-[11px]">{secondaryError}</p>
            )}
          </>
        )}
      </div>

      <p className="text-xs text-gray-400 -mt-2">
        Scans run in the background — results merge into one list automatically.
      </p>
    </div>
  );
}
