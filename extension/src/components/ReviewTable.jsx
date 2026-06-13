import React, { useState, useEffect, useRef } from "react";
import { parseISO, differenceInCalendarDays, format } from "date-fns";
import { parseWithAI } from "../api.js";
import { getEmailClient } from "../emailClients/index.js";
import { deduplicateTrips } from "../scan.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysAbroad(dep, ret) {
  if (!dep || !ret) return null;
  try { return differenceInCalendarDays(parseISO(ret), parseISO(dep)); } catch { return null; }
}

function totalDaysAbroad(trips) {
  return trips.reduce((sum, t) => sum + (daysAbroad(t.departure_date, t.return_date) ?? 0), 0);
}

function fmtDate(iso) {
  if (!iso) return "—";
  try { return format(parseISO(iso), "MMM d, yyyy"); } catch { return iso; }
}

function fieldCount(trip) {
  return ["departure_date","return_date","destination_country","origin_country","airline","confirmation_number","passenger_name"]
    .filter((k) => trip[k] != null).length;
}

/**
 * Groups trips by confirmation_number. Rows with a shared confirmation_number
 * are sorted so the most-complete row comes first (parent), followed by
 * duplicates immediately after. Rows with no confirmation_number are ungrouped
 * and appear in original order at the end of each position.
 *
 * Returns items annotated with:
 *   _isParent   — first row of a 2+ group
 *   _isDuplicate — subsequent rows in a 2+ group
 *   _groupSize  — how many rows share the same confirmation_number
 *   _groupConf  — the shared confirmation_number (for Merge button)
 */
function buildGroupedView(trips) {
  // Count occurrences of each non-null confirmation_number
  const counts = {};
  for (const t of trips) {
    if (t.confirmation_number) counts[t.confirmation_number] = (counts[t.confirmation_number] ?? 0) + 1;
  }

  const seen = {}; // confirmation_number -> true (first time seen)
  const groups = {}; // confirmation_number -> sorted members (with _idx)
  const order = []; // final ordered list

  // First pass: collect all members of each group, sorted by completeness
  for (const t of trips) {
    const conf = t.confirmation_number;
    if (conf && counts[conf] > 1) {
      if (!groups[conf]) groups[conf] = [];
      groups[conf].push(t);
    }
  }
  for (const conf of Object.keys(groups)) {
    groups[conf].sort((a, b) => fieldCount(b) - fieldCount(a));
  }

  // Second pass: build output in original row order, inserting grouped members together
  for (const t of trips) {
    const conf = t.confirmation_number;
    if (conf && counts[conf] > 1) {
      if (seen[conf]) continue; // already emitted the whole group
      seen[conf] = true;
      const members = groups[conf];
      order.push({ ...members[0], _isParent: true,  _isDuplicate: false, _groupSize: members.length, _groupConf: conf });
      for (const dup of members.slice(1)) {
        order.push({ ...dup,       _isParent: false, _isDuplicate: true,  _groupSize: members.length, _groupConf: conf });
      }
    } else {
      order.push({ ...t, _isParent: false, _isDuplicate: false, _groupSize: 1, _groupConf: null });
    }
  }

  return order;
}

// ── Confidence badge styles ───────────────────────────────────────────────────

const CONFIDENCE_BADGE = {
  high:         "bg-green-100 text-green-700",
  low:          "bg-yellow-100 text-yellow-700",
  "ai-assisted":"bg-blue-100 text-blue-700",
  unmatched:    "bg-red-100 text-red-700",
  manual:       "bg-gray-100 text-gray-600",
  merged:       "bg-purple-100 text-purple-700",
  rejected:     "bg-gray-100 text-gray-400 line-through",
};

// ── Editable cell ─────────────────────────────────────────────────────────────

function EditableCell({ value, onChange, type = "text", missing = false }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  if (editing) {
    return (
      <input
        autoFocus
        type={type}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { onChange(draft); setEditing(false); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { onChange(draft); setEditing(false); }
          if (e.key === "Escape") setEditing(false);
        }}
        className="border border-blue-400 rounded px-1 py-0.5 text-xs w-full"
      />
    );
  }
  return (
    <span
      onClick={() => { setDraft(value ?? ""); setEditing(true); }}
      className={`cursor-pointer hover:bg-blue-50 rounded px-1 py-0.5 block min-w-[4rem] ${missing && !value ? "ring-1 ring-orange-400 bg-orange-50" : ""}`}
      title={missing && !value ? "Missing — click to fill in" : "Click to edit"}
    >
      {value || <span className={missing ? "text-orange-400" : "text-gray-300"}>—</span>}
    </span>
  );
}

// ── Email preview modal ───────────────────────────────────────────────────────

