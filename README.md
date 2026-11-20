# Multi-Cloud Explorer (OneDrive + Google Drive)

A premium, dual-pane file explorer built with **React + Vite**. Authenticate with your Microsoft and Google accounts to browse, organize, rename, delete, copy, and move files and folders side-by-side.

## Features
- **Dual-Pane Layout**: Browse OneDrive and Google Drive simultaneously with independent breadcrumbs and refresh controls.
- **Independent Auth**: Sign in and out of each account separately using Microsoft MSAL (PKCE) and Google Identity Services (GIS), with automatic sign-in recovery when Google's 1-hour token expires.
- **Multi-Select & Batch Drag & Drop (Copy & Move)**:
  - Select single or multiple files and folders via checkboxes, **Select All**, `Ctrl/Cmd+Click`, or `Shift+Click` range selection (`Esc` to clear).
  - Drag one or many selected items between OneDrive and Google Drive in either direction — drop into the open folder or directly onto a target subfolder row.
  - **Copy by default**, with a sidebar **Copy / Move** switch and **`Shift`-key override** on drop.
  - Safe Move behavior: originals are sent to OneDrive Recycle Bin / Google Drive Trash only after upload completes cleanly.
- **Delete & Rename on Both Clouds**:
  - **Delete**: Select one or more items and click **Delete** (or press `Del`) to move them to OneDrive Recycle Bin or Google Drive Trash after confirmation.
  - **Rename**: Select an item and click **Rename** (or press `F2`) with extension-preserving selection and inline validation.
- **Automatic Google Workspace Export**: Google Docs, Sheets, Slides, and Drawings are exported automatically to `.docx`, `.xlsx`, `.pptx`, and `.png` when transferred to OneDrive.
- **Large File Support**: Local Vite Node streaming relay (`/api/transfer-file`) handles resumable 5 MiB chunk uploads and live progress bars without browser CORS or size caps.
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
   ```

3. **Required OAuth Scopes**:
   - **Azure App Registration**: `User.Read`, `Files.ReadWrite` (Microsoft Graph delegated permissions).
   - **Google Cloud Console**: `https://www.googleapis.com/auth/drive` (Google Auth Platform → Data Access).

4. **Run locally**:
   ```bash
   npm run dev
   ```
   Open **http://localhost:5173/** in Chrome or Edge.

5. **Documentation**:
   Detailed specifications and architecture diagrams are in [docs/](./docs/) ([APPLICATION_SPEC.md](./docs/APPLICATION_SPEC.md), [ARCHITECTURE.md](./docs/ARCHITECTURE.md)).

## Security & Authentication
- **OneDrive**: Microsoft MSAL (OAuth 2.0 Authorization Code + PKCE).
- **Google Drive**: Google Identity Services (GIS Token Client).
- Tokens are stored in `sessionStorage` only; no client secrets are stored in the repository.
- The local transfer relay only accepts HTTPS URLs on allowlisted Microsoft/OneDrive and Google Drive domains.
