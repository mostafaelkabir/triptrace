// Service worker: handles OAuth token management and side panel activation

// Azure App Registration client ID — replace with your own after setup.
// Setup guide: docs/outlook-oauth-setup.md
const OUTLOOK_CLIENT_ID = "cbfa6a17-6952-4729-b7e3-0520ec745859";

chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// ── PKCE helpers ─────────────────────────────────────────────────────────────

function base64url(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function generatePKCE() {
  const verifierBytes = new Uint8Array(32);
  crypto.getRandomValues(verifierBytes);
  const codeVerifier = base64url(verifierBytes);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(codeVerifier)
  );
  const codeChallenge = base64url(digest);
  return { codeVerifier, codeChallenge };
}

// ── Message handlers ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {

  // ── Outlook / Microsoft OAuth (PKCE authorization code flow) ──────────────
  if (message.type === "GET_OUTLOOK_TOKEN") {
    (async () => {
      try {
        console.log("[Outlook] Starting PKCE flow");
        const { codeVerifier, codeChallenge } = await generatePKCE();
        const redirectUri = chrome.identity.getRedirectURL("outlook");
        console.log("[Outlook] Redirect URI:", redirectUri);

        const scope = [
          "https://graph.microsoft.com/Mail.Read",
          "offline_access",
        ].join(" ");

        const authUrl =
          `https://login.microsoftonline.com/common/oauth2/v2.0/authorize` +
          `?client_id=${encodeURIComponent(OUTLOOK_CLIENT_ID)}` +
          `&response_type=code` +
          `&redirect_uri=${encodeURIComponent(redirectUri)}` +
          `&scope=${encodeURIComponent(scope)}` +
          `&code_challenge=${codeChallenge}` +
          `&code_challenge_method=S256` +
          `&response_mode=query`;

        console.log("[Outlook] Launching web auth flow…");
        const redirectUrl = await new Promise((resolve, reject) => {
          chrome.identity.launchWebAuthFlow(
            { url: authUrl, interactive: true },
            (url) => {
              if (chrome.runtime.lastError || !url) {
                const msg = chrome.runtime.lastError?.message ?? "Outlook auth cancelled";
                console.error("[Outlook] launchWebAuthFlow error:", msg);
                reject(new Error(msg));
              } else {
                console.log("[Outlook] Got redirect URL:", url.substring(0, 80));
                resolve(url);
              }
            }
          );
        });

        const code = new URL(redirectUrl).searchParams.get("code");
        if (!code) throw new Error("No authorization code in redirect URL");
        console.log("[Outlook] Got auth code, exchanging for token…");

        // Exchange code + verifier for token (no client_secret needed for PKCE)
        const tokenRes = await fetch(
          "https://login.microsoftonline.com/common/oauth2/v2.0/token",
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: OUTLOOK_CLIENT_ID,
              grant_type: "authorization_code",
              code,
              redirect_uri: redirectUri,
              code_verifier: codeVerifier,
            }).toString(),
          }
        );
        const tokenData = await tokenRes.json();
        console.log("[Outlook] Token response keys:", Object.keys(tokenData));
        if (!tokenData.access_token) {
          throw new Error(tokenData.error_description ?? "Token exchange failed");
        }
        sendResponse({ token: tokenData.access_token });
      } catch (e) {
        sendResponse({ error: e.message });
      }
    })();
    return true; // keep message channel open for async response
  }

  if (message.type === "REMOVE_OUTLOOK_TOKEN") {
    chrome.storage.local.remove(["accessToken", "provider"]);
    sendResponse({ ok: true });
    return true;
  }

  // ── Gmail OAuth ────────────────────────────────────────────────────────────
  if (message.type === "GET_AUTH_TOKEN") {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (chrome.runtime.lastError || !token) {
        chrome.identity.getAuthToken({ interactive: true }, (token2) => {
          if (chrome.runtime.lastError) {
            sendResponse({ error: chrome.runtime.lastError.message });
          } else {
            sendResponse({ token: token2 });
          }
        });
      } else {
        sendResponse({ token });
      }
    });
    return true;
  }

  if (message.type === "REMOVE_AUTH_TOKEN") {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (token) {
        chrome.identity.removeCachedAuthToken({ token }, () => sendResponse({ ok: true }));
      } else {
        sendResponse({ ok: true });
      }
    });
    return true;
  }

  // Evict the stale cached token then get a fresh one interactively.
  // Called by the Gmail client when it receives a 401.
  if (message.type === "REFRESH_AUTH_TOKEN") {
    chrome.identity.getAuthToken({ interactive: false }, (staleToken) => {
      const evict = staleToken
        ? (cb) => chrome.identity.removeCachedAuthToken({ token: staleToken }, cb)
        : (cb) => cb();
      evict(() => {
        chrome.identity.getAuthToken({ interactive: true }, (newToken) => {
          if (chrome.runtime.lastError || !newToken) {
            sendResponse({ error: chrome.runtime.lastError?.message ?? "Re-auth failed" });
          } else {
            sendResponse({ token: newToken });
          }
        });
      });
    });
    return true;
  }
});
