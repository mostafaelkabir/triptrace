/**
 * TripTrace parser accuracy eval script.
 *
 * Runs each labeled fixture through the regex pipeline (findParser + runPipeline)
 * and the looksLikeConfirmation pre-filter, then compares against expected output.
 *
 * Usage: node src/emailClients/__tests__/eval/run.js
 *
 * Output: per-fixture pass/fail table + aggregate field accuracy.
 */

import { findParser, runPipeline } from "../../../parsers/engine.js";
import { looksLikeConfirmation, subjectIsHardReject } from "../../gmail.js";
import { fixtures } from "./fixtures.js";

const FIELDS_TO_CHECK = ["departure_date", "destination_country", "flight_number"];

const RESET  = "\x1b[0m";
const GREEN  = "\x1b[32m";
const RED    = "\x1b[31m";
const YELLOW = "\x1b[33m";
const BOLD   = "\x1b[1m";

function pass(s) { return `${GREEN}✓ ${s}${RESET}`; }
function fail(s) { return `${RED}✗ ${s}${RESET}`; }
function warn(s) { return `${YELLOW}~ ${s}${RESET}`; }

let totalFixtures = 0;
let passedFixtures = 0;
const fieldResults = Object.fromEntries(FIELDS_TO_CHECK.map(f => [f, { correct: 0, total: 0 }]));
const failures = [];

for (const fixture of fixtures) {
  totalFixtures++;
  const { id, from, subject, body, expected } = fixture;

  // Step 1: subject hard-reject (for non-booking subjects)
  if (subjectIsHardReject(subject)) {
    if (expected.is_flight === false) {
      console.log(pass(`[${id}] correctly filtered by subject hard-reject`));
      passedFixtures++;
    } else {
      console.log(fail(`[${id}] FALSE NEGATIVE — blocked by subjectIsHardReject but expected is_flight=true`));
      failures.push({ id, reason: "subjectIsHardReject false negative" });
    }
    continue;
  }

  // Step 2: body filter
  const parser = findParser(from);
  const isKnownSender = parser != null;
  const looksLike = looksLikeConfirmation(body, isKnownSender);

  if (!looksLike) {
    if (expected.is_flight === false) {
      console.log(pass(`[${id}] correctly filtered by looksLikeConfirmation`));
      passedFixtures++;
    } else {
      console.log(fail(`[${id}] FALSE NEGATIVE — looksLikeConfirmation returned false but expected is_flight=true`));
      failures.push({ id, reason: "looksLikeConfirmation false negative" });
    }
    continue;
  }

  // For expected non-flights that weren't filtered — false positive
  if (expected.is_flight === false) {
    console.log(fail(`[${id}] FALSE POSITIVE — passed filters but expected is_flight=false`));
    failures.push({ id, reason: "false positive - passed filters" });
    continue;
  }

  // Step 3: run pipeline
  const trip = parser
    ? runPipeline(body, from, subject)
    : null;

  if (!trip || trip.confidence === "unmatched") {
    // No parser match — record as "unmatched" but still check if expected fields can be inferred
    const summary = `[${id}] unmatched (no parser for ${from.split("@")[1] ?? from})`;
    console.log(warn(summary));
    // Don't count as pass or fail for filter — still tally field accuracy
    for (const field of FIELDS_TO_CHECK) {
      if (expected[field] !== null) {
        fieldResults[field].total++;
        // unmatched = no field extracted = fail for that field
      }
    }
    continue;
  }

  // Step 4: field-level accuracy
  let fixturePass = true;
  const fieldNotes = [];

  for (const field of FIELDS_TO_CHECK) {
    if (expected[field] === null) continue; // don't check this field
    fieldResults[field].total++;
    const actual = trip[field];
    if (actual === expected[field]) {
      fieldResults[field].correct++;
      fieldNotes.push(`${field}=${actual}`);
    } else {
      fixturePass = false;
      fieldNotes.push(`${RED}${field}: got "${actual}" expected "${expected[field]}"${RESET}`);
    }
  }

  if (fixturePass) {
    console.log(pass(`[${id}] ${fieldNotes.join(" | ")}`));
    passedFixtures++;
  } else {
    console.log(fail(`[${id}] ${fieldNotes.join(" | ")}`));
    failures.push({ id, reason: fieldNotes.join(", ") });
  }
}

// Summary
console.log("\n" + "─".repeat(60));
console.log(`${BOLD}Results: ${passedFixtures}/${totalFixtures} fixtures passed${RESET}`);
console.log("─".repeat(60));
for (const field of FIELDS_TO_CHECK) {
  const { correct, total } = fieldResults[field];
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  const color = pct >= 90 ? GREEN : pct >= 70 ? YELLOW : RED;
  console.log(`  ${field.padEnd(22)} ${color}${correct}/${total} (${pct}%)${RESET}`);
}

if (failures.length > 0) {
  console.log("\nFailed fixtures:");
  failures.forEach(f => console.log(`  ${RED}• ${f.id}: ${f.reason}${RESET}`));
}
console.log("");
