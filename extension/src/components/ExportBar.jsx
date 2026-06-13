import React, { useState } from "react";

function tripsToCSV(trips) {
  const headers = ["Country Visited", "Departure Date", "Return Date", "Days Abroad", "Flight #", "Aircraft", "Airline", "Confirmation #"];
  const rows = trips
    .filter((t) => t.confirmed)
    .map((t) => {
      const days =
        t.departure_date && t.return_date
          ? Math.max(
              0,
              (new Date(t.return_date) - new Date(t.departure_date)) / 86400000
            )
          : "";
      return [
        t.destination_country ?? "",
        t.departure_date ?? "",
        t.return_date ?? "",
        days,
        t.flight_number ?? "",
        t.aircraft_type ?? "",
        t.airline ?? "",
        t.confirmation_number ?? "",
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
    });
  return [headers.join(","), ...rows].join("\n");
}

function tripsToTable(trips) {
  return trips
    .filter((t) => t.confirmed)
    .map((t) => {
      const days =
        t.departure_date && t.return_date
          ? Math.max(0, (new Date(t.return_date) - new Date(t.departure_date)) / 86400000)
          : "";
      return [
        t.destination_country ?? "",
        t.departure_date ?? "",
        t.return_date ?? "",
        days,
      ].join("\t");
    })
    .join("\n");
}

export default function ExportBar({ trips }) {
  const [copied, setCopied] = useState(false);
  const confirmed = trips.filter((t) => t.confirmed);

  function handleCSV() {
    const csv = tripsToCSV(trips);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "triptrace_travel_history.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleCopy() {
    const text = tripsToTable(trips);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-3 mt-4 border-t border-gray-200 pt-4">
      <div className="text-xs text-gray-500">
        <strong className="text-gray-700">{confirmed.length}</strong> of{" "}
        {trips.length} trips confirmed and ready to export.
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleCopy}
          disabled={confirmed.length === 0}
          className="flex-1 text-sm bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg px-3 py-2 font-medium transition-colors"
        >
          {copied ? "✓ Copied!" : "Copy as Table"}
        </button>
        <button
          onClick={handleCSV}
          disabled={confirmed.length === 0}
          className="flex-1 text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg px-3 py-2 font-medium transition-colors"
        >
          Download CSV
        </button>
      </div>

      <p className="text-xs text-gray-400">
        "Copy as Table" pastes tab-separated data into Google Docs or Word.
        CSV download matches the USCIS N-400 Part 9 column order.
      </p>
    </div>
  );
}
