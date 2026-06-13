import React, { useReducer, useEffect, useRef, useCallback } from "react";
import ConnectStep from "./components/ConnectStep.jsx";
import ScanStep from "./components/ScanStep.jsx";
import ReviewTable from "./components/ReviewTable.jsx";
import ExportBar from "./components/ExportBar.jsx";
import PaywallModal from "./components/PaywallModal.jsx";
import { verifyLicense } from "./api.js";
import { deduplicateTrips } from "./scan.js";
import { scanGmail } from "./scan.js";

const STEPS = ["connect", "scan", "review", "export"];
const STEP_LABELS = { connect: "Connect", scan: "Scan", review: "Review", export: "Export" };
const FREE_TRIP_LIMIT = 100;

function getDefaultDateRange() {
  const end = new Date();
  const start = new Date();
  start.setFullYear(start.getFullYear() - 5);
  return { startDate: start.toISOString().split("T")[0], endDate: end.toISOString().split("T")[0] };
}

const initialState = {
  step: "connect",
  accessToken: null,
  provider: "gmail",
  license: null,
  devMode: false,
  trips: [],
  jobs: [],           // [{ id, provider, token, status, progress, error }]
  dateRange: getDefaultDateRange(),
  showPaywall: false,
};

export function reducer(state, action) {
  switch (action.type) {
    case "SET_TOKEN":
      if (typeof chrome !== "undefined" && chrome.storage) {
        chrome.storage.local.set({ accessToken: action.token, provider: action.provider ?? "gmail" });
      }
      return { ...state, accessToken: action.token, provider: action.provider ?? "gmail", step: "scan" };

    case "DISCONNECT":
      if (typeof chrome !== "undefined" && chrome.storage) {
        chrome.storage.local.remove(["accessToken", "provider"]);
      }
      return { ...initialState, dateRange: getDefaultDateRange() };

    case "SET_LICENSE":
      if (action.license && typeof chrome !== "undefined" && chrome.storage) {
        chrome.storage.local.set({ license: action.license });
        window.__triptrace_license_token = action.license.token;
      }
      return { ...state, license: action.license, showPaywall: false };

    case "SET_TRIPS":
      return { ...state, trips: action.trips, step: "review" };

    case "ADD_TRIPS":
      return { ...state, trips: [...state.trips, ...action.trips], step: "review" };

    case "UPDATE_TRIP": {
      const updated = state.trips.map((t, i) => {
        if (i !== action.index) return t;
        const merged = { ...t, ...action.fields };
        const stillMissing = (merged._missingFields ?? []).filter((f) => !merged[f]);
        merged._missingFields = stillMissing;
        if (merged.departure_date && merged.destination_country &&
            (merged.confidence === "low" || merged.confidence === "unmatched")) {
          merged.confidence = "manual";
        }
        return merged;
      });
      return { ...state, trips: updated };
    }

    case "ADD_TRIP":
      return {
        ...state,
        trips: [...state.trips, {
          departure_date: null, return_date: null, trip_type: null,
          origin_country: "United States", destination_country: null,
          airline: null, flight_number: null, aircraft_type: null,
          confirmation_number: null,
          confidence: "manual", confirmed: false,
        }],
      };

    case "DELETE_TRIP":
      return { ...state, trips: state.trips.filter((_, i) => i !== action.index) };

    case "CONFIRM_TRIP":
      return { ...state, trips: state.trips.map((t, i) => i === action.index ? { ...t, confirmed: !t.confirmed } : t) };

    case "DEDUPLICATE":
      return { ...state, trips: deduplicateTrips(state.trips) };

    case "MERGE_GROUP": {
      const { confirmationNumber } = action;
      const group = state.trips.filter((t) => t.confirmation_number === confirmationNumber);
      const insertAt = state.trips.findIndex((t) => t.confirmation_number === confirmationNumber);
      const sorted = [...group].sort((a, b) => {
        const count = (t) => ["departure_date","return_date","destination_country","origin_country","airline","passenger_name"]
          .filter((k) => t[k] != null).length;
        return count(b) - count(a);
      });
      const base = { ...sorted[0] };
      for (const other of sorted.slice(1)) {
        for (const key of Object.keys(other)) {
          if (base[key] == null && other[key] != null) base[key] = other[key];
        }
      }
      const deps = group.map((t) => t.departure_date).filter(Boolean).sort();
      const rets = group.map((t) => t.return_date).filter(Boolean).sort();
      if (deps.length > 0) base.departure_date = deps[0];
      if (rets.length > 0) base.return_date = rets[rets.length - 1];
      if (!base.return_date && deps.length > 1) base.return_date = deps[deps.length - 1];
      if (base.return_date) base.trip_type = "round-trip";
      base.confidence = "merged";
      base.confirmed = false;
      const rest = state.trips.filter((t) => t.confirmation_number !== confirmationNumber);
      rest.splice(insertAt, 0, base);
      return { ...state, trips: rest };
    }

    case "JOIN_TRIPS": {
      const { indexA, indexB } = action;
      const a = state.trips[indexA];
      const b = state.trips[indexB];
      const [outbound, inbound] = (a.departure_date ?? "") <= (b.departure_date ?? "") ? [a, b] : [b, a];
      const joinedAirline = [outbound.airline, inbound.airline]
        .filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i).join(" + ") || null;
      const joinedConf = [outbound.confirmation_number, inbound.confirmation_number]
        .filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i).join(" + ") || null;
      const joined = {
        departure_date: outbound.departure_date, return_date: inbound.departure_date,
        trip_type: "round-trip",
        origin_country: outbound.origin_country ?? inbound.destination_country ?? "United States",
        destination_country: outbound.destination_country ?? inbound.origin_country,
        airline: joinedAirline, confirmation_number: joinedConf,
        passenger_name: outbound.passenger_name ?? inbound.passenger_name,
        confidence: "manual", confirmed: false,
        _from: [outbound._from, inbound._from].filter(Boolean).join(", "),
        _subject: outbound._subject, _emailId: outbound._emailId, _threadId: outbound._threadId,
      };
      const minIdx = Math.min(indexA, indexB);
      const newTrips = state.trips.filter((_, i) => i !== indexA && i !== indexB);
      newTrips.splice(minIdx, 0, joined);
      return { ...state, trips: newTrips };
    }

    // ── Scan jobs ──────────────────────────────────────────────────────────────
    case "ADD_JOB":
      return { ...state, jobs: [...state.jobs, action.job] };

    case "UPDATE_JOB":
      return {
        ...state,
        jobs: state.jobs.map((j) => j.id === action.id ? { ...j, ...action.updates } : j),
      };

    case "REMOVE_JOB":
      return { ...state, jobs: state.jobs.filter((j) => j.id !== action.id) };

    case "SET_DEV_MODE":
      if (typeof chrome !== "undefined" && chrome.storage) {
        chrome.storage.local.set({ devMode: action.enabled });
      }
      return { ...state, devMode: action.enabled };

    case "SET_DATE_RANGE":
      return { ...state, dateRange: action.dateRange };
    case "SHOW_PAYWALL":
      return { ...state, showPaywall: true };
    case "HIDE_PAYWALL":
      return { ...state, showPaywall: false };
    case "GO_TO_EXPORT":
      return { ...state, step: "export" };
    default:
      return state;
  }
}

