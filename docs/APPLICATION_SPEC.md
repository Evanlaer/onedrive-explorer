# APPLICATION_SPEC.md — Multi-Cloud Explorer

---

## 1. Project Overview

**Application Name:** Multi-Cloud Explorer (formerly OneDrive Explorer)  
**Vision:** A premium, dual-pane web application that allows users to browse and navigate their OneDrive and Google Drive accounts side-by-side.  
**Phase:** v1.1 — Integrated Multi-Cloud (Supports simultaneous exploration of Microsoft Graph and Google Drive API v3).

---

## 2. User Personas

| Persona | Description |
|---|---|
| **Multi-Cloud User** | An individual with accounts on both OneDrive and Google Drive who needs to view/manage content in a single, unified interface. |
| **Independent User** | A user who may only have one of the two cloud accounts but wants a premium explorer experience. |

---

## 3. Functional Requirements

| ID | User Story | Priority |
|---|---|---|
| FR-01 | As a user, I want to **log in with my Microsoft account** to access OneDrive. | Must-Have |
| FR-10 | As a user, I want to **log in with my Google account** to access Google Drive. | Must-Have |
| FR-11 | As a user, I want to see **OneDrive and Google Drive side-by-side** in a dual-pane layout. | Must-Have |
| FR-02 | As a user, I want to **browse root folders** upon login for both services. | Must-Have |
| FR-03 | As a user, I want to **navigate folders** in each pane independently. | Must-Have |
| FR-04 | As a user, I want a **breadcrumb trail** for each cloud provider. | Must-Have |
| FR-05 | As a user, I want a **unified sidebar** to manage both account profiles and logouts. | Must-Have |
| FR-06 | As a user, I want **file icons** (Word, PDF, Docs, Sheets) mapped correctly for both clouds. | Must-Have |
| FR-12 | As a user, I want to **log out of each account independently**. | Must-Have |
| FR-13 | As a user, I want a **premium, responsive UI** that adapts to the dual-pane view. | Must-Have |

### Happy Path
1. User opens the app → sees a dashboard with two "Sign In" panes (OneDrive & Google).
2. User signs into OneDrive → Left pane populates with Microsoft files.
3. User signs into Google → Right pane populates with Google files.
4. User navigates OneDrive folders (Left) → Google Drive (Right) stays in place.
5. User navigates Google folders (Right) → OneDrive (Left) stays in place.
6. Sidebar shows both profiles; user clicks "Sign Out" on Google → Right pane locks, Left pane stays active.

---

## 4. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Auth Security** | Uses **Microsoft MSAL (PKCE)** and **Google GIS (Token Client)**. No credentials stored on server. |
| **Performance** | Both panes must load asynchronously with independent skeleton states. |
| **State** | Navigation state for both panes is stored in localized React state to avoid cross-contamination. |
| **Scalability** | Dual-pane architecture must support future "Drag & Drop" between panes for cross-cloud copy. |

---

## 5. Tech Stack

| Layer | Technology | Reason |
|---|---|---|
| **Core** | React + Vite | Fast, modern, easily portable. |
| **OneDrive Auth** | `@azure/msal-browser` | Official Microsoft auth. |
| **Google Auth** | Google Identity Services (GIS) | Modern Google OAuth handling. |
| **APIs** | MS Graph + Google Drive v3 | Official cloud provider REST APIs. |
| **Styling** | Vanilla CSS (CSS Variables) | Premium look, no heavy framework bloat. |

---

## 6. Success Metrics

| Metric | Target |
|---|---|
| Dual Login | Both accounts logged in simultaneously in under 45 seconds. |
| Independence | Navigating in one pane has zero impact on the other's state. |
| UX Fluidity | Breadcrumb and folder clicks feel instantaneous. |
| Icon Accuracy | Correct icon rendered for Google Workspace mimeTypes. |
