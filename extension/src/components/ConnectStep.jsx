import React, { useState, useRef } from "react";
import { scanEmlFiles } from "../scan.js";

export default function ConnectStep({ dispatch }) {
  const [loading, setLoading] = useState(null); // "gmail" | "outlook" | "eml" | null
  const [error, setError] = useState(null);
  const [emlProgress, setEmlProgress] = useState(null);
  const fileInputRef = useRef(null);

  async function handleConnect(provider) {
    setLoading(provider);
    setError(null);
    try {
      const token = provider === "outlook"
        ? await requestOutlookToken()
        : await requestGmailToken();
      dispatch({ type: "SET_TOKEN", token, provider });
    } catch (err) {
      setError(err.message || "Failed to connect. Please try again.");
    } finally {
      setLoading(null);
    }
  }

  async function handleEmlFiles(files) {
    if (!files?.length) return;
    setLoading("eml");
    setError(null);
    setEmlProgress({ scanned: 0, total: files.length, found: 0 });
    try {
      const trips = await scanEmlFiles(Array.from(files), (p) => setEmlProgress(p));
      if (trips.length === 0) {
        setError("No flight confirmations found in the uploaded files. Make sure you exported booking confirmation emails.");
        return;
      }
      dispatch({ type: "SET_TRIPS", trips });
    } catch (err) {
      setError(err.message || "Failed to parse files.");
    } finally {
      setLoading(null);
      setEmlProgress(null);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    const files = [...e.dataTransfer.files].filter((f) =>
      f.name.endsWith(".eml") || f.name.endsWith(".msg") || f.type === "message/rfc822"
    );
    if (files.length) handleEmlFiles(files);
  }

  const isLoading = loading !== null;

  return (
    <div className="flex flex-col items-center justify-center py-8 gap-5">
      <div className="text-center">
        <h1 className="text-xl font-semibold text-gray-800 mb-2">
          Connect your email
        </h1>
        <p className="text-gray-500 max-w-xs text-sm">
          TripTrace scans for flight confirmation emails to build your N-400
          travel history. Read-only access only.
        </p>
      </div>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        {/* Gmail */}
        <button
          onClick={() => handleConnect("gmail")}
          disabled={isLoading}
          className="flex items-center gap-3 bg-white border border-gray-300 rounded-lg px-4 py-3 font-medium text-sm text-gray-700 hover:bg-gray-50 hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          <svg className="w-5 h-5 shrink-0" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 5.5L5.5 19v24h11V26.5l7.5 5.5 7.5-5.5V43h11V19z"/>
            <path fill="#FBBC05" d="M5.5 19L24 5.5 42.5 19v5.5L24 19 5.5 24.5z"/>
            <path fill="#34A853" d="M36.5 43h6V19l-6 5.5z"/>
            <path fill="#4285F4" d="M5.5 43h6V24.5L5.5 19z"/>
          </svg>
          <span className="flex-1 text-left">
            {loading === "gmail" ? "Connecting…" : "Continue with Gmail"}
          </span>
          {loading === "gmail" && <span className="animate-spin text-sm">⏳</span>}
        </button>

        {/* Outlook */}
        <button
          onClick={() => handleConnect("outlook")}
          disabled={isLoading}
          className="flex items-center gap-3 bg-white border border-gray-300 rounded-lg px-4 py-3 font-medium text-sm text-gray-700 hover:bg-gray-50 hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          <svg className="w-5 h-5 shrink-0" viewBox="0 0 48 48">
            <rect x="2" y="8" width="26" height="32" rx="2" fill="#0078D4"/>
            <path fill="#fff" d="M15 16a7 7 0 100 16 7 7 0 000-16zm0 12a5 5 0 110-10 5 5 0 010 10z"/>
            <rect x="28" y="8" width="18" height="32" rx="2" fill="#50D9FF" opacity=".35"/>
            <rect x="30" y="16" width="14" height="2" rx="1" fill="#0078D4"/>
            <rect x="30" y="21" width="14" height="2" rx="1" fill="#0078D4"/>
            <rect x="30" y="26" width="14" height="2" rx="1" fill="#0078D4"/>
          </svg>
          <span className="flex-1 text-left">
            {loading === "outlook" ? "Connecting…" : "Continue with Outlook"}
          </span>
          {loading === "outlook" && <span className="animate-spin text-sm">⏳</span>}
        </button>

        {/* Divider */}
        <div className="flex items-center gap-2 py-1">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400">or import files</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* .eml upload — works with iCloud, Yahoo, any provider */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => !isLoading && fileInputRef.current?.click()}
          className={`flex flex-col items-center gap-2 border-2 border-dashed rounded-lg px-4 py-5 text-center cursor-pointer transition-colors
            ${loading === "eml" ? "border-blue-300 bg-blue-50" : "border-gray-300 hover:border-blue-400 hover:bg-gray-50"}
            ${isLoading && loading !== "eml" ? "opacity-40 cursor-not-allowed pointer-events-none" : ""}`}
        >
          <span className="text-2xl">📧</span>
          <div>
            <p className="text-sm font-medium text-gray-700">
              {loading === "eml" ? "Parsing files…" : "Upload .eml files"}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              iCloud, Yahoo, or any other provider
            </p>
          </div>
          {emlProgress && loading === "eml" && (
            <p className="text-xs text-blue-600">
              {emlProgress.scanned} of {emlProgress.total} files — {emlProgress.found} found
            </p>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".eml,.msg"
            multiple
            className="hidden"
            onChange={(e) => handleEmlFiles(e.target.files)}
          />
        </div>

        <p className="text-[11px] text-gray-400 text-center leading-relaxed -mt-1">
          Export confirmation emails from your mail client and drop them here.
          Files are parsed locally — nothing is uploaded.
        </p>
      </div>

      {error && (
        <p className="text-red-600 text-xs text-center max-w-xs">{error}</p>
      )}

      <p className="text-gray-400 text-xs text-center max-w-xs leading-relaxed">
        OAuth connections request read-only access only. TripTrace never reads,
        sends, deletes, or modifies any emails.
      </p>
    </div>
  );
}

async function requestGmailToken() {
  if (typeof chrome === "undefined" || !chrome.identity) {
    throw new Error("Chrome Identity API unavailable. Load as a Chrome extension.");
  }
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "GET_AUTH_TOKEN" }, (response) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else if (response?.error) reject(new Error(response.error));
      else if (response?.token) resolve(response.token);
      else reject(new Error("No token returned."));
    });
  });
}

async function requestOutlookToken() {
  if (typeof chrome === "undefined" || !chrome.identity) {
    throw new Error("Chrome Identity API unavailable. Load as a Chrome extension.");
  }
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "GET_OUTLOOK_TOKEN" }, (response) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else if (response?.error) reject(new Error(response.error));
      else if (response?.token) resolve(response.token);
      else reject(new Error("No token returned."));
    });
  });
}
