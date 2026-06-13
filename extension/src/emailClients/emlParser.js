import { stripHtml, looksLikeConfirmation } from "./gmail.js";

/**
 * Decode a quoted-printable encoded string.
 */
function decodeQuotedPrintable(str) {
  return str
    .replace(/=\r?\n/g, "")                          // soft line breaks
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * Decode a base64-encoded string, handling line wrapping.
 */
function decodeBase64Part(str) {
  try {
    return atob(str.replace(/\s+/g, ""));
  } catch {
    return str;
  }
}

/**
 * Decode an encoded-word header value: =?charset?encoding?text?=
 */
function decodeEncodedWord(str) {
  return str.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, charset, enc, text) => {
    try {
      const decoded = enc.toUpperCase() === "B"
        ? decodeBase64Part(text)
        : decodeQuotedPrintable(text.replace(/_/g, " "));
      return decoded;
    } catch {
      return text;
    }
  });
}

/**
 * Parse the headers block of a MIME part into a key→value map.
 * Keys are lowercased; values are decoded.
 */
function parseHeaders(headerBlock) {
  const headers = {};
  // Unfold multi-line headers
  const unfolded = headerBlock.replace(/\r?\n[ \t]+/g, " ");
  for (const line of unfolded.split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const val = decodeEncodedWord(line.slice(colon + 1).trim());
    headers[key] = val;
  }
  return headers;
}

/**
 * Extract boundary string from a Content-Type header value.
 * e.g.  multipart/mixed; boundary="---=_Part_123"
 */
function getBoundary(contentType) {
  const m = contentType?.match(/boundary\s*=\s*"?([^";]+)"?/i);
  return m ? m[1].trim() : null;
}

/**
 * Recursively extract the best plain-text representation from a MIME tree.
 * Returns "" if nothing found.
 */
function extractTextFromMime(rawHeaders, body, contentType, encoding) {
  const ct = (contentType || "text/plain").toLowerCase();
  const enc = (encoding || "7bit").toLowerCase();

  if (ct.startsWith("multipart/")) {
    const boundary = getBoundary(contentType);
    if (!boundary) return "";
    const parts = body.split(new RegExp(`--${escapeRegex(boundary)}(?:--)?`));
    const texts = [];
    for (const part of parts) {
      const trimmed = part.replace(/^\r?\n/, "");
      if (!trimmed || trimmed.trim() === "--") continue;
      const blankLine = trimmed.search(/\r?\n\r?\n/);
      if (blankLine < 0) continue;
      const partHeaderBlock = trimmed.slice(0, blankLine);
      const partBody = trimmed.slice(blankLine).replace(/^\r?\n/, "");
      const partHeaders = parseHeaders(partHeaderBlock);
      const text = extractTextFromMime(
        partHeaders,
        partBody,
        partHeaders["content-type"],
        partHeaders["content-transfer-encoding"]
      );
      if (text) texts.push(text);
    }
    // For multipart/alternative, prefer the last part (usually HTML); strip it.
    // For multipart/mixed, join all parts.
    return ct.startsWith("multipart/alternative")
      ? texts[texts.length - 1] ?? ""
      : texts.join("\n\n");
  }

  // Decode transfer encoding
  let decoded = body;
  if (enc === "base64") {
    decoded = decodeBase64Part(body);
  } else if (enc === "quoted-printable") {
    decoded = decodeQuotedPrintable(body);
  }

  if (ct.startsWith("text/html")) {
    return stripHtml(decoded);
  }
  if (ct.startsWith("text/plain")) {
    return decoded;
  }
  return "";
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Parse a raw .eml string into { from, subject, date, body }.
 */
export function parseEml(raw) {
  const normalised = raw.replace(/\r\n/g, "\n");
  const blankLine = normalised.search(/\n\n/);
  if (blankLine < 0) return { from: "", subject: "", date: "", body: "" };

  const headerBlock = normalised.slice(0, blankLine);
  const bodyRaw = normalised.slice(blankLine + 2);
  const headers = parseHeaders(headerBlock);

  const body = extractTextFromMime(
    headers,
    bodyRaw,
    headers["content-type"],
    headers["content-transfer-encoding"]
  );

  return {
    from: headers["from"] ?? "",
    subject: headers["subject"] ?? "",
    date: headers["date"] ?? "",
    body,
  };
}

/**
 * Read a File object as text and parse it.
 * @param {File} file
 * @returns {Promise<{from, subject, date, body}>}
 */
export function readEmlFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        resolve(parseEml(e.target.result));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsText(file, "utf-8");
  });
}

/**
 * Process an array of .eml File objects into TripRecord-like objects.
 * Runs the same looksLikeConfirmation filter and runPipeline logic.
 * @param {File[]} files
 * @param {(progress: {scanned, total, found}) => void} [onProgress]
 * @returns {Promise<Array<{from, subject, body, _fileName}>>}
 * Returned objects are "raw candidates" — caller runs them through runPipeline.
 */
export async function parseEmlFiles(files, onProgress) {
  const results = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      const { from, subject, date, body } = await readEmlFile(file);
      const isKnownSender = false; // treat file imports as unknown sender
      if (body && looksLikeConfirmation(body, isKnownSender)) {
        results.push({ from, subject, date, body, _fileName: file.name });
      }
    } catch {
      // skip unreadable files silently
    }
    if (onProgress) onProgress({ scanned: i + 1, total: files.length, found: results.length });
  }
  return results;
}