function EmailPreviewModal({ text, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[90vw] max-w-lg max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <span className="font-semibold text-sm text-gray-700">Extracted Email Text</span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>
        <div className="overflow-auto flex-1 p-4">
          <pre className="text-[11px] text-gray-700 whitespace-pre-wrap break-words font-mono leading-relaxed">
            {text || "(empty — email body could not be extracted)"}
          </pre>
        </div>
        <div className="px-4 py-2 border-t border-gray-100 text-[10px] text-gray-400">
          {text?.length ?? 0} chars extracted
        </div>
      </div>
    </div>
  );
}

// ── Merge group preview modal ─────────────────────────────────────────────────

function MergeGroupModal({ group, onConfirm, onCancel }) {
  // Compute preview of what the merged ticket will look like
  const sorted = [...group].sort((a, b) => {
    const cnt = (t) => ["departure_date","return_date","destination_country","origin_country","airline","passenger_name"]
      .filter((k) => t[k] != null).length;
    return cnt(b) - cnt(a);
  });
  const base = { ...sorted[0] };
  for (const other of sorted.slice(1)) {
    for (const key of Object.keys(other)) {
      if (base[key] == null && other[key] != null) base[key] = other[key];
    }
  }
  const deps = group.map((t) => t.departure_date).filter(Boolean).sort();
  const rets = group.map((t) => t.return_date).filter(Boolean).sort();
  const departure = deps[0] ?? base.departure_date;
  const returnDate = rets[rets.length - 1] ?? (deps.length > 1 ? deps[deps.length - 1] : base.return_date);
  const days = daysAbroad(departure, returnDate);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-2xl w-[90vw] max-w-sm flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-gray-200">
          <h3 className="font-semibold text-sm text-gray-800">Merge {group.length} tickets into one</h3>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Confirmation: <span className="font-mono font-medium text-gray-600">{base.confirmation_number}</span>
          </p>
        </div>

        {/* Individual tickets in group */}
        <div className="px-4 pt-3 flex flex-col gap-1">
          <p className="text-[10px] text-gray-400 uppercase font-medium mb-1">Tickets being merged</p>
          {sorted.map((t, i) => (
            <div key={i} className="text-[11px] bg-gray-50 rounded px-2 py-1.5 flex gap-3">
              <span className="text-gray-400 w-4">{i + 1}.</span>
              <span>{fmtDate(t.departure_date)}</span>
              {t.return_date && <><span className="text-gray-300">→</span><span>{fmtDate(t.return_date)}</span></>}
              {t.destination_country && <span className="text-gray-500 truncate">{t.destination_country}</span>}
            </div>
          ))}
        </div>

        {/* Result preview */}
        <div className="px-4 py-3">
          <p className="text-[10px] text-gray-400 uppercase font-medium mb-2">Result</p>
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-xs flex flex-col gap-1.5">
            <div className="flex justify-between">
              <span className="text-gray-500">Departure</span>
              <span className="font-medium">{fmtDate(departure)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Return</span>
              <span className="font-medium">{returnDate ? fmtDate(returnDate) : <span className="text-gray-300">—</span>}</span>
            </div>
            {days != null && (
              <div className="flex justify-between">
                <span className="text-gray-500">Days abroad</span>
                <span className="font-semibold text-purple-700">{days}</span>
              </div>
            )}
            {base.destination_country && (
              <div className="flex justify-between">
                <span className="text-gray-500">Destination</span>
                <span>{base.destination_country}</span>
              </div>
            )}
            {base.airline && (
              <div className="flex justify-between">
                <span className="text-gray-500">Airline</span>
                <span>{base.airline}</span>
              </div>
            )}
          </div>
          <p className="text-[10px] text-gray-400 mt-2">You can edit all fields after merging.</p>
        </div>

        <div className="px-4 py-3 border-t border-gray-100 flex gap-2 justify-end">
          <button onClick={onCancel} className="px-3 py-1.5 text-xs text-gray-600 bg-gray-100 rounded hover:bg-gray-200">
            Cancel
          </button>
          <button onClick={onConfirm} className="px-3 py-1.5 text-xs text-white bg-purple-600 rounded hover:bg-purple-700">
            Merge into one ticket
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Join round-trip preview modal ─────────────────────────────────────────────

function JoinPreviewModal({ tripA, tripB, onConfirm, onCancel }) {
  const [out, inb] = (tripA.departure_date ?? "") <= (tripB.departure_date ?? "")
    ? [tripA, tripB] : [tripB, tripA];

  const days = daysAbroad(out.departure_date, inb.departure_date);

  const airline = [out.airline, inb.airline]
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(" + ") || null;

  const conf = [out.confirmation_number, inb.confirmation_number]
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(" + ") || null;

  const dest = out.destination_country ?? inb.origin_country ?? "?";
  const origin = out.origin_country ?? inb.destination_country ?? "United States";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-2xl w-[90vw] max-w-sm flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-gray-200">
          <h3 className="font-semibold text-sm text-gray-800">Join as Round Trip</h3>
          <p className="text-[11px] text-gray-400 mt-0.5">Two one-way legs will become one round-trip row.</p>
        </div>

        <div className="px-4 py-4 flex flex-col gap-3">
          <div className="bg-blue-50 rounded-lg p-3 text-xs flex flex-col gap-1.5">
            <div className="flex gap-2 items-center">
              <span className="text-base">✈️</span>
              <div>
                <span className="font-medium">{origin} → {dest}</span>
                <div className="text-gray-500">{fmtDate(out.departure_date)}</div>
              </div>
            </div>
            <div className="flex gap-2 items-center">
              <span className="text-base">🏠</span>
              <div>
                <span className="font-medium">{dest} → {origin}</span>
                <div className="text-gray-500">{fmtDate(inb.departure_date)}</div>
              </div>
            </div>
          </div>

          <div className="text-xs grid grid-cols-2 gap-x-4 gap-y-1 text-gray-600">
            <span className="text-gray-400">Days abroad</span>
            <span className="font-medium">{days ?? "—"}</span>
            {airline && <><span className="text-gray-400">Airline</span><span>{airline}</span></>}
            {conf && <><span className="text-gray-400">Confirmation</span><span className="font-mono">{conf}</span></>}
          </div>
        </div>

        <div className="px-4 py-3 border-t border-gray-100 flex gap-2 justify-end">
          <button onClick={onCancel} className="px-3 py-1.5 text-xs text-gray-600 bg-gray-100 rounded hover:bg-gray-200">
            Cancel
          </button>
          <button onClick={onConfirm} className="px-3 py-1.5 text-xs text-white bg-blue-600 rounded hover:bg-blue-700">
            Join
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Add provider panel ────────────────────────────────────────────────────────

function AddProviderPanel({ dateRange, isUnlocked, onStartJob, onClose }) {
  const [token, setToken] = useState(null);
  const [provider, setProvider] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | connecting | scanning | done | error
  const [error, setError] = useState(null);

  async function connectOutlook() {
    setStatus("connecting");
    setError(null);
    try {
      const t = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: "GET_OUTLOOK_TOKEN" }, (res) => {
          if (res?.token) resolve(res.token);
          else reject(new Error(res?.error ?? "Failed to get Outlook token"));
        });
      });
      setToken(t);
      setProvider("outlook");
      setStatus("idle");
    } catch (err) {
      setError(err.message);
      setStatus("error");
    }
  }

  async function startScan() {
    if (!token || !provider) return;
    setStatus("scanning");
    setError(null);
    try {
      await onStartJob({
        token,
        provider,
        dateRange: dateRange ?? { startDate: (() => { const d = new Date(); d.setFullYear(d.getFullYear() - 5); return d.toISOString().split("T")[0]; })(), endDate: new Date().toISOString().split("T")[0] },
        isUnlocked,
      });
      setStatus("done");
    } catch (err) {
      setError(err.message);
      setStatus("error");
    }
  }

  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-xs flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="font-medium text-indigo-700">Scan another email account</span>
        <button onClick={onClose} className="text-indigo-400 hover:text-indigo-600 text-sm leading-none">×</button>
      </div>

      {status === "done" ? (
        <p className="text-green-700 font-medium">✓ Scan started — results will appear in the table above as they arrive.</p>
      ) : !token ? (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={connectOutlook}
            disabled={status === "connecting"}
            className="bg-indigo-600 text-white px-3 py-1.5 rounded hover:bg-indigo-700 disabled:opacity-50 font-medium"
          >
            {status === "connecting" ? "Connecting…" : "Connect Outlook / Microsoft"}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <span className="text-indigo-600 font-medium">✓ {provider === "outlook" ? "Outlook" : provider} connected</span>
          <button
            onClick={startScan}
            disabled={status === "scanning"}
            className="bg-indigo-600 text-white px-3 py-1.5 rounded hover:bg-indigo-700 disabled:opacity-50 font-medium"
          >
            {status === "scanning" ? "Starting…" : "Start Scan"}
          </button>
        </div>
      )}

      {error && <p className="text-red-600">{error}</p>}
      <p className="text-indigo-400 text-[10px]">Scan runs in the background alongside any active Gmail scan.</p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ReviewTable({ trips, dispatch, accessToken, provider = "gmail", jobs = [], dateRange, isUnlocked = false, onStartJob }) {
  const [deleteConfirm, setDeleteConfirm]     = useState(null);
  const [aiLoading, setAiLoading]             = useState({});
  const [aiError, setAiError]                 = useState({});
  const [emailPreview, setEmailPreview]       = useState(null);
  const [previewLoading, setPreviewLoading]   = useState({});
  const [filterYear, setFilterYear]           = useState("all");
  const [filterStatus, setFilterStatus]       = useState("all");
  const [selectedRows, setSelectedRows]       = useState(new Set());
  const [joinPreview, setJoinPreview]         = useState(null);
  const [mergeMsg, setMergeMsg]               = useState(null);
  const [mergeGroupPreview, setMergeGroupPreview] = useState(null);
  const [queueStatus, setQueueStatus]         = useState(null);
  const [hasFailedRows, setHasFailedRows]     = useState(false);
  const [showAddProvider, setShowAddProvider] = useState(false);

  // Keep accessToken in a ref so the async queue always reads the latest value
  const accessTokenRef = useRef(accessToken);
  useEffect(() => { accessTokenRef.current = accessToken; }, [accessToken]);

  // Queue state lives in a ref so the async loop never captures stale closures
  const aiQueueRef = useRef(null);
  // Track which emailIds have been queued so new arriving trips get picked up
  const queuedEmailIds = useRef(new Set());

  // ── Enqueue any new unmatched trips (runs when trips array changes) ───────────
  useEffect(() => {
    if (!accessToken) return;

    const newItems = trips
      .map((t, i) => ({ idx: i, emailId: t._emailId }))
      .filter(({ emailId, idx }) => {
        if (!emailId || queuedEmailIds.current.has(emailId)) return false;
        const t = trips[idx];
        return t.confidence === "unmatched" || t.confidence === "low";
      });

    if (newItems.length === 0) return;

    newItems.forEach(({ emailId }) => queuedEmailIds.current.add(emailId));

    if (aiQueueRef.current === null) {
      // First run
      aiQueueRef.current = { items: newItems, retryItems: [], done: 0, paused: false, stopped: false };
      setQueueStatus({ total: newItems.length, done: 0, paused: false, rateLimitCountdown: null });
      runQueue(aiQueueRef.current);
    } else {
      // Queue already running — append new items
      const q = aiQueueRef.current;
      q.items.push(...newItems);
      setQueueStatus((s) => s ? { ...s, total: s.total + newItems.length } : { total: newItems.length, done: 0, paused: false, rateLimitCountdown: null });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trips.length, accessToken]);

  async function runQueue(q) {
    for (const item of [...q.items]) {
      if (q.stopped) break;
      await waitWhilePaused(q);
      const outcome = await runAIById(item.idx, item.emailId);
      q.done++;
      setQueueStatus((s) => s ? { ...s, done: q.done } : s);

      if (outcome === "rate-limited") {
        // Push item back and pause with a countdown before retrying
        q.items.unshift(item); // retry this item next
        await rateLimitCooldown(q, 60);
        continue;
      }
      if (outcome === "no-trip") q.retryItems.push(item);
      await delay(600);
    }

    // One retry pass for "no-trip" rows
    for (const item of q.retryItems) {
      if (q.stopped) break;
      await waitWhilePaused(q);
      await runAIById(item.idx, item.emailId);
      await delay(1000);
    }

    const anyErrors = Object.values(aiError).some(Boolean);
    setHasFailedRows(anyErrors);
    setQueueStatus(null);
  }

  // Pause the queue and show a visible countdown, then auto-resume
  async function rateLimitCooldown(q, seconds) {
    q.paused = true;
    for (let s = seconds; s > 0; s--) {
      setQueueStatus((prev) => prev ? { ...prev, paused: true, rateLimitCountdown: s } : prev);
      await delay(1000);
      if (q.stopped) return;
    }
    q.paused = false;
    setQueueStatus((prev) => prev ? { ...prev, paused: false, rateLimitCountdown: null } : prev);
  }

  function waitWhilePaused(q) {
    return new Promise((resolve) => {
      const check = () => (!q.paused || q.stopped) ? resolve() : setTimeout(check, 250);
      check();
    });
  }

  function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }

  function toggleQueuePause() {
    const q = aiQueueRef.current;
    if (!q) return;
    q.paused = !q.paused;
    setQueueStatus((s) => s ? { ...s, paused: q.paused, rateLimitCountdown: q.paused ? s.rateLimitCountdown : null } : s);
  }

  // Re-queue all rows that currently show an AI error
  function handleRetryFailed() {
    const erroredIndices = Object.entries(aiError)
      .filter(([, err]) => Boolean(err))
      .map(([idx]) => Number(idx));
    if (erroredIndices.length === 0) return;

    const retryItems = erroredIndices
      .map((idx) => ({ idx, emailId: trips[idx]?._emailId }))
      .filter((item) => item.emailId);

    // Clear existing errors for these rows
    setAiError((s) => {
      const next = { ...s };
      erroredIndices.forEach((idx) => { next[idx] = null; });
      return next;
    });
    setHasFailedRows(false);

    const q = aiQueueRef.current ?? { items: [], retryItems: [], done: 0, paused: false, stopped: false };
    q.items = retryItems;
    q.retryItems = [];
    q.stopped = false;
    aiQueueRef.current = q;

    const total = retryItems.length;
    setQueueStatus({ total, done: 0, paused: false, rateLimitCountdown: null });
    runQueue(q);
  }

  // ── Core AI runner ────────────────────────────────────────────────────────────

  async function runAIById(idx, emailId) {
    if (!accessTokenRef.current || !emailId) return "skip";
    setAiLoading((s) => ({ ...s, [idx]: true }));
    setAiError((s) => ({ ...s, [idx]: null }));
    try {
      const body = await getEmailClient(provider).getEmailBody(accessTokenRef.current, emailId);
      if (!body) throw new Error("Email body was empty");
      const result = await parseWithAI(body.slice(0, 8000), window.__triptrace_license_token ?? null);
      if (result?.trips?.[0]) {
        dispatch({
          type: "UPDATE_TRIP",
          index: idx,
          fields: {
            ...result.trips[0],
            confidence: "ai-assisted",
            confirmed: false,
            _aiProvider: result._provider ?? null,
          },
        });
        return "success";
      }
      // Claude classified this as not a flight booking — show the specific reason
      if (result?.is_confirmed_flight_booking === false) {
        const reason = result.rejection_reason ?? "not a flight booking";
        dispatch({ type: "UPDATE_TRIP", index: idx, fields: { confidence: "rejected", _rejectedReason: reason } });
        return "no-trip";
      }
      setAiError((s) => ({ ...s, [idx]: "AI found no trip in this email" }));
      return "no-trip";
    } catch (err) {
      const msg = err.message ?? "";
      // Detect rate-limit / all-providers-exhausted signal from backend
      if (msg.includes("rate limit") || msg.includes("rate-limit") || msg.includes("503") || msg.includes("unavailable")) {
        return "rate-limited";
      }
      setAiError((s) => ({ ...s, [idx]: msg }));
      return "error";
    } finally {
      setAiLoading((s) => ({ ...s, [idx]: false }));
    }
  }

  async function handleAIParse(idx) {
    const trip = trips[idx];
    if (!accessToken) { setAiError((s) => ({ ...s, [idx]: "No token — reconnect your email account" })); return; }
    if (!trip?._emailId) { setAiError((s) => ({ ...s, [idx]: "No email ID on this row" })); return; }
    await runAIById(idx, trip._emailId);
  }

  async function handlePreview(idx) {
    const trip = trips[idx];
    if (!trip?._emailId || !accessToken) { setEmailPreview({ text: "No email ID or token available." }); return; }
    setPreviewLoading((s) => ({ ...s, [idx]: true }));
    try {
      const body = await getEmailClient(provider).getEmailBody(accessToken, trip._emailId);
      setEmailPreview({ text: body || "(empty)" });
    } catch (err) {
      setEmailPreview({ text: `Error: ${err.message}` });
    } finally {
      setPreviewLoading((s) => ({ ...s, [idx]: false }));
    }
  }

  // ── Merge a specific confirmation-number group ────────────────────────────────

  function handleMergeGroupClick(confirmationNumber) {
    const group = trips.filter((t) => t.confirmation_number === confirmationNumber);
    setMergeGroupPreview({ confirmationNumber, group });
  }

  function confirmMergeGroup() {
    if (!mergeGroupPreview) return;
    dispatch({ type: "MERGE_GROUP", confirmationNumber: mergeGroupPreview.confirmationNumber });
    setMergeGroupPreview(null);
    setSelectedRows(new Set());
  }

  // ── Merge ALL duplicate groups at once ────────────────────────────────────────

  function handleMergeDuplicates() {
    const deduped = deduplicateTrips(trips);
    const removed = trips.length - deduped.length;
    dispatch({ type: "DEDUPLICATE" });
    setSelectedRows(new Set());
    setMergeMsg(removed > 0
      ? `✓ Removed ${removed} duplicate row${removed > 1 ? "s" : ""}`
      : "No duplicates found");
    setTimeout(() => setMergeMsg(null), 3500);
  }

  // ── Row selection & join ──────────────────────────────────────────────────────

  function toggleSelect(idx) {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  }

  function handleJoinClick() {
    const [idxA, idxB] = [...selectedRows];
    setJoinPreview({ idxA, idxB });
  }

  function confirmJoin() {
    if (!joinPreview) return;
    dispatch({ type: "JOIN_TRIPS", indexA: joinPreview.idxA, indexB: joinPreview.idxB });
    setSelectedRows(new Set());
    setJoinPreview(null);
  }

  // ── Derived values ────────────────────────────────────────────────────────────

  const years = [...new Set(trips.map((t) => t.departure_date?.slice(0, 4)).filter(Boolean))].sort().reverse();
  const totalAbroad = totalDaysAbroad(trips);
  const confirmedCount = trips.filter((t) => t.confirmed).length;

  const filteredTrips = buildGroupedView(
    trips
      .map((t, i) => ({ ...t, _idx: i }))
      .filter((t) => {
        if (filterYear !== "all" && t.departure_date?.slice(0, 4) !== filterYear) return false;
        if (filterStatus === "confirmed" && !t.confirmed) return false;
        if (filterStatus === "unreviewed" && t.confirmed) return false;
        return true;
      })
  );

  const selectedArr = [...selectedRows];
  const canJoin = selectedArr.length === 2;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-3">

      {/* Summary bar */}
      <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-800 flex gap-4 flex-wrap items-center">
        <span><strong>{trips.length}</strong> trips</span>
        <span><strong>{confirmedCount}</strong> confirmed</span>
        <span><strong>{totalAbroad}</strong> days abroad</span>

        {/* AI queue status */}
        {queueStatus ? (
          <span className="ml-auto flex items-center gap-2">
            {queueStatus.rateLimitCountdown != null ? (
              <span className="text-amber-700 font-medium">
                ⏸ Rate limited — retrying in {queueStatus.rateLimitCountdown}s ({queueStatus.done}/{queueStatus.total})
              </span>
            ) : queueStatus.paused ? (
              <span className="text-amber-600">⏸ AI paused ({queueStatus.done}/{queueStatus.total})</span>
            ) : (
              <span className="text-blue-600 animate-pulse">⏳ AI {queueStatus.done}/{queueStatus.total}</span>
            )}
            {queueStatus.rateLimitCountdown == null && (
              <button onClick={toggleQueuePause} className="text-[10px] bg-blue-100 hover:bg-blue-200 text-blue-700 px-2 py-0.5 rounded font-medium">
                {queueStatus.paused ? "▶ Resume" : "⏸ Pause"}
              </button>
            )}
          </span>
        ) : hasFailedRows ? (
          <button
            onClick={handleRetryFailed}
            className="ml-auto text-[10px] bg-amber-100 text-amber-700 hover:bg-amber-200 px-2 py-1 rounded font-medium"
          >
            ↺ Retry failed rows
          </button>
        ) : null}

        {/* Add provider button */}
        <button
          onClick={() => setShowAddProvider((v) => !v)}
          className={`text-[10px] px-2 py-1 rounded font-medium border transition-colors ${showAddProvider ? "bg-indigo-100 text-indigo-700 border-indigo-300" : "bg-white text-gray-600 border-gray-300 hover:border-indigo-300 hover:text-indigo-600"}`}
        >
          + Scan another account
        </button>
      </div>

      {/* Add provider panel */}
      {showAddProvider && (
        <AddProviderPanel
          dateRange={dateRange}
          isUnlocked={isUnlocked}
          onStartJob={onStartJob}
          onClose={() => setShowAddProvider(false)}
        />
      )}

      {/* Selection action bar — appears when rows are selected */}
      {selectedRows.size > 0 && (
        <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 text-xs">
          <span className="text-indigo-700 font-medium">{selectedRows.size} row{selectedRows.size > 1 ? "s" : ""} selected</span>
          {canJoin && (
            <button
              onClick={handleJoinClick}
              className="bg-indigo-600 text-white px-2.5 py-1 rounded hover:bg-indigo-700 font-medium"
            >
              ✈ Join as Round Trip
            </button>
          )}
          {selectedRows.size > 2 && (
            <span className="text-indigo-400 text-[10px]">Select exactly 2 rows to join</span>
          )}
          <button
            onClick={() => setSelectedRows(new Set())}
            className="ml-auto text-indigo-400 hover:text-indigo-600 underline"
          >
            Clear
          </button>
        </div>
      )}

      {/* Filters + tools row */}
      <div className="flex gap-2 flex-wrap items-center">
        <select
          value={filterYear}
          onChange={(e) => setFilterYear(e.target.value)}
          className="border border-gray-200 rounded px-2 py-1 text-xs"
        >
          <option value="all">All years</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="border border-gray-200 rounded px-2 py-1 text-xs"
        >
          <option value="all">All statuses</option>
          <option value="confirmed">Confirmed</option>
          <option value="unreviewed">Unreviewed</option>
        </select>

        <button
          onClick={handleMergeDuplicates}
          className="text-xs bg-purple-100 text-purple-700 hover:bg-purple-200 rounded px-2 py-1"
          title="Find rows sharing the same confirmation number and collapse them into one"
        >
          Merge duplicates
        </button>

        {mergeMsg && (
          <span className="text-xs text-purple-600 font-medium">{mergeMsg}</span>
        )}

        <button
          onClick={() => dispatch({ type: "ADD_TRIP" })}
          className="ml-auto text-xs bg-gray-100 hover:bg-gray-200 rounded px-2 py-1"
        >
          + Add row
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded border border-gray-200">
        <table className="w-full text-xs border-collapse">
          <thead className="bg-gray-50 text-gray-500 uppercase text-[10px]">
            <tr>
              <th className="px-2 py-2 text-left w-5" title="Select for join/merge">□</th>
              <th className="px-2 py-2 text-left w-6">✓</th>
              <th className="px-2 py-2 text-left">Departure</th>
              <th className="px-2 py-2 text-left">Return</th>
              <th className="px-2 py-2 text-left">Type</th>
              <th className="px-2 py-2 text-left">From</th>
              <th className="px-2 py-2 text-left">To</th>
              <th className="px-2 py-2 text-right">Days</th>
              <th className="px-2 py-2 text-left">Conf #</th>
              <th className="px-2 py-2 text-left">Passenger</th>
              <th className="px-2 py-2 text-left">Flight #</th>
              <th className="px-2 py-2 text-left">Aircraft</th>
              <th className="px-2 py-2 text-left">Source</th>
              <th className="px-2 py-2 text-left">Status</th>
              <th className="px-2 py-2 w-6"></th>
            </tr>
          </thead>
          <tbody>
            {filteredTrips.map((trip) => {
              const idx = trip._idx;
              const days = daysAbroad(trip.departure_date, trip.return_date);
              const isAmber = days !== null && days > 180;
              const missing = trip._missingFields ?? [];
              const isSelected = selectedRows.has(idx);
              const isDup = trip._isDuplicate;
              const isParent = trip._isParent;

              // Row background: duplicates get a very light purple tint
              let rowBg = isSelected ? "bg-indigo-50" : isAmber ? "bg-amber-50" : "hover:bg-gray-50";
              if (isDup) rowBg = "bg-purple-50 hover:bg-purple-100";

              return (
                <tr
                  key={`${idx}-${trip._groupConf ?? "solo"}`}
                  className={`border-t border-gray-100 ${rowBg} ${isDup ? "border-l-2 border-l-purple-300" : isParent ? "border-l-2 border-l-purple-400" : ""}`}
                >
                  {/* Selection checkbox */}
                  <td className="px-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(idx)}
                      className="accent-indigo-600"
                      title="Select row"
                    />
                  </td>

                  {/* Confirm checkbox */}
                  <td className="px-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={!!trip.confirmed}
                      onChange={() => dispatch({ type: "CONFIRM_TRIP", index: idx })}
                      className="accent-blue-600"
                    />
                  </td>

                  <td className="px-2 py-1.5">
                    <EditableCell
                      value={trip.departure_date} type="date"
                      missing={missing.includes("departure_date")}
                      onChange={(v) => dispatch({ type: "UPDATE_TRIP", index: idx, fields: { departure_date: v || null } })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <EditableCell
                      value={trip.return_date} type="date"
                      missing={missing.includes("return_date")}
                      onChange={(v) => dispatch({ type: "UPDATE_TRIP", index: idx, fields: { return_date: v || null } })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <select
                      value={trip.trip_type ?? ""}
                      onChange={(e) => dispatch({ type: "UPDATE_TRIP", index: idx, fields: { trip_type: e.target.value || null } })}
                      className="text-[10px] border border-gray-200 rounded px-1 py-0.5 bg-white w-full"
                    >
                      <option value="">—</option>
                      <option value="round-trip">Round trip</option>
                      <option value="one-way">One way</option>
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <EditableCell
                      value={trip.origin_country}
                      onChange={(v) => dispatch({ type: "UPDATE_TRIP", index: idx, fields: { origin_country: v || null } })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <EditableCell
                      value={trip.destination_country}
                      missing={missing.includes("destination_country")}
                      onChange={(v) => dispatch({ type: "UPDATE_TRIP", index: idx, fields: { destination_country: v || null } })}
                    />
                  </td>
                  <td className={`px-2 py-1.5 text-right font-mono ${isAmber ? "text-amber-700 font-bold" : ""}`}>
                    {days ?? "—"}
                    {isAmber && <span className="ml-1 text-amber-500" title=">180 days">⚠</span>}
                  </td>
                  <td className="px-2 py-1.5">
                    <EditableCell
                      value={trip.confirmation_number}
                      onChange={(v) => dispatch({ type: "UPDATE_TRIP", index: idx, fields: { confirmation_number: v } })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <EditableCell
                      value={trip.passenger_name}
                      onChange={(v) => dispatch({ type: "UPDATE_TRIP", index: idx, fields: { passenger_name: v } })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <EditableCell
                      value={trip.flight_number}
                      onChange={(v) => dispatch({ type: "UPDATE_TRIP", index: idx, fields: { flight_number: v || null } })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <EditableCell
                      value={trip.aircraft_type}
                      onChange={(v) => dispatch({ type: "UPDATE_TRIP", index: idx, fields: { aircraft_type: v || null } })}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-gray-400 truncate max-w-[80px]" title={trip._from}>
                    {trip.airline ?? trip._from ?? "—"}
                  </td>
                  <td className="px-2 py-1.5">
                    {/* Duplicate / parent group badges */}
                    {isDup && (
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700 mr-1">
                        duplicate
                      </span>
                    )}
                    {isParent && (
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700 mr-1"
                        title={`${trip._groupSize} emails with same confirmation number`}>
                        {trip._groupSize} related
                      </span>
                    )}

                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium cursor-default ${CONFIDENCE_BADGE[trip.confidence] ?? ""}`}
                      title={
                        trip.confidence === "rejected"
                          ? `AI confirmed: ${trip._rejectedReason ?? "not a flight booking"}`
                          : missing.length > 0
                            ? `Missing: ${missing.map(f => f.replace(/_/g, " ")).join(", ")}`
                            : trip._aiProvider
                              ? `via ${trip._aiProvider}`
                              : trip.confidence
                      }
                    >
                      {trip.confidence === "rejected" ? `✗ ${trip._rejectedReason ?? "not a flight"}` : trip.confidence}
                    </span>
                    {(trip.confidence === "unmatched" || trip.confidence === "low") && (
                      <button
                        onClick={() => handleAIParse(idx)}
                        disabled={!!aiLoading[idx]}
                        className="ml-1 text-[10px] text-blue-600 underline disabled:opacity-50"
                      >
                        {aiLoading[idx] ? "⏳" : "Try AI"}
                      </button>
                    )}
                    {/* Merge group button — only on the parent row */}
                    {isParent && (
                      <button
                        onClick={() => handleMergeGroupClick(trip._groupConf)}
                        className="ml-1 text-[10px] text-purple-600 underline font-medium"
                        title={`Preview and merge all ${trip._groupSize} tickets with PNR ${trip._groupConf}`}
                      >
                        Merge…
                      </button>
                    )}
                    {trip._emailId && (
                      <button
                        onClick={() => handlePreview(idx)}
                        disabled={!!previewLoading[idx]}
                        className="ml-1 text-[10px] text-gray-400 underline disabled:opacity-50"
                        title="View original email text"
                      >
                        {previewLoading[idx] ? "…" : "View"}
                      </button>
                    )}
                    {aiError[idx] && (
                      <div className="text-red-500 text-[9px] mt-0.5 max-w-[120px] break-words" title={aiError[idx]}>
                        ✗ {aiError[idx]}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    {deleteConfirm === idx ? (
                      <span className="flex gap-1 items-center">
                        <button
                          onClick={() => { dispatch({ type: "DELETE_TRIP", index: idx }); setDeleteConfirm(null); }}
                          className="text-[10px] bg-red-600 text-white px-1.5 py-0.5 rounded hover:bg-red-700 font-medium"
                        >
                          Delete
                        </button>
                        <button onClick={() => setDeleteConfirm(null)} className="text-gray-400 hover:text-gray-600 text-[10px]">✕</button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(idx)}
                        className="text-gray-400 hover:text-red-500 hover:bg-red-50 rounded p-0.5 transition-colors"
                        title="Delete row"
                      >
                        🗑
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {filteredTrips.length === 0 && (
              <tr>
                <td colSpan={15} className="px-4 py-6 text-center text-gray-400">
                  No trips found for this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <button
        onClick={() => dispatch({ type: "GO_TO_EXPORT" })}
        disabled={confirmedCount === 0}
        className="bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Continue to Export ({confirmedCount} confirmed)
      </button>

      {emailPreview && (
        <EmailPreviewModal text={emailPreview.text} onClose={() => setEmailPreview(null)} />
      )}

      {joinPreview && (
        <JoinPreviewModal
          tripA={trips[joinPreview.idxA]}
          tripB={trips[joinPreview.idxB]}
          onConfirm={confirmJoin}
          onCancel={() => setJoinPreview(null)}
        />
      )}

      {mergeGroupPreview && (
        <MergeGroupModal
          group={mergeGroupPreview.group}
          onConfirm={confirmMergeGroup}
          onCancel={() => setMergeGroupPreview(null)}
        />
      )}
    </div>
  );
}
