# Google OAuth Setup for TripTrace

## Steps

1. **Create a Google Cloud project**
   - Go to https://console.cloud.google.com/
   - Click "New Project" → name it "TripTrace"

2. **Enable the Gmail API**
   - In the project, go to "APIs & Services" → "Library"
   - Search "Gmail API" → click Enable

3. **Configure the OAuth consent screen**
   - Go to "APIs & Services" → "OAuth consent screen"
   - Select "External" → fill in app name "TripTrace", your email
   - Add scope: `https://www.googleapis.com/auth/gmail.readonly`
   - Add your email as a test user (while in development)

4. **Create an OAuth 2.0 client for Chrome extension**
   - Go to "APIs & Services" → "Credentials" → "Create Credentials" → "OAuth client ID"
   - Application type: **Chrome extension**
   - Extension ID: load the unpacked extension in Chrome first (`chrome://extensions/` → Load unpacked → select `extension/dist/`)
   - Copy the Extension ID shown in the Chrome extensions page
   - Paste it in the "Application ID" field
   - Click Create → copy the **Client ID**

5. **Paste the client ID into manifest.json**
   ```json
   "oauth2": {
     "client_id": "YOUR_CLIENT_ID_HERE.apps.googleusercontent.com",
     "scopes": ["https://www.googleapis.com/auth/gmail.readonly"]
   }
   ```

6. **Rebuild and reload**
   - Run `npm run build` in `extension/`
   - In Chrome: click the reload icon on the TripTrace extension

> Note: The Extension ID changes if you load the extension from a different folder.
> For a stable ID, you can generate a key pair — see Chrome docs on "Keeping a consistent extension ID".
