# APPLICATION_SPEC.md — Multi-Cloud Explorer

---

## 1. Project Overview

**Application Name:** Multi-Cloud Explorer (formerly OneDrive Explorer)  
**Vision:** A premium, dual-pane web application that allows users to browse, organize, and transfer files and folders seamlessly between OneDrive and Google Drive side-by-side.  
**Phase:** v1.5 — Multi-Account Connections & Flexible Dual-Pane Pick Lists (Add, name, and persist multiple OneDrive and Google Drive accounts in Connection Settings; select any account in either pane via dropdown pick lists; drag & drop Copy/Move across any two accounts including OneDrive ↔ OneDrive and Google Drive ↔ Google Drive).

---

## 2. User Personas

| Persona | Description |
|---|---|
| **Multi-Cloud User** | An individual with accounts on both OneDrive and Google Drive who needs to browse, organize, rename, delete, copy, and move content across clouds in a single unified interface. |
| **Independent User** | A user who may only have one of the two cloud accounts but wants a fast, clean web explorer with full file management. |

---

## 3. Functional Requirements

| ID | User Story | Priority | Status |
|---|---|---|---|
| FR-01 | As a user, I want to **log in with my Microsoft account** to access OneDrive. | Must-Have | Implemented |
| FR-10 | As a user, I want to **log in with my Google account** to access Google Drive. | Must-Have | Implemented |
| FR-11 | As a user, I want to see **OneDrive and Google Drive side-by-side** in a dual-pane layout. | Must-Have | Implemented |
| FR-02 | As a user, I want to **browse root folders** upon login for both services. | Must-Have | Implemented |
| FR-03 | As a user, I want to **navigate folders** in each pane independently. | Must-Have | Implemented |
| FR-04 | As a user, I want a **breadcrumb trail** and manual refresh button for each cloud provider. | Must-Have | Implemented |
| FR-05 | As a user, I want a **unified sidebar** to manage both account profiles, logouts, and default transfer mode. | Must-Have | Implemented |
| FR-06 | As a user, I want **file icons** (Word, PDF, Docs, Sheets, Slides, etc.) mapped correctly for both clouds. | Must-Have | Implemented |
| FR-12 | As a user, I want to **log out of each account independently** and recover smoothly when Google's 1-hour token expires. | Must-Have | Implemented |
| FR-13 | As a user, I want a **premium, responsive UI** that adapts to the dual-pane view. | Must-Have | Implemented |
| FR-14 | As a user, I want to **drag and drop files and folders between OneDrive and Google Drive** in either direction (into the current folder or directly onto a target subfolder). | Must-Have | Implemented |
| FR-15 | As a user, I want **Copy by default**, with a sidebar **Copy / Move toggle** and **`Shift`-key override** on drop to switch modes dynamically. | Must-Have | Implemented |
| FR-16 | As a user, I want **Google Docs, Sheets, Slides, and Drawings** automatically exported to Office/PNG formats (`.docx`, `.xlsx`, `.pptx`, `.png`) when transferred to OneDrive. | Must-Have | Implemented |
| FR-17 | As a user, I want **real-time activity progress, errors, and warnings** displayed in a floating activity toast, with automatic pane refresh on completion. | Must-Have | Implemented |
| FR-18 | As a user, I want **safe Move semantics** so source files/folders are only sent to Recycle Bin / Trash after a 100% successful upload. | Must-Have | Implemented |
| FR-19 | As a user, I want to **select multiple files and folders** in a folder (via checkboxes, Select All, `Ctrl/Cmd+Click`, `Shift+Click`, and `Esc` to clear) and **drag-and-drop them as a batch**. | Must-Have | Implemented |
| FR-20 | As a user, I want to **delete one or multiple selected items** in either OneDrive or Google Drive via a **Delete** button (or `Del` key) with a confirmation dialog sending them to Recycle Bin / Trash. | Must-Have | Implemented |
| FR-21 | As a user, I want to **rename a selected file or folder** in either OneDrive or Google Drive via a **Rename** button (or `F2` key) with extension-preserving selection and inline validation. | Must-Have | Implemented |
| FR-22 | As a user, I want a **Connection Settings modal** to store OneDrive and Google Drive connection parameters (Auto-Connect toggles, optional Client ID / Authority / Secret overrides, and default Copy/Move mode) so both clouds reconnect automatically every time the app starts. | Must-Have | Implemented |
| FR-23 | As a user, I want to **add, name, save, and manage multiple OneDrive and Google Drive accounts** in Connection Settings and **select which account to display in each pane via a pick list** on the main page (supporting OneDrive ↔ Google Drive, OneDrive ↔ OneDrive, and Google Drive ↔ Google Drive transfers). | Must-Have | Implemented |
| FR-24 | As a user, I want **unlimited folder pagination** (automatic infinite scroll + Load more / Load all + full multi-page recursive folder scans) so folders with more than 200 items never truncate on OneDrive or Google Drive. | Must-Have | Implemented |

