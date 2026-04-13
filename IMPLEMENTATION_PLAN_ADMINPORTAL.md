# CredX Admin Portal Implementation Plan

## Goal
Build the first working admin portal shell for `credxme.com/adminportal/` inside `credx-platform/apps/web`, then wire it to the existing backend models for clients, disputes, and credit reports.

## Phase 1 — UI Scaffold
Create a frontend app shell with:
- `/adminportal`
- sidebar navigation
- top header
- overview dashboard cards
- client list layout
- dispute manager shell with tabbed workflow

## Phase 2 — Core Screens
### Admin Dashboard
- total leads
- active clients
- pending disputes
- recent uploads
- recent activity

### Client Management
- client list table
- search/filter shell
- client detail panel
- onboarding status

### Dispute Manager
Tabs:
- Import Report
- Add Item
- Bureaus
- Creditors
- Collectors
- Respond
- Tracking
- Results

### Credit Report Intake Panel
- upload PDF / HTML
- report source fields
- credentials fields
- breakdown preview card

## Phase 3 — Backend Wiring
Use existing API and extend where needed:
- `/api/leads`
- `/api/clients`
- `/api/disputes`
- new credit-report intake endpoints
- new activity/event creation hooks

## Phase 4 — Future Additions
- affiliate links section
- welcome email automation
- contract flow
- parsed report summary pipeline
- secure credential storage flow

## Immediate Build Target
Start with a static but production-shaped admin web app in `apps/web` using React + Vite-style structure, ready to connect to API data.
