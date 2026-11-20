# APPLICATION_SPEC.md — Multi-Cloud Explorer

---

## 1. Project Overview

**Application Name:** Multi-Cloud Explorer (formerly OneDrive Explorer)  
**Vision:** A premium, dual-pane web application that allows users to browse, navigate, and transfer files and folders seamlessly between OneDrive and Google Drive side-by-side.  
**Phase:** v1.2 — Cross-Cloud Transfers (Supports simultaneous exploration plus bidirectional Drag & Drop Copy and Move between Microsoft Graph and Google Drive API v3).

---

## 2. User Personas

| Persona | Description |
|---|---|
| **Multi-Cloud User** | An individual with accounts on both OneDrive and Google Drive who needs to view, organize, copy, and move content across clouds in a single unified interface. |
| **Independent User** | A user who may only have one of the two cloud accounts but wants a premium explorer experience. |

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
| FR-12 | As a user, I want to **log out of each account independently**. | Must-Have | Implemented |
| FR-13 | As a user, I want a **premium, responsive UI** that adapts to the dual-pane view. | Must-Have | Implemented |
| FR-14 | As a user, I want to **drag and drop files and folders between OneDrive and Google Drive** in either direction (into the current folder or directly onto a target subfolder). | Must-Have | Implemented |
| FR-15 | As a user, I want **Copy by default**, with a sidebar **Copy / Move toggle** and **`Shift`-key override** on drop to switch modes dynamically. | Must-Have | Implemented |
| FR-16 | As a user, I want **Google Docs, Sheets, Slides, and Drawings** automatically exported to Office/PNG formats (`.docx`, `.xlsx`, `.pptx`, `.png`) when transferred to OneDrive. | Must-Have | Implemented |
| FR-17 | As a user, I want **real-time transfer progress, errors, and warnings** displayed in a floating Transfers toast, with automatic pane refresh on completion. | Must-Have | Implemented |
| FR-18 | As a user, I want **safe Move semantics** so source files/folders are only sent to Recycle Bin / Trash after a 100% successful upload. | Must-Have | Implemented |

### Happy Path
1. User opens the app → sees a dashboard with two "Sign In" panes (OneDrive & Google Drive).
2. User signs into OneDrive (`Files.ReadWrite`) → Left pane populates with Microsoft files.
3. User signs into Google Drive (`drive`) → Right pane populates with Google files.
4. User navigates folders independently in either pane.
5. User drags a file or folder from one pane and drops it into the opposite pane (or directly onto a subfolder row):
   - A live drop banner previews `Copy` or `Move` and the destination path (`Hold Shift to Move/Copy`).
   - The floating **Transfers** toast displays live download & upload percentages.
   - Upon completion, the destination pane refreshes automatically (and the source pane refreshes too if `Move` removed the original).
6. Sidebar shows both profiles and the **Drag & Drop Mode** switch; signing out of one cloud locks only that pane.

---

## 4. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Auth Security** | Uses **Microsoft MSAL (PKCE)** with `User.Read` + `Files.ReadWrite`, and **Google GIS (Token Client)** with `https://www.googleapis.com/auth/drive`. Tokens stay in `sessionStorage` — no secrets stored in the codebase. |
| **Performance & Large Files** | Both panes load asynchronously with independent skeleton states. Large files (> 4–5 MB) transfer via a host-allowlisted local Vite Node streaming relay (`/api/transfer-file`) using **5 MiB resumable chunks**, avoiding browser CORS restrictions and ~10 MB response body limits. |
| **Data Safety** | Move transfers only delete/trash the original after upload succeeds (and for folders, only if zero nested files failed). Deletions go to OneDrive Recycle Bin / Google Drive Trash rather than irreversible purge. |
| **Filename Compatibility** | Invalid OneDrive filename characters (`\ / : * ? " < > |`) are automatically sanitized to `_` on upload, and name collisions use OneDrive's `conflictBehavior: rename`. |
| **State Isolation** | Navigation state for both panes is localized to each `CloudPane` instance; cross-cloud drag/transfer state is coordinated cleanly from `App.jsx`. |

---

## 5. Tech Stack

| Layer | Technology | Reason |
|---|---|---|
| **Core** | React 19 + Vite 8 | Fast, modern, easily portable. |
| **OneDrive Auth** | `@azure/msal-browser` + `@azure/msal-react` | Official Microsoft OAuth 2.0 PKCE client. |
| **Google Auth** | Google Identity Services (GIS) | Modern browser Google OAuth token client. |
| **APIs** | MS Graph v1.0 + Google Drive v3 | Official cloud provider REST APIs (including resumable upload sessions). |
| **Local Relay** | Vite Server Middleware (`vite.config.js`) | Zero-dependency Node streaming relay for large cross-cloud transfers & CORS-free downloads (with browser fallback for static deployments). |
| **Styling** | Vanilla CSS (CSS Variables) | Azure Horizon dark theme without heavy UI framework bloat. |

---

## 6. Success Metrics

| Metric | Target |
|---|---|
| Dual Login | Both accounts logged in simultaneously in under 45 seconds. |
| Independence | Navigating in one pane has zero impact on the other's state. |
| Transfer Reliability | Both small files and large archives (> 30 MB) copy and move cleanly in both directions with live progress. |
| Move Safety | Zero data loss on partial folder failures or interrupted uploads. |
| Icon Accuracy | Correct icon rendered for Microsoft and Google Workspace MIME types. |
