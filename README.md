# Multi-Cloud Explorer (OneDrive + Google Drive)

A premium, dual-pane file explorer built with **React + Vite**. Authenticate with your Microsoft and Google accounts to browse, organize, rename, delete, copy, and move files and folders side-by-side.

## Features
- **Flexible Dual-Pane Layout with Account Pick Lists**: Connect multiple OneDrive and Google Drive accounts simultaneously, and pick any saved connection in the Left or Right pane (supports **OneDrive ↔ Google Drive**, **OneDrive ↔ OneDrive**, and **Google Drive ↔ Google Drive**).
- **Multi-Account Connection Settings & Automatic Reconnection**:
  - Open **Connection Settings** in the sidebar to add, rename, configure, connect, disconnect, or remove multiple OneDrive and Google Drive accounts (`Auto-connect on startup`, optional per-account Azure/Google Client ID & Secret overrides, Microsoft authority, and default Copy/Move mode).
  - **OneDrive** isolates multiple Microsoft accounts via MSAL v5 (`homeAccountId` + dynamic MSAL instance registry, `localStorage` cache, and `ssoSilent` recovery).
  - **Google Drive** stores per-account OAuth 2.0 refresh tokens via `/api/google-auth` (both locally in Vite and on Vercel) so every saved Google Drive reconnects silently on startup and renews before expiry with zero popups (falls back gracefully to 1-hour GIS tokens if `GOOGLE_CLIENT_SECRET` is not set).
- **Multi-Select & Batch Drag & Drop (Copy & Move)**:
  - Select single or multiple files and folders via checkboxes, **Select All**, `Ctrl/Cmd+Click`, or `Shift+Click` range selection (`Esc` to clear).
  - Drag one or many selected items between any two connected accounts (OneDrive ↔ Google Drive, OneDrive ↔ OneDrive, or Google Drive ↔ Google Drive) — drop into the open folder or directly onto a target subfolder row.
  - **Copy by default**, with a sidebar **Copy / Move** switch and **`Shift`-key override** on drop.
  - Safe Move behavior: originals are sent to OneDrive Recycle Bin / Google Drive Trash only after upload completes cleanly.
- **Delete & Rename on Both Clouds**:
  - **Delete**: Select one or more items and click **Delete** (or press `Del`) to move them to OneDrive Recycle Bin or Google Drive Trash after confirmation.
  - **Rename**: Select an item and click **Rename** (or press `F2`) with extension-preserving selection and inline validation.
- **Automatic Google Workspace Export**: Google Docs, Sheets, Slides, and Drawings are exported automatically to `.docx`, `.xlsx`, `.pptx`, and `.png` when transferred to OneDrive.
- **Large Folder & Large File Support**:
  - **Unlimited Folder Pagination**: Follows OneDrive `@odata.nextLink` and Google Drive `nextPageToken` with automatic infinite scroll, **Load more / Load all** controls, and complete multi-page recursive folder transfers (no 200-item cap).
  - **Streaming Transfer Relay**: Node / Vercel streaming relay (`/api/transfer-file`) handles resumable 5 MiB chunk uploads and live progress bars without browser CORS or size caps.
- **Custom Icon Mapping**: Visual icons for Office, PDF, media, code, archives, and Google Workspace MIME types.

## Getting Started

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment**:
   Create a `.env` file based on `.env.example`:
   ```env
   VITE_CLIENT_ID=your_azure_client_id
   VITE_GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret # optional, enables silent Google auto-reconnect
   ```

3. **Required OAuth Scopes**:
   - **Azure App Registration**: `User.Read`, `Files.ReadWrite` (Microsoft Graph delegated permissions).
   - **Google Cloud Console**: `https://www.googleapis.com/auth/drive` (Google Auth Platform → Data Access). While the app is in **Testing** mode, add every Google account you plan to connect under **Google Auth Platform → Audience → Test users**.

4. **Run locally**:
   ```bash
   npm run dev
   ```
   Open **http://localhost:5173/** in Chrome or Edge.

5. **Documentation**:
   Detailed specifications and architecture diagrams are in [docs/](./docs/) ([APPLICATION_SPEC.md](./docs/APPLICATION_SPEC.md), [ARCHITECTURE.md](./docs/ARCHITECTURE.md)).

## Deploying to Vercel (Free, No Local Server Needed)
This repository is pre-configured for **Vercel** (`vercel.json` + `api/transfer-file.js` + `api/google-auth.js` serverless functions):
1. Import `Evanlaer/onedrive-explorer` on [vercel.com](https://vercel.com/new).
2. Add environment variables `VITE_CLIENT_ID`, `VITE_GOOGLE_CLIENT_ID`, and (for automatic Google Drive reconnection) `GOOGLE_CLIENT_SECRET` in Vercel Project Settings.
3. Click **Deploy** to get your HTTPS URL (e.g. `https://your-app.vercel.app`).
4. Add your Vercel URL to:
   - **Azure Portal** → App Registration → **Authentication** → **Single-page application (SPA) Redirect URIs**.
   - **Google Cloud Console** → **OAuth 2.0 Client ID** → **Authorized JavaScript origins**.

## Security & Authentication
- **OneDrive**: Microsoft MSAL (OAuth 2.0 Authorization Code + PKCE). Uses `localStorage` when Auto-Connect is enabled in Connection Settings, or `sessionStorage` when disabled.
- **Google Drive**: Google Identity Services (GIS Authorization Code popup + `/api/google-auth` refresh token exchange when `GOOGLE_CLIENT_SECRET` is configured, with automatic fallback to standard GIS Token Client).
- No secrets are committed to the repository; `GOOGLE_CLIENT_SECRET` stays server-side when configured via `.env` or Vercel Environment Variables.
- The transfer relay only accepts HTTPS URLs on allowlisted Microsoft/OneDrive and Google Drive domains.
