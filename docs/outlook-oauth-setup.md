# Outlook OAuth Setup (Azure App Registration)

TripTrace connects to Outlook using Microsoft's official OAuth — the same way
any reputable app connects to Microsoft accounts. You register your app in Azure
once, copy a client ID, and all your users can sign in with their Outlook accounts.

---

## Step 1 — Create an Azure account with a non-Microsoft email

> **Why?** Personal Outlook/Hotmail accounts are part of a shared Microsoft tenant
> that blocks new app registrations. Using a Gmail or other non-Microsoft email
> creates a fresh, unrestricted tenant.

1. Go to **https://portal.azure.com**
2. Click **"Sign in"** → then **"Create one!"** (or "No account? Create one")
3. Choose **"Use a phone number or email address instead"** and enter your **Gmail address**
4. Complete the sign-up flow — no credit card required
5. You now have an Azure account with a clean tenant where app registrations work

---

## Step 2 — Register TripTrace as an Azure application

1. In the Azure portal, search **"App registrations"** in the top search bar and click it
2. Click **"+ New registration"**
3. Fill in:
   - **Name**: `TripTrace`
   - **Supported account types**: **"Accounts in any organizational directory and personal Microsoft accounts"**
     (this covers both Outlook.com personal and work/school accounts)
   - **Redirect URI**: leave blank for now
4. Click **Register**
5. On the app overview page, copy the **Application (client) ID** — save it for Step 5

---

## Step 3 — Add the Chrome extension redirect URI

1. In your app → **Authentication** (left sidebar)
2. Click **"Add a platform"** → choose **"Mobile and desktop applications"**
3. In the **"Custom redirect URIs"** box enter your extension's redirect URI:

   ```
   https://<YOUR_EXTENSION_ID>.chromiumapp.org/outlook
   ```

   **To find your extension ID:** go to `chrome://extensions` → enable Developer mode →
   find TripTrace → copy the ID shown below the name (looks like `abcdefghijklmnop...`).

4. Click **Configure**, then **Save**

---

## Step 4 — Add Mail.Read permission (read-only)

1. In your app → **API permissions** (left sidebar)
2. Click **"Add a permission"** → **Microsoft Graph** → **Delegated permissions**
3. Search for **`Mail.Read`** → check it → **Add permissions**
4. Click **"Grant admin consent for [your tenant]"** → **Yes**

> TripTrace only needs `Mail.Read`. Do **not** add write, send, calendar, or contacts permissions.

---

## Step 5 — Add the client ID to the extension

Open `extension/background.js` and replace line 5:

```js
// Before:
const OUTLOOK_CLIENT_ID = "YOUR_AZURE_CLIENT_ID";

// After (use your actual ID from Step 2):
const OUTLOOK_CLIENT_ID = "b1234567-abcd-1234-abcd-1234567890ab";
```

Then rebuild and reload:

```bash
cd extension && npm run build
# Then: chrome://extensions → TripTrace → click the refresh icon
```

---

## Step 6 — Test the connection

1. Open the TripTrace side panel → click **"Continue with Outlook"**
2. A Microsoft sign-in popup appears
3. Sign in with your Outlook.com, Hotmail, or work account
4. Accept the **"Read your mail"** permission
5. The panel advances to Scan showing "Outlook"

---

## Troubleshooting

**"AADSTS700016" — Application not found**
Check that the client ID in `background.js` matches exactly (no spaces, correct UUID format).

**"AADSTS50011" — Redirect URI mismatch**
The URI in Azure must exactly match what Chrome generates. To check, open the extension's
service worker console (`chrome://extensions` → TripTrace → "Service Worker" link) and run:
```js
chrome.identity.getRedirectURL("outlook")
```
Copy that exact URL into Azure → Authentication → Mobile/desktop URIs.

**"Need admin approval" error**
Go to Azure → your app → Authentication → change "Supported account types" to include
personal Microsoft accounts (the broadest option).

**Popup closes immediately without completing**
Check the service worker console for errors. Ensure `https://login.microsoftonline.com/*`
is listed in `manifest.json` host_permissions (it is by default).
