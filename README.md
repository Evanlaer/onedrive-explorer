# Multi-Cloud Explorer (OneDrive + Google Drive)

A premium, dual-pane file explorer built with **React + Vite**. Authenticate with your Microsoft and Google accounts to browse and navigate your cloud files side-by-side.

## ✨ Features
- **Dual-Pane Layout**: Browse OneDrive and Google Drive simultaneously.
- **Independent Auth**: Sign in/out of each account separately.
- **Side-by-Side Navigation**: Folder clicks in one pane don't affect the other.
- **Custom Icon Mapping**: Support for Word, Excel, PDF, and Google Workspace files.
- **Zero-Cost**: Pure frontend architecture using official cloud APIs.

## 🚀 Getting Started

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment**:
   Create a `.env` file from the placeholder:
   ```bash
   VITE_CLIENT_ID=your_azure_client_id
   VITE_GOOGLE_CLIENT_ID=your_google_client_id
   ```

3. **Run Locally**:
   ```bash
   npm run dev
   ```

4. **Documentation**:
   Detailed technical specs are available in the [docs/](file:///c:/Users/eric_/OneDrive/Apps/Ondrive%20to%20Google%20drive/onedrive-explorer/docs/) folder.

## 🛡️ Authentication
- **OneDrive**: Microsoft MSAL (PKCE Flow).
- **Google Drive**: Google Identity Services (GIS).
- All tokens are stored in `sessionStorage` for security.