// ── Scan job runner (lives outside components so it survives step changes) ───

let _jobCounter = 0;

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const activeJobsRef = useRef({}); // jobId -> { cancelled: bool }

  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.storage) return;
    chrome.storage.local.get(["accessToken", "provider", "license", "devMode"], async (result) => {
      if (result.devMode) dispatch({ type: "SET_DEV_MODE", enabled: true });
      if (result.accessToken) {
        dispatch({ type: "SET_TOKEN", token: result.accessToken, provider: result.provider ?? "gmail" });
      }
      if (result.license?.token) {
        try {
          const { valid, tier } = await verifyLicense(result.license.token);
          if (valid) {
            window.__triptrace_license_token = result.license.token;
            dispatch({ type: "SET_LICENSE", license: { tier, token: result.license.token } });
          }
        } catch { /* treat as free */ }
      }
    });
  }, []);

  const startScanJob = useCallback(async ({ token, provider, dateRange, isUnlocked }) => {
    const id = `job-${++_jobCounter}-${provider}`;
    const ctrl = { cancelled: false };
    activeJobsRef.current[id] = ctrl;

    const job = {
      id, provider, token,
      status: "scanning",   // scanning | done | error
      progress: { scanned: 0, total: 0, found: 0 },
      error: null,
    };
    dispatch({ type: "ADD_JOB", job });
    dispatch({ type: "SET_TRIPS", trips: state.trips }); // ensure review step visible

    try {
      const trips = await scanGmail(
        token,
        {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          paywallLimit: isUnlocked ? null : FREE_TRIP_LIMIT,
          provider,
        },
        (p) => {
          if (ctrl.cancelled) return;
          dispatch({ type: "UPDATE_JOB", id, updates: { progress: p } });
        }
      );

      if (!ctrl.cancelled) {
        dispatch({ type: "ADD_TRIPS", trips });
        dispatch({ type: "UPDATE_JOB", id, updates: { status: "done", progress: { ...job.progress, found: trips.length } } });
      }
    } catch (err) {
      if (!ctrl.cancelled) {
        dispatch({ type: "UPDATE_JOB", id, updates: { status: "error", error: err.message } });
      }
    } finally {
      delete activeJobsRef.current[id];
    }
  }, [state.trips]);

  const cancelJob = useCallback((id) => {
    if (activeJobsRef.current[id]) activeJobsRef.current[id].cancelled = true;
    dispatch({ type: "REMOVE_JOB", id });
  }, []);

  const isPaid = state.license?.tier === "paid";
  const isUnlocked = isPaid || state.devMode;
  const currentIdx = STEPS.indexOf(state.step);
  const activeJobs = state.jobs.filter((j) => j.status === "scanning");

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 font-sans text-sm text-gray-800 w-full">
      <header className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center gap-1 flex-wrap">
          <span className="font-bold text-blue-600 text-base mr-3">TripTrace</span>
          {STEPS.map((s, i) => (
            <React.Fragment key={s}>
              {i > 0 && <span className="text-gray-300 text-xs">›</span>}
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${s === state.step ? "bg-blue-100 text-blue-700" : i < currentIdx ? "text-green-600" : "text-gray-400"}`}>
                {i < currentIdx ? "✓ " : ""}{STEP_LABELS[s]}
              </span>
            </React.Fragment>
          ))}
          {isPaid && <span className="ml-auto text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Pro</span>}
          {state.devMode && <span className="ml-auto text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">⚙ Dev</span>}
        </div>

        {/* Active job status bar */}
        {activeJobs.length > 0 && (
          <div className="mt-2 flex flex-col gap-1">
            {activeJobs.map((job) => (
              <div key={job.id} className="flex items-center gap-2 text-xs text-gray-600">
                <span className="animate-pulse text-blue-500">●</span>
                <span className="capitalize font-medium">{job.provider}</span>
                <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                  <div
                    className="bg-blue-500 h-1.5 rounded-full transition-all"
                    style={{ width: job.progress.total ? `${Math.round((job.progress.scanned / job.progress.total) * 100)}%` : "5%" }}
                  />
                </div>
                <span className="text-gray-400 shrink-0">
                  {job.progress.total > 0 ? `${job.progress.scanned}/${job.progress.total}` : "starting…"}
                </span>
                <button
                  onClick={() => cancelJob(job.id)}
                  className="text-gray-400 hover:text-red-500 px-1"
                  title="Cancel scan"
                >✕</button>
              </div>
            ))}
          </div>
        )}
        {state.jobs.filter(j => j.status === "error").map((job) => (
          <div key={job.id} className="mt-1 text-xs text-red-600 flex items-center gap-2">
            <span>⚠ {job.provider} scan failed: {job.error}</span>
            <button onClick={() => dispatch({ type: "REMOVE_JOB", id: job.id })} className="text-gray-400 hover:text-red-500">✕</button>
          </div>
        ))}
      </header>

      <main className="flex-1 overflow-auto p-4">
        {state.step === "connect" && (
          <ConnectStep dispatch={dispatch} />
        )}
        {state.step === "scan" && (
          <ScanStep
            accessToken={state.accessToken}
            provider={state.provider}
            dateRange={state.dateRange}
            isPaid={isPaid}
            isDevMode={state.devMode}
            freeTripLimit={FREE_TRIP_LIMIT}
            dispatch={dispatch}
            onStartJob={startScanJob}
          />
        )}
        {(state.step === "review" || state.step === "export") && (
          <ReviewTable
            trips={state.trips}
            dispatch={dispatch}
            accessToken={state.accessToken}
            provider={state.provider}
            jobs={state.jobs}
            dateRange={state.dateRange}
            isUnlocked={isUnlocked}
            onStartJob={startScanJob}
          />
        )}
        {state.step === "export" && <ExportBar trips={state.trips} />}
      </main>

      {state.showPaywall && <PaywallModal dispatch={dispatch} license={state.license} />}

      <footer className="border-t border-gray-200 bg-white px-4 py-2 text-xs text-gray-400 leading-snug">
        TripTrace does not provide legal advice. Always verify all records with a qualified immigration attorney before submitting to USCIS.
      </footer>
    </div>
  );
}
