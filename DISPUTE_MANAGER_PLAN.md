# CredX Dispute Manager - MVP Build Plan

**Date:** 2026-04-11  
**Scope:** MVP (4 tabs)  
**Integration:** Replace existing Disputes tab in admin portal  

---

## Architecture

### User Flow
```
Admin Portal
├── Overview (existing)
├── Clients (existing)
└── Dispute Manager (NEW - replaces old Disputes tab)
    ├── Import Report (CSV upload)
    ├── Add Item (build disputes)
    ├── Tracking (monitor status)
    └── Results (update outcomes)
```

### Data Model Changes

```typescript
// New: DisputeItem table
interface DisputeItem {
  id: string;
  clientId: string;
  furnisher: string;           // Creditor/Collector name
  accountNumber: string;
  accountType: 'LATE_PAYMENT' | 'COLLECTION' | 'CHARGE_OFF' | 'INQUIRY' | 'OTHER';
  balance: number | null;
  dateAdded: string | null;    // When appeared on report
  
  // Bureau flags
  disputeEquifax: boolean;
  disputeExperian: boolean;
  disputeTransunion: boolean;
  
  // Dispute details
  reason: string;
  customInstruction: string | null;
  
  // Round tracking
  currentRound: number;        // R-1, R-2, etc.
  status: 'PENDING' | 'IN_DISPUTE' | 'DELETED' | 'UPDATED' | 'VERIFIED';
  
  // Dates
  createdAt: string;
  updatedAt: string;
  dueDate: string | null;      // For tracking overdue
}

// New: DisputeRound table (for history)
interface DisputeRound {
  id: string;
  disputeItemId: string;
  roundNumber: number;
  sentDate: string;
  dueDate: string;
  status: 'PENDING' | 'RESPONSE_RECEIVED' | 'NO_RESPONSE' | 'ARCHIVED';
  notes: string | null;
}

// New: Furnisher table (for dropdown)
interface Furnisher {
  id: string;
  name: string;
  type: 'CREDITOR' | 'COLLECTOR' | 'BUREAU';
  address: string | null;
  isActive: boolean;
}
```

---

## UI Components to Build

### 1. Tab Navigation
```
[IMPORT REPORT] [ADD ITEM] [TRACKING] [RESULTS]
```
- Blue active state
- Horizontal layout
- Icons optional

### 2. Import Report Tab
- CSV upload component
- Drag & drop zone
- Column mapping (if needed)
- Preview before import
- Success/error feedback

### 3. Add Item Tab
**Layout:**
```
┌─────────────────────────────────────────┐
│ Client Selector (dropdown)              │
├─────────────────────────────────────────┤
│ Furnisher    [Search/Select     ▼]      │
│ Account #    [_________________]        │
│ Type         [Dropdown         ▼]       │
│ Balance      [_________________]        │
│ Date Added   [Date picker      ▼]       │
├─────────────────────────────────────────┤
│ [✓] EFX  [✓] XPN  [✓] TU  [✓] All     │
├─────────────────────────────────────────┤
│ Reason       [Dropdown         ▼]       │
│ Instructions [Text area                ]│
├─────────────────────────────────────────┤
│ [SAVE]  [DISPUTE]  [DELETE]             │
└─────────────────────────────────────────┘
```

**Data Table Below:**
- Checkbox column
- Furnisher
- Account #
- Type
- EFX ✓/✗
- XPN ✓/✗
- TU ✓/✗
- Status badge
- Actions (Edit/Delete)
- Pagination

### 4. Tracking Tab
**Header Actions:**
- [ARCHIVE ROUND] [RE-SEND] [CHANGE DUE DATE]
- Current/Archive toggle

**Table:**
- Round (R-1, R-2, etc.)
- Date Sent
- Furnisher
- Account
- Bureau icons
- Letter Type
- Status
- Due Date (red if overdue)
- Days (red if >30)
- Actions

### 5. Results Tab
**Update Form:**
- Furnisher selector
- Account #
- Bureau status per item:
  - [ ] Deleted
  - [ ] Updated
  - [ ] In-Dispute
  - [ ] Verified

**Actions:**
- [EMAIL DELETION RESULTS]
- [UPDATE SCORE/HISTORY]

**Results Table:**
- Date
- Account Title
- Account Number
- Type
- Balance
- EFX Status
- XPN Status
- TU Status
- Actions

---

## Styling (Match CDM)

### Colors
```css
--primary: #3b82f6;        /* Blue - tabs, primary buttons */
--success: #22c55e;        /* Green - SAVE, positive actions */
--warning: #eab308;        /* Yellow - alerts */
--danger: #ef4444;         /* Red - overdue, DELETE */
--orange: #f97316;         /* AI REWRITER (future) */

--bg-primary: #ffffff;
--bg-secondary: #f8fafc;
--border: #e2e8f0;
--text-primary: #1e293b;
--text-secondary: #64748b;
```

### Components
- Cards with subtle shadows
- Rounded corners (8px)
- Clean sans-serif typography
- Table with hover states
- Status badges (colored pills)

---

## API Endpoints Needed

```
GET    /api/furnishers                    # List for dropdown
POST   /api/dispute-items                 # Create new item
GET    /api/dispute-items?clientId=xxx    # List for client
PUT    /api/dispute-items/:id             # Update item
DELETE /api/dispute-items/:id             # Delete item

POST   /api/dispute-items/:id/rounds      # Start new round
GET    /api/dispute-items/:id/rounds      # Get round history
PUT    /api/dispute-rounds/:id            # Update round status

POST   /api/import/csv                    # Upload CSV import
```

---

## Implementation Steps

### Phase 1: Schema & API
1. Add Prisma models (DisputeItem, DisputeRound, Furnisher)
2. Run migration
3. Build API endpoints
4. Seed furnishers table

### Phase 2: UI Components
1. Create DisputeManager component with 4 tabs
2. Build ImportReport tab (CSV upload)
3. Build AddItem tab (form + table)
4. Build Tracking tab (status table)
5. Build Results tab (outcome update)

### Phase 3: Integration
1. Replace Disputes route in App.tsx
2. Update sidebar navigation
3. Style match CDM screenshots
4. Test with sample data

### Phase 4: Polish
1. Add loading states
2. Error handling
3. Empty states
4. Responsive adjustments

---

## Phase 2 Features (Future)
- [ ] Creditors tab
- [ ] Collectors tab
- [ ] Respond tab
- [ ] PDF letter generation
- [ ] AI Rewriter
- [ ] Live API import (Identity IQ, etc.)
- [ ] Client portal (read-only Results view)