### Happy Path
1. **Multi-Account Setup & Auto-Connect**: User adds and names one or more OneDrive and Google Drive accounts in **Connection Settings** (or connects the default accounts directly from the panes). With **Auto-connect on startup** enabled, future launches reconnect every saved account automatically without repeated sign-in prompts.
2. **Account Selection & Independent Browsing**: User picks any saved OneDrive or Google Drive account in the Left and Right pane dropdown pick lists and navigates folders independently.
3. **Multi-Select & Batch Transfer**: User checks several files/folders (or uses `Ctrl+Click` / `Shift+Click` / Select All) and drags any selected item to the opposite pane (OneDrive ↔ Google Drive, OneDrive ↔ OneDrive, or Google Drive ↔ Google Drive — into the open folder or onto a specific subfolder):
   - A custom `N items` drag badge and live drop banner preview `Copy N items` or `Move N items` (`Hold Shift` switches Copy ↔ Move).
   - The floating **Transfers** toast processes items with controlled concurrency (2 active at a time, remaining queued) with live download/upload percentages, then refreshes affected panes automatically.
4. **Delete**: With 1+ items selected in either pane, user clicks **Delete** (or presses `Del`) → confirms in the modal → items move safely to OneDrive Recycle Bin or Google Drive Trash and the pane refreshes.
5. **Rename**: With 1 item selected in either pane, user clicks **Rename** (or presses `F2`) → edits the pre-selected base filename → clicks **Save** → item renames in place and the pane refreshes.

---

## 4. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Auth Security & Auto-Connect** | Uses **Microsoft MSAL v5 (PKCE Popup + Redirect Bridge)** with `User.Read` + `Files.ReadWrite`, and **Google GIS (Authorization Code Flow + `/api/google-auth`)** with `https://www.googleapis.com/auth/drive`. When Auto-Connect is enabled in Connection Settings, sessions persist in `localStorage` and refresh silently on startup and before expiry (`GOOGLE_CLIENT_SECRET` stays server-side via `.env` / Vercel). Disabling Auto-Connect restricts tokens to `sessionStorage`. |
| **Performance & Large Files** | Both panes load asynchronously with independent skeleton states. Files transfer via a host-allowlisted Node / Vercel streaming relay (`/api/transfer-file`) using **5 MiB resumable chunks**, avoiding browser CORS restrictions and ~10 MB response body caps. |
| **Batch Concurrency** | Multi-file Copy/Move runs up to 2 simultaneous transfers; multi-item Delete runs up to 3 simultaneous requests, preventing API throttling while keeping the UI responsive. |
| **Data Safety** | Delete and Move operations send items to OneDrive Recycle Bin / Google Drive Trash (recoverable). Folder moves only remove the source folder if 100% of nested files succeeded with zero warnings. |
| **Filename Compatibility** | Invalid OneDrive filename characters (`\ / : * ? " < > |`) are blocked inline during Rename and automatically sanitized to `_` during cross-cloud upload. |
| **State Isolation** | Navigation and selection state for each pane are localized inside `CloudPane`; cross-cloud drag, settings, silent refresh, modals, and activity queue state are coordinated from `App.jsx`. |

---

## 5. Tech Stack

| Layer | Technology | Reason |
|---|---|---|
| **Core** | React 19 + Vite 8 | Fast, modern, easily portable. |
| **OneDrive Auth** | `@azure/msal-browser` v5 + `@azure/msal-react` | Official Microsoft OAuth 2.0 PKCE client with redirect-bridge popup & `ssoSilent` support. |
| **Google Auth** | Google Identity Services (GIS) + `/api/google-auth` | OAuth 2.0 Authorization Code popup with server-side refresh-token renewal (falls back to GIS Token Client). |
| **APIs** | MS Graph v1.0 + Google Drive v3 | Official cloud provider REST APIs (including resumable upload sessions). |
| **Backend Endpoints** | Shared Node handlers (`server/`) for Vite Middleware & Vercel Serverless (`api/`) | Zero-dependency streaming transfer relay (`/api/transfer-file`) and Google OAuth token handler (`/api/google-auth`). |
| **Styling** | Vanilla CSS (CSS Variables) | Azure Horizon dark theme without heavy UI framework bloat. |

---

## 6. Success Metrics

| Metric | Target |
|---|---|
| Dual Login | Both accounts logged in simultaneously in under 45 seconds. |
| Independence | Navigating or selecting items in one pane has zero impact on the other's state. |
| Transfer Reliability | Single and multi-file batches (including > 30 MB archives) copy and move cleanly in both directions with live progress. |
| Safe File Management | Delete requires explicit confirmation and uses Recycle Bin / Trash; Rename preserves file extensions and validates forbidden characters. |
| Icon Accuracy | Correct icon rendered for Microsoft and Google Workspace MIME types. |
