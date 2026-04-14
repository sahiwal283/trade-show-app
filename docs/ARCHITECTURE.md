# Trade Show Trade Show App - Architecture Documentation

**Last Updated:** November 10, 2025  
**Status:** Production Active | Sandbox Event Checklist + Full Codebase Refactor (v1.28.0)

## 📦 Current Versions

### **Production (Containers 201 & 202)**
- **Frontend:** v1.4.13 (Container 202) - October 16, 2025
- **Backend:** v1.5.1 (Container 201) - October 16, 2025
- **Branch:** `main`
- **URL:** https://expapp.duckdns.org

### **Sandbox (Container 203)**
- **Frontend:** v1.28.0 (Container 203) - November 10, 2025
- **Backend:** v1.28.0 (Container 203) - November 10, 2025
- **Branch:** `v1.28.0`
- **URL:** http://192.168.1.144

---

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     TRADE SHOW EXPENSE APP                          │
│    PRODUCTION: Frontend v1.4.13 / Backend v1.5.1                    │
│    SANDBOX: Frontend v1.28.0 / Backend v1.28.0                      │
│    Architecture: Repository Pattern + Component Modularization     │
└─────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                         INFRASTRUCTURE                               │
└──────────────────────────────────────────────────────────────────────┘

                    ┌──────────────────┐
                    │   Web Browser    │
                    │  192.168.1.144   │ (Sandbox)
                    │  192.168.1.138   │ (Production)
                    └────────┬─────────┘
                             │ HTTPS
                             │
                    ┌────────▼─────────┐
                    │  NPMplus Proxy   │
                    │   (LXC 104)      │
                    │  Port 80/443     │
                    └────────┬─────────┘
                             │
          ┌──────────────────┴──────────────────┐
          │                                     │
   ┌──────▼──────────┐              ┌──────────▼──────────┐
   │  Sandbox (203)  │              │  Production (201)   │
   │ 192.168.1.144   │              │  expapp.duckdns.org │
   │ v1.28.0 / v1.28.0│             │ v1.4.13 / v1.5.1    │
   └─────────────────┘              └─────────────────────┘

Each Environment Contains:
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  ┌───────────────┐         ┌─────────────────┐                    │
│  │   Frontend    │◄───────►│   Backend API   │                    │
│  │  React + TS   │   JWT   │  Node/Express   │                    │
│  │  Nginx :80    │  Auth   │  PM2 :3000      │                    │
│  │  Feature-Based│         │  Routes→Services│                   │
│  │  Components   │         │  →Repositories │                    │
│  └───────────────┘         └────────┬────────┘                    │
│          │                           │                             │
│          │                  ┌────────┴────────┐                    │
│          │                  │                 │                    │
│  ┌───────▼───────┐   ┌──────▼──────┐  ┌──────▼──────┐            │
│  │ Service Worker│   │ PostgreSQL  │  │  Tesseract  │            │
│  │ + IndexedDB   │   │   Port 5432 │  │  OCR Engine │            │
│  │ (Offline PWA) │   │  Migrations │  │  (Production)│            │
│  └───────────────┘   └─────────────┘  └─────────────┘            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## AI-Powered OCR Pipeline Architecture (v1.13.4 - Sandbox)

**Status:** ✅ Operational in Sandbox (Container 203)  
**Deployment Date:** October 23, 2025

### Microservices Architecture

```
┌───────────────────────────────────────────────────────────────────────┐
│                  AI-POWERED OCR FEEDBACK LOOP                         │
│          3-Microservice Architecture (Sandbox Only)                   │
└───────────────────────────────────────────────────────────────────────┘

                        ┌──────────────────┐
                        │   User Uploads   │
                        │     Receipt      │
                        └────────┬─────────┘
                                 │
                   ┌─────────────▼──────────────┐
                   │    Trade Show App (203)       │
                   │   192.168.1.144            │
                   │ ┌────────────────────────┐ │
                   │ │  Frontend (React)      │ │
                   │ │  - Receipt upload      │ │
                   │ │  - Correction tracking │ │
                   │ └───────┬────────────────┘ │
                   │         │                  │
                   │ ┌───────▼────────────────┐ │
                   │ │  Backend (Node/Express)│ │
                   │ │  - ocrV2 routes        │ │
                   │ │  - UserCorrectionSvc   │ │
                   │ └───────┬────────────────┘ │
                   └─────────┼──────────────────┘
                             │ HTTP POST (multipart/form-data)
                             │ Timeout: 180s
                   ┌─────────▼──────────────┐
                   │  OCR Service (202)     │
                   │  192.168.1.195:8000    │
                   │ ┌────────────────────┐ │
                   │ │  Tesseract OCR     │ │
                   │ │  Processing: 15-20s│ │
                   │ │  Confidence: 0-1.0 │ │
                   │ └───────┬────────────┘ │
                   │         │              │
                   │    Is confidence < 0.70?
                   │         │              │
                   │    YES  ▼              │
                   │ ┌────────────────────┐ │
                   │ │ LLM Enhancement    │ │
                   │ │ (Ollama dolphin)   │ │
                   │ │ Processing: 95-115s│ │
                   │ │ @ 192.168.1.173    │ │
                   │ └───────┬────────────┘ │
                   └─────────┼──────────────┘
                             │
                   ┌─────────▼──────────────┐
                   │  Extracted Fields      │
                   │  - merchant            │
                   │  - amount              │
                   │  - date                │
                   │  - category            │
                   │  - card last four      │
                   │  + confidence scores   │
                   └───────┬────────────────┘
                           │
                   ┌───────▼────────────────┐
                   │  User Reviews/Corrects │
                   └───────┬────────────────┘
                           │
            ┌──────────────┴──────────────┐
            │                             │
    ┌───────▼──────────┐          ┌──────▼──────────┐
    │ Local Storage    │          │  Data Pool (205)│
    │ (ocr_corrections)│          │  192.168.1.196  │
    │ Immediate save   │          │  :5000          │
    └──────────────────┘          │ ┌─────────────┐ │
                                  │ │ PostgreSQL  │ │
                                  │ │ UTF-8 DB    │ │
                                  │ └─────┬───────┘ │
                                  │       │         │
                                  │ ┌─────▼───────┐ │
                                  │ │Quality Score│ │
                                  │ │Calculation  │ │
                                  │ │(76-86% avg) │ │
                                  │ └─────┬───────┘ │
                                  └───────┼─────────┘
                                          │
                                  ┌───────▼─────────┐
                                  │ Model Training  │
                                  │    (206)        │
                                  │ 192.168.1.197   │
                                  │     :5001       │
                                  │ ┌─────────────┐ │
                                  │ │Pattern      │ │
                                  │ │Analysis     │ │
                                  │ └─────┬───────┘ │
                                  │       │         │
                                  │ ┌─────▼───────┐ │
                                  │ │Improved     │ │
                                  │ │Prompts      │ │
                                  │ │(v1.2.0)     │ │
                                  │ └─────┬───────┘ │
                                  └───────┼─────────┘
                                          │
                                          │ GET /models/latest
                                          │
                              ┌───────────▼────────────┐
                              │  Back to OCR Service   │
                              │  Enhanced Prompts      │
                              │  Better Accuracy       │
                              └────────────────────────┘
```

### Service Endpoints

| Service | Container | URL | Purpose |
|---------|-----------|-----|---------|
| **Trade Show App** | 203 | http://192.168.1.144 | Main application, receipt upload, corrections |
| **OCR Service** | 202 | http://192.168.1.195:8000 | Tesseract + LLM enhancement |
| **Data Pool** | 205 | http://192.168.1.196:5000 | Correction storage, quality scoring |
| **Model Training** | 206 | http://192.168.1.197:5001 | Pattern analysis, prompt improvement |
| **Ollama (LLM)** | 191 | http://192.168.1.173:11434 | AI model inference (dolphin-llama3) |

### Timeout Chain

```
User Browser
    │ No timeout (waits for response)
    ▼
Nginx (Container 203)
    │ proxy_read_timeout: 180s
    │ proxy_send_timeout: 180s
    │ proxy_connect_timeout: 180s
    ▼
Backend (Container 203)
    │ OCR_TIMEOUT: 180000ms (180s)
    ▼
OCR Service (Container 202)
    │ httpx timeout: 120s
    │ Processing: 15-115s actual
    ▼
Ollama (Container 191)
    │ Model inference: 80-100s
    └─> dolphin-llama3 (8B parameters)
```

### Data Flow: Receipt Processing

1. **Upload** (Trade Show App Frontend)
   - User selects receipt image
   - Multipart form upload to `/api/ocr/v2/process`

2. **Health Check** (Trade Show App Backend)
   - Check OCR Service: `GET /health/ready`
   - Fail fast if unavailable (5s timeout)

3. **OCR Processing** (External OCR Service)
   - Receive file via HTTP POST
   - Run Tesseract OCR (15-20s)
   - Calculate confidence scores
   - If confidence < 0.70 → trigger LLM enhancement

4. **LLM Enhancement** (Optional, Ollama)
   - Fetch prompts from Model Training
   - Call Ollama with receipt text + prompts
   - Process with dolphin-llama3 (95-115s)
   - Enhance low-confidence fields

5. **Field Extraction Response**
   ```json
   {
     "fields": {
       "merchant": { "value": "Uber", "confidence": 0.82, "source": "inference" },
       "amount": { "value": 22.98, "confidence": 0.95, "source": "ocr" },
       "date": { "value": "2025-10-23", "confidence": 0.78, "source": "inference" },
       "category": { "value": "Transportation", "confidence": 0.65, "source": "llm" }
     },
     "quality": {
       "overallConfidence": 0.80,
       "needsReview": false
     }
   }
   ```

6. **User Correction** (Frontend)
   - User reviews extracted fields
   - Changes incorrect values
   - Frontend detects differences: `detectCorrections()`

7. **Correction Storage** (Backend)
   - Store locally: `INSERT INTO ocr_corrections`
   - Response: Success (doesn't block on external services)

8. **Data Pool Sync** (Async, Non-Blocking)
   - Health check Data Pool: `GET /health`
   - POST correction to `/corrections/ingest`
   - Include: original OCR, corrected values, quality score
   - API Key: `Bearer dp_live_edb8db992bc7bdb3f4b895c976df4acf`

9. **Quality Scoring** (Data Pool)
   - Calculate correction quality (76-86% average)
   - Store with UTF-8 encoding
   - Make available for training

10. **Model Training** (Background Process)
    - Pull corrections: `GET /corrections/export`
    - Analyze patterns (merchant extraction issues)
    - Generate improved prompts (v1.2.0)
    - Notify OCR Service of new version

### Configuration

**Trade Show App Backend** (`backend/.env`):
```bash
# External OCR Service
OCR_SERVICE_URL=http://192.168.1.195:8000
OCR_TIMEOUT=180000

# Data Pool Integration
DATA_POOL_URL=http://192.168.1.196:5000
DATA_POOL_API_KEY=dp_live_edb8db992bc7bdb3f4b895c976df4acf
SEND_TO_DATA_POOL=true
```

**Nginx** (`/etc/nginx/sites-enabled/expenseapp`):
```nginx
location /api/ {
    proxy_pass http://127.0.0.1:3000/api/;
    proxy_connect_timeout 180s;
    proxy_send_timeout 180s;
    proxy_read_timeout 180s;
}
```

### Performance Metrics

| Scenario | Processing Time | Frequency | UX Impact |
|----------|----------------|-----------|-----------|
| High confidence receipt (≥0.70) | 15-20 seconds | ~80% of receipts | ⚡ Fast |
| Low confidence receipt (<0.70) | 95-115 seconds | ~20% of receipts | 🐢 Slow but accurate |
| Data Pool sync | 200-500ms | Every correction | Non-blocking |
| Model training | Daily/on-demand | Background | No impact |

### Key Features

✅ **Non-Blocking Integration**
- User workflow never depends on external services
- Corrections saved locally first
- Data Pool sync happens asynchronously

✅ **Health Checks**
- Quick 5s health checks before heavy operations
- Fail fast with clear error messages
- Graceful degradation

✅ **Progressive Timeouts**
- Each layer has appropriate timeout
- Buffers prevent cascade failures
- 180s > 120s allows network overhead

✅ **UTF-8 Support**
- Database recreated with UTF-8 encoding
- Supports Unicode characters (™, ®, ©)
- International text and emojis

✅ **Quality Scoring**
- Automatic quality calculation
- Tracks correction accuracy
- Feeds model training

### Files Modified for Integration

| File | Purpose | Changes |
|------|---------|---------|
| `backend/src/routes/ocrV2.ts` | OCR integration | HTTP calls to external service, health checks |
| `backend/src/services/ocr/UserCorrectionService.ts` | Data Pool sync | Async POST to Data Pool, quality scoring |
| `src/utils/ocrCorrections.ts` | Frontend tracking | Correction detection, API calls |
| `backend/.env` | Configuration | Service URLs, API keys, timeouts |
| `/etc/nginx/sites-enabled/expenseapp` | Nginx config | Timeout settings (180s) |

---

## 📋 Application Features

### Trade Show Event Management

**Purpose:** Organize and track trade show events with participants and budgets

**Features:**
- **Create Events** (Admin, Coordinator, Developer)
  - Event name and location
  - Start and end dates
  - Budget allocation (admin-only visibility)
  - Created by tracking

- **Manage Participants** (Event Setup page)
  - Add existing users to events
  - Assign role for each participant (salesperson, coordinator, etc.)
  - Create temporary attendees on-the-fly
  - Remove participants

- **Event List View**
  - Cards showing all events
  - Status indicators (upcoming, in progress, completed)
  - Days until/since event
  - Participant count
  - Quick actions (edit, view details)

- **Event Filtering**
  - Filter by status (upcoming, in progress, past)
  - Search by name or location
  - Sort by date

**Database Tables:** `events`, `event_participants`

---

### Expense Management & Workflows

**Purpose:** Submit, track, approve, and sync expenses with receipts

#### **Expense Submission** (All Roles except Accountant)

1. **Upload Receipt**
   - Support formats: JPEG, PNG, PDF, HEIC, HEIF, WebP
   - Max file size: 10MB (phone camera images supported)
   - File validation on frontend and backend

2. **OCR Processing**
   - **Production:** Embedded Tesseract OCR (local processing)
   - **Sandbox v1.13.4:** External OCR Service with LLM enhancement
   - Extracts: merchant, amount, date, category, card last 4
   - User can review and correct extracted fields

3. **Fill Expense Form**
   - Event selection (dropdown of user's events)
   - Category (predefined list with colors)
   - Amount (auto-filled from OCR)
   - Merchant (auto-filled from OCR)
   - Date (auto-filled from OCR, defaults to today)
   - Card type (Haute CC, Alpha CC, Beta CC, Gamma CC, Delta CC, Personal)
   - Description (optional)

4. **Submit**
   - Validate all required fields
   - Save to database with `pending` status
   - Store receipt in `uploads/` directory
   - Show success notification
   - **Offline Support:** Queue in IndexedDB if offline, sync when online

#### **Automated Approval Workflows** (v1.4.0+)

**3-Rule Logic:**
1. **Regression Detection** → "needs further review"
   - If entity or reimbursement status is set back to null/pending
   - Requires accountant/admin to re-review

2. **Auto-Approve on Action**
   - Assigning entity → status becomes `approved`
   - Setting reimbursement (approved/rejected) → status becomes `approved`

3. **No-Op** → Keep current status
   - Any other changes don't affect status

**Manual Override:** Accountants/admins can manually set status in detail modal

#### **Trade Show Approval** (Admin, Accountant, Developer)

**Approval Cards** (top of Expenses page):
- **Pending Approval** - Count of expenses awaiting review
- **Pending Reimbursement** - Count of approved reimbursements not yet paid
- **Unassigned Entities** - Count of expenses without Zoho entity

**Approval Actions:**
1. **Assign Entity** (inline dropdown in table)
   - Select: Haute Brands, Alpha, Beta, Gamma, Delta
   - Automatically approves expense
   - Clears `zoho_expense_id` if entity changes (allows re-push)

2. **Review Reimbursement** (inline buttons)
   - Approve (✓) or Reject (✗) reimbursement requests
   - Automatically approves expense
   - Shows confirmation dialog

3. **Mark as Paid** ($ icon button)
   - For approved reimbursements
   - Changes status to `paid`
   - Confirmation dialog

4. **Manual Status Change** (detail modal)
   - Override automated logic if needed
   - Options: pending, approved, rejected, needs further review

**Filters:**
- Date range
- Merchant (search)
- Category (multiselect)
- Status (multiselect)
- Entity (multiselect)
- Reimbursement status (multiselect)
- Collapsible inline filter panel

#### **Reimbursement Tracking**

**Reimbursement Flow:**
1. User submits expense with `reimbursement_required: true`
2. Status starts as `pending review`
3. Accountant/admin approves → `approved (pending payment)`
4. Accountant/admin marks as paid → `paid`
5. Alternative: Reject → `rejected`

**Reimbursement Columns in Table:**
- Reimbursement checkbox (read-only)
- Reimbursement status badge (color-coded)
- Quick action buttons (approve, reject, mark paid)

**Database Fields:** `reimbursement_required`, `reimbursement_status`

---

### Zoho Books Integration

**Purpose:** Sync approved expenses to Zoho Books for accounting

#### **Entity Management**

**5 Zoho Organizations (Entities):**
- **Haute Brands** (main entity)
- **Alpha** (sub-brand)
- **Beta** (sub-brand)
- **Gamma** (sub-brand)
- **Delta** (sub-brand)

**Entity Assignment:**
- Required before pushing to Zoho
- Determines which Zoho organization receives the expense
- Can be reassigned (clears `zoho_expense_id` to allow re-push)

#### **Push to Zoho Workflow**

1. **Prerequisites:**
   - Expense must have entity assigned
   - Receipt file must exist

2. **Push Process:**
   - Click "Push to Zoho" button (in table or detail modal)
   - Backend validates expense
   - Check for duplicate (`zoho_expense_id` already exists)
   - POST to Zoho Books API with expense data
   - Upload receipt attachment to Zoho
   - Receive `zoho_expense_id` from Zoho
   - Save `zoho_expense_id` in database

3. **Success Indicators:**
   - Green checkmark (✓) in Zoho Pushed column
   - Zoho ID displayed in detail modal
   - Button changes to "View in Zoho" (coming soon)

4. **Error Handling:**
   - Failed requests show error notification
   - Logs error details for debugging
   - Expense remains local, can retry

**Duplicate Prevention:**
- Check `zoho_expense_id` before pushing
- In-memory Set tracks recent pushes (session-only)
- Future: Database-based duplicate check

**Authentication:**
- OAuth 2.0 with Zoho
- Automatic token refresh
- Separate credentials for sandbox/production

**Database Fields:** `zoho_entity`, `zoho_expense_id`

---

### Dashboard & Quick Actions

**Purpose:** Provide at-a-glance overview and quick access to tasks

#### **Dashboard Widgets** (role-based)

**For All Users:**
- **Upcoming Events** - Next 3 events with days until
- **Recent Expenses** - Last 5 expenses submitted by user
- **Active Events** - Events currently in progress

**For Admin/Accountant/Developer:**
- **Pending Approvals** - Count with link to Expenses page
- **Unassigned Entities** - Count with link to Expenses page
- **Pending Reimbursements** - Count with link to Expenses page
- **Push to Zoho Tasks** - Count of approved expenses not yet synced

**Quick Action Links:**
- "View Pending Approvals" → `/expenses` with status filter
- "Assign Entities" → `/expenses` with entity filter
- "Push to Zoho" → `/expenses` with Zoho filter
- "Process Reimbursements" → `/expenses` with reimbursement filter

**API Endpoint:** `GET /api/quick-actions` (returns counts)

---

### Reports & Analytics

**Purpose:** Generate financial reports filtered by event and date

#### **Report Types**

**Detailed Report:**
- Expense list with all details
- Filterable by:
  - Event (dropdown)
  - Date range
  - Category
  - Entity
  - Status
- Sortable columns
- Total amount calculation
- Receipt thumbnails

**Summary Report:** (coming soon)
- Aggregated totals by category
- Budget vs actual
- Entity breakdown
- Charts and graphs

**Export Options:** (coming soon)
- CSV export
- PDF export
- Excel export

**Zoho Sync from Reports:**
- "Push to Zoho" button at top
- Pushes all approved, unsynced expenses for selected event
- Smart navigation (goes to event with most unsynced items)

**Database:** Queries `expenses` table with JOIN to `events`, `users`

---

### User & Role Management

#### **User Management** (Admin, Developer)

**Features:**
- **View All Users** - Table with name, username, email, role
- **Create User** 
  - Username (unique, lowercase)
  - Name (display name)
  - Email
  - Password (hashed with bcrypt)
  - Role (dropdown from `roles` table)
- **Edit User**
  - Update any field except username
  - Change role
  - Change password
- **Delete User**
  - Confirmation dialog
  - "admin" user cannot be deleted (protected)
  - Soft delete (future enhancement)

**Database Table:** `users`

#### **Dynamic Role Management** (v1.0.54+) (Admin, Developer)

**System Roles** (protected, cannot be deleted):
- `admin` - Full system access
- `developer` - Admin + Dev Dashboard
- `accountant` - Approve, Zoho, Reports
- `coordinator` - Events, Expenses
- `salesperson` - Submit expenses only
- `temporary` - Limited event participation
- `pending` - New registrations

**Custom Roles:**
- Create from UI with custom label, description, color
- 10 color options (badges in UI)
- Can be edited or deleted
- Stored in database with `is_system: false`

**Role Properties:**
- `name` - Internal identifier (lowercase, unique)
- `label` - Display name (e.g., "Event Coordinator")
- `description` - Role purpose
- `color` - Tailwind CSS classes for badges
- `is_system` - Protected flag (true = cannot delete)
- `is_active` - Soft delete flag

**Database Table:** `roles` (NEW in v1.0.54)

**UI Location:** Admin Settings → User Management → Role Management (collapsible)

---

### Settings & Configuration

**Purpose:** Application-wide configuration management

#### **Settings Page** (Admin, Developer, Accountant)

**Current Settings:**
- **App Version** - Display only (from package.json)
- **Environment** - Production / Sandbox
- **Database Connection** - Status indicator
- **OCR Configuration** (Developer only)
  - OCR provider (embedded vs external)
  - Timeout settings
  - Data Pool integration status

**Future Settings:**
- Email notifications toggle
- Default expense categories
- File upload limits
- Session timeout duration
- Timezone settings

**Database Table:** `settings` (key-value store)

---

### Developer Dashboard

**Purpose:** Debugging and diagnostics for developers

**Access:** Developer role only (not available to admins)

**Features:**
- **System Info**
  - Node version
  - Database connection status
  - Uptime
  - Memory usage

- **Cache Management**
  - View cache entries
  - Clear specific caches
  - Clear all caches

- **API Health Checks**
  - Test database connection
  - Test external services (OCR, Data Pool)
  - View API response times

- **Environment Variables** (masked)
  - View non-sensitive env vars
  - Verify configuration

- **Logs** (future)
  - View recent error logs
  - Search logs
  - Download logs

**UI Location:** Sidebar → Dev Dashboard (appears only for developer role)

---

## Component Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│                      FRONTEND ARCHITECTURE                        │
└───────────────────────────────────────────────────────────────────┘

App.tsx (Root)
├── useAuth() - Authentication & Session Management
├── PWA Registration - Service Worker + Offline Support
└── Router
    ├── LoginForm.tsx (Public)
    └── Authenticated Layout
        ├── Sidebar.tsx (Role-based Navigation)
        ├── Header.tsx (Search, Notifications, User Menu)
        └── Content Area
            ├── Dashboard.tsx (All Roles)
            ├── Events/
            │   ├── EventSetup.tsx
            │   ├── EventList.tsx
            │   └── hooks/
            │       ├── useEventForm.ts
            │       └── useEventParticipants.ts
            ├── Expenses/
            │   ├── ExpenseSubmission.tsx
            │   ├── ExpenseForm.tsx
            │   └── ExpenseList.tsx
            ├── Admin/
            │   ├── Approvals.tsx (Admin, Accountant, Developer)
            │   │   └── "Push to Zoho" button
            │   ├── AdminSettings.tsx
            │   ├── UserManagement.tsx
            │   │   ├── Dynamic role loading
            │   │   └── CRUD operations
            │   └── RoleManagement.tsx (NEW)
            │       ├── Create custom roles
            │       ├── Edit roles (label, color, description)
            │       └── Delete custom roles
            ├── Reports/
            │   ├── Reports.tsx
            │   ├── DetailedReport.tsx
            │   └── EventFilters.tsx
            └── Developer/
                └── DevDashboard.tsx (Developer Only)
                    ├── System diagnostics
                    ├── Cache management
                    └── API health checks
```

---

## Database Schema

```
┌───────────────────────────────────────────────────────────────────┐
│                      DATABASE SCHEMA (PostgreSQL)                 │
└───────────────────────────────────────────────────────────────────┘

┌─────────────┐         ┌─────────────┐
│    users    │◄────────┤    roles    │  (NEW in v1.0.54)
├─────────────┤         ├─────────────┤
│ id          │         │ id          │
│ username    │         │ name        │  (unique, lowercase)
│ password    │         │ label       │  (display name)
│ name        │         │ description │
│ email       │         │ color       │  (Tailwind classes)
│ role ────────►        │ is_system   │  (protected flag)
│ created_at  │         │ is_active   │  (soft delete)
└─────────────┘         │ created_at  │
       │                │ updated_at  │
       │                └─────────────┘
       │
       │  ┌──────────────────┐
       └──┤ event_participants│
          ├──────────────────┤
          │ id               │
          │ event_id ────────┐
          │ user_id          │
          │ role             │
          └──────────────────┘
                             │
┌─────────────┐             │
│   events    │◄────────────┘
├─────────────┤
│ id          │
│ name        │
│ location    │
│ start_date  │
│ end_date    │
│ budget      │
│ created_by  │
│ created_at  │
└─────────────┘
       │
       │  ┌──────────────────┐
       │  │ event_checklists │  (NEW v1.27.14)
       │  ├──────────────────┤
       │  │ id               │
       │  │ event_id         │
       │  │ booth_ordered    │
       │  │ booth_map_url    │
       │  │ electricity_ordered│
       │  └──────────────────┘
       │         │
       │         ├──► checklist_flights
       │         ├──► checklist_hotels
       │         ├──► checklist_car_rentals
       │         ├──► checklist_booth_shipping
       │         └──► checklist_custom_items
       │
       │  ┌─────────────┐
       └──┤  expenses   │
          ├─────────────┤
          │ id          │
          │ user_id     │
          │ event_id    │
          │ category    │
          │ amount      │
          │ description │
          │ receipt_path│
          │ ocr_text    │
          │ status      │  (pending/approved/rejected/needs further review)
          │ zoho_entity │  (haute/alpha/beta/gamma/delta)
          │ zoho_expense_id │  (tracking)
          │ reimbursement_required │
          │ reimbursement_status │
          │ card_type   │
          │ created_at  │
          │ updated_at  │
          └─────────────┘
                 │
                 │  ┌──────────────────┐
                 └──┤ ocr_corrections  │  (NEW in v1.11.0+)
                    ├──────────────────┤
                    │ id               │
                    │ user_id          │
                    │ expense_id       │  (optional)
                    │ original_ocr_text│
                    │ original_inference│ (JSON)
                    │ corrected_fields │  (JSON)
                    │ ocr_confidence   │
                    │ environment      │  (sandbox/production)
                    │ receipt_image    │
                    │ created_at       │
                    └──────────────────┘

┌─────────────┐
│  settings   │
├─────────────┤
│ id          │
│ key         │
│ value       │
│ created_at  │
│ updated_at  │
└─────────────┘
```

---

## Data Flow

```
┌───────────────────────────────────────────────────────────────────┐
│                  EXPENSE SUBMISSION FLOW                          │
└───────────────────────────────────────────────────────────────────┘

1. User submits expense with receipt
   │
   ├──► Frontend validates form
   │    └──► If offline: Save to IndexedDB queue
   │         └──► Background sync when online
   │
   └──► If online:
        │
        ├──► POST /api/expenses
        │    ├── Multer handles file upload
        │    ├── Sharp preprocesses image (grayscale, sharpen)
        │    ├── Tesseract extracts text (OCR)
        │    └── Save to database
        │         ├── expenses table
        │         └── receipt stored in uploads/
        │
        └──► Response to frontend
             └──► Show success notification

┌───────────────────────────────────────────────────────────────────┐
│                  EXPENSE APPROVAL FLOW                            │
└───────────────────────────────────────────────────────────────────┘

1. Admin/Accountant opens Approvals page
   │
   ├──► GET /api/expenses (with filters)
   │
   └──► Review expense
        │
        ├──► PATCH /api/expenses/:id/review
        │    └── Update status (approved/rejected)
        │
        └──► PATCH /api/expenses/:id/entity
             └── Assign Zoho entity (haute/alpha/etc)

┌───────────────────────────────────────────────────────────────────┐
│                  ZOHO BOOKS SYNC FLOW                             │
└───────────────────────────────────────────────────────────────────┘

1. Accountant clicks "Push to Zoho" button
   │
   ├──► Validates: expense has entity assigned
   │
   └──► POST /api/expenses/:id/zoho
        │
        ├──► Backend checks zohoExpenseId (prevent duplicates)
        │
        ├──► POST to Zoho Books API
        │    ├── Create expense in Zoho
        │    ├── Attach receipt file
        │    └── Get zohoExpenseId back
        │
        └──► Update database
             ├── Set zohoExpenseId
             └── Return success to frontend
```

---

## Role-Based Permissions Matrix

```
┌─────────────────────────────────────────────────────────────────┐
│                  ROLE PERMISSIONS MATRIX                        │
└─────────────────────────────────────────────────────────────────┘

Feature                    │ Admin │ Dev │ Acct │ Coord │ Sales │ Temp
──────────────────────────┼───────┼─────┼──────┼───────┼───────┼─────
Dashboard                  │   ✓   │  ✓  │  ✓   │   ✓   │   ✓   │  ✓
View Events                │   ✓   │  ✓  │  ✓   │   ✓   │   ✓   │  ✓
Create Events              │   ✓   │  ✓  │  ✓   │   ✓   │   ✗   │  ✗
Submit Expenses            │   ✓   │  ✓  │  ✗   │   ✓   │   ✓   │  ✗
View All Expenses          │   ✓   │  ✓  │  ✓   │   ✗   │   ✗   │  ✗
Approve Expenses           │   ✓   │  ✓  │  ✓   │   ✗   │   ✗   │  ✗
Assign Entities            │   ✓   │  ✓  │  ✓   │   ✗   │   ✗   │  ✗
Push to Zoho               │   ✓   │  ✓  │  ✓   │   ✗   │   ✗   │  ✗
Reports                    │   ✓   │  ✓  │  ✓   │   ✗   │   ✗   │  ✗
User Management            │   ✓   │  ✓  │  ✗   │   ✗   │   ✗   │  ✗
Role Management            │   ✓   │  ✓  │  ✗   │   ✗   │   ✗   │  ✗
Settings                   │   ✓   │  ✓  │  ✓   │   ✗   │   ✗   │  ✗
Dev Dashboard              │   ✗   │  ✓  │  ✗   │   ✗   │   ✗   │  ✗

Notes:
- Developer role has ALL admin capabilities PLUS Dev Dashboard
- Admins do NOT see Dev Dashboard (developer-only)
- Custom roles can be created with any permission combination
- "Pending" role is for new registrations only
```

---

## Backend Architecture (v1.28.0+)

**New Architecture: Repository Pattern (Routes → Services → Repositories → Database)**

```
┌───────────────────────────────────────────────────────────────────┐
│                      BACKEND ARCHITECTURE                        │
│                    (v1.28.0 - Refactored)                        │
└───────────────────────────────────────────────────────────────────┘

Routes (HTTP Layer - Thin Controllers)
├── routes/expenses.ts
│   └── Uses ExpenseService
├── routes/users.ts
│   └── Uses UserRepository
├── routes/events.ts
│   └── Uses EventRepository
└── routes/checklist.ts
    └── Uses ChecklistRepository

Services (Business Logic Layer)
├── services/ExpenseService.ts
│   └── Business logic, authorization, orchestration
├── services/DevDashboardService.ts
│   └── Dashboard logic
├── services/zohoIntegrationClient.ts
│   └── Zoho Books via shared integration service
└── services/ocr/
    ├── OCRService.ts
    └── UserCorrectionService.ts

Repositories (Data Access Layer)
├── database/repositories/BaseRepository.ts
│   └── Common CRUD operations
├── database/repositories/ExpenseRepository.ts
│   └── Expense data access, query building
├── database/repositories/UserRepository.ts
│   └── User data access
├── database/repositories/EventRepository.ts
│   └── Event data access
├── database/repositories/ChecklistRepository.ts
│   └── Checklist data access
└── database/repositories/AuditLogRepository.ts
    └── Audit log data access

Database (PostgreSQL)
└── Tables with migrations
```

## API Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│                      BACKEND API ROUTES                           │
└───────────────────────────────────────────────────────────────────┘

/api
├── /auth
│   ├── POST /login                    (public)
│   └── POST /register                 (public)
│
├── /users                              (authenticated)
│   ├── GET /                          (all roles)
│   ├── GET /:id                       (all roles)
│   ├── POST /                         (admin, developer)
│   ├── PUT /:id                       (admin, developer)
│   └── DELETE /:id                    (admin, developer)
│
├── /roles
│   ├── GET /                          (all roles)
│   ├── POST /                         (admin, developer)
│   ├── PUT /:id                       (admin, developer)
│   └── DELETE /:id                    (admin, developer)
│
├── /events                             (authenticated)
│   ├── GET /                          (all roles)
│   ├── GET /:id                       (all roles)
│   ├── POST /                         (admin, coordinator, developer)
│   ├── PUT /:id                       (admin, coordinator, developer)
│   └── DELETE /:id                    (admin, coordinator, developer)
│
├── /checklist (NEW v1.27.14)
│   ├── GET /:eventId                  (get or create checklist)
│   ├── PUT /:checklistId              (update booth/electricity)
│   ├── POST /:checklistId/flights     (add flight)
│   ├── POST /:checklistId/hotels      (add hotel)
│   ├── POST /:checklistId/car-rentals (add car rental)
│   ├── POST /:checklistId/custom-items (add custom item)
│   └── GET /templates                 (get templates)
│
├── /expenses                           (authenticated)
│   ├── GET /                          (role-filtered)
│   ├── GET /:id                       (role-filtered)
│   ├── POST /                         (submit expense)
│   │   └── Multer middleware (file upload)
│   ├── PUT /:id                       (update expense)
│   ├── PATCH /:id/status              (auto-approval workflow)
│   ├── PATCH /:id/entity              (admin, accountant, developer)
│   ├── PATCH /:id/reimbursement       (admin, accountant, developer)
│   ├── POST /:id/zoho                 (admin, accountant, developer)
│   └── DELETE /:id                    (admin, developer)
│
├── /ocr/v2                            (authenticated - Sandbox)
│   ├── POST /process                  (upload receipt for OCR)
│   │   └── External OCR Service call
│   ├── POST /corrections              (store user corrections)
│   │   └── Sends to Data Pool async
│   └── GET /config                    (developer only)
│
└── /settings                           (authenticated)
    ├── GET /                          (all roles)
    └── PUT /                          (admin, developer)

Middleware:
├── authenticateToken()   - JWT validation
├── authorize(...roles)   - Role-based access control
├── multer()              - File upload handling
├── validation()          - Input validation (Zod)
└── errorHandler()        - Global error handling
```

---

## PWA & Offline Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│                  PROGRESSIVE WEB APP (PWA)                        │
└───────────────────────────────────────────────────────────────────┘

Service Worker (public/service-worker.js)
├── Cache Management
│   ├── CACHE_NAME: expenseapp-v{version}
│   ├── STATIC_CACHE: expenseapp-static-v{version}
│   ├── Current: v1.4.13 (Production) / v1.13.4 (Sandbox)
│   └── Version-based cache invalidation
│
├── Caching Strategy
│   ├── Static Assets: Cache-first
│   ├── API Calls: Network-first (fixes stale data)
│   └── Images: Cache with fallback
│
└── Lifecycle Events
    ├── install - Cache static files
    ├── activate - Delete old caches
    └── fetch - Intercept requests

IndexedDB (Offline Storage)
├── expenses_queue - Unsynced expenses
├── events_cache - Event data
└── user_profile - User info

Background Sync
├── Register sync tag: 'sync-expenses'
├── Queue offline submissions
└── Auto-sync when connection restored
```

---

## Deployment Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│                  DEPLOYMENT INFRASTRUCTURE                        │
└───────────────────────────────────────────────────────────────────┘

Proxmox Host (192.168.1.190)
├── LXC 104: NPMplus Proxy Manager
│   ├── Handles all HTTP/HTTPS traffic
│   ├── SSL/TLS termination
│   └── Caching layer (must restart on deploy!)
│
├── LXC 203: Sandbox Environment (192.168.1.144)
│   ├── Debian 12
│   ├── Node.js 18
│   ├── PostgreSQL 15 (expense_app_sandbox database)
│   ├── Nginx (frontend on :80, root: /var/www/trade-show-app)
│   ├── PM2 (backend on :3000, path: /opt/trade-show-app/backend)
│   ├── Version: Frontend v1.13.4 / Backend v1.13.4
│   └── Features: Production + AI Pipeline (OCR, Data Pool, Model Training)
│
├── LXC 201: Production Backend (192.168.1.138)
│   ├── Node.js 18
│   ├── PostgreSQL 15 (expense_app_production database)
│   ├── PM2 (backend on :3000, path: /opt/trade-show-app/backend)
│   └── Version: Backend v1.5.1
│
└── LXC 202: Production Frontend (192.168.1.138)
    ├── Nginx (frontend on :80)
    ├── Path: /var/www/trade-show-app/current
    └── Version: Frontend v1.4.13

Deployment Process (Sandbox - Automated via deploy-sandbox.sh):
1. Update version in package.json (frontend & backend)
2. Build frontend: npm run build
3. Build backend: cd backend && npm run build
4. Create tarballs with version and timestamp
5. SCP to Proxmox host
6. Push to LXC 203 container
7. Extract frontend to /var/www/trade-show-app
8. Extract backend to /opt/trade-show-app/backend
9. Restart services: nginx, trade-show-app-backend
10. ⚠️ CRITICAL: Restart NPMplus proxy (LXC 104) to clear cache!

Deployment Process (Production - Manual):
1. Test thoroughly in sandbox first!
2. Tag release in git
3. Deploy frontend to LXC 202: /var/www/trade-show-app/current
4. Deploy backend to LXC 201: /opt/trade-show-app/backend
5. Run database migrations if needed
6. Restart services
7. Verify health endpoints

Current Scripts:
- deploy-sandbox.sh - Automated sandbox deployment
- DEPLOY_TO_PRODUCTION.sh - Production deployment (use with caution!)
```

---

## Security Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│                  SECURITY MEASURES                                │
└───────────────────────────────────────────────────────────────────┘

Authentication
├── JWT tokens (24h expiry)
├── Sliding session (15min inactivity logout)
├── bcrypt password hashing
└── Secure HttpOnly cookies

Authorization
├── Role-based access control (RBAC)
├── Route-level middleware (authorize())
├── Database row-level filtering
└── Frontend route guards

Data Protection
├── PostgreSQL user separation
├── Environment variables for secrets
├── No credentials in code
└── .gitignore for sensitive files

API Security
├── CORS configuration
├── Rate limiting (coming soon)
├── Input validation
└── SQL injection prevention (parameterized queries)

File Upload Security
├── File type validation (JPEG, PNG, PDF only)
├── File size limits (5MB)
├── Sanitized file names
└── Separate upload directory
```

---

## Version History

### **Production**
- **Frontend v1.4.13** (Oct 16, 2025) - Stable production release
- **Backend v1.5.1** (Oct 16, 2025) - Stable production release

### **Sandbox (AI Pipeline Development)**
- **v1.28.0** (Nov 10, 2025) - Full codebase refactor (Repository pattern + Component modularization)
- **v1.27.14** (Nov 5, 2025) - Event Checklist System (flights, hotels, car rentals, booth, shipping)
- **v1.18.0** (Oct 27, 2025) - Comprehensive codebase refactor (component extraction)
- **v1.15.13** (Oct 24, 2025) - Model Training Dashboard & Audit Trail Fixes
- **v1.13.4** (Oct 23, 2025) - External OCR + Data Pool + Model Training integration
- **v1.11.0+** - OCR correction tracking system

### **Historical Production Releases**
- **v1.4.13** (Oct 16, 2025) - Latest stable production
- **v1.1.11** (Oct 16, 2025) - Entity change warnings, Zoho improvements
- **v1.0.58** (Oct 15, 2025) - Fixed role display to use dynamic data
- **v1.0.54** - Dynamic Role Management System

See [CHANGELOG.md](../CHANGELOG.md) for complete version history.

---

## Known Issues & Solutions

### Caching Issues
**Problem:** Version not updating after deployment  
**Solution:** Always restart NPMplus proxy (LXC 104) after frontend deploy

### Role Display
**Problem:** Roles showing as "Pending Approval"  
**Solution:** Fixed in v1.0.58 - now loads dynamically from database

### Session Timeout
**Problem:** Users logged out unexpectedly  
**Solution:** Activity listeners reset token on user interaction

### Offline Sync
**Problem:** Expenses not syncing after connection restored  
**Solution:** Background sync with retry mechanism

### Entity Change Warning (v1.1.11 - ONGOING)
**Problem:** Warning dialog not appearing when changing entity in modal  
**Current Status:** Button state works correctly, but onChange event may not fire  
**Solution:** Under investigation - may need alternative approach (onBlur, save button)  
**Workaround:** User can still change entities, just without warning

### Zoho Duplicate Prevention (v1.1.11 - ONGOING)
**Problem:** In-memory `submittedExpenses` Set prevents re-push of deleted expenses  
**Root Cause:** Set persists across requests but not backend restarts  
**Solution Needed:** Check database `zoho_expense_id` instead of in-memory Set  
**Workaround:** Restart backend to clear Set

### AI Pipeline Issues (v1.13.4 Sandbox)
**Session Timeout During OCR Processing**  
**Problem:** JWT token expires if OCR takes too long (95-115s for LLM enhancement)  
**Status:** NEEDS FIX  
**Solution:** Implement token refresh mechanism or extend token expiry  
**Workaround:** Save expenses quickly after OCR processing

**LLM Processing Slow (95-115 seconds)**  
**Problem:** dolphin-llama3 model is slow for low-confidence receipts  
**Status:** Acceptable for now (only 20% of receipts)  
**Future:** Switch to faster model (tinyllama, phi-2) or GPU acceleration

**OCR Service Single Point of Failure**  
**Problem:** No fallback if external OCR service is down  
**Status:** Embedded OCR removed per user request  
**Mitigation:** Health checks provide fast failure, local corrections stored first

### Recent Fixes (v1.1.0 - v1.1.11)
- ✅ **Session timeout blank dashboard** - Backend now returns 401 (not 403) for expired tokens
- ✅ **Push to Zoho force logout** - Distinguish 401 (auth failed) from 403 (permission denied)
- ✅ **Phone camera images rejected** - Accept any `image/*` MIME type (HEIC, HEIF, WebP)

### Recent Fixes (v1.13.1 - v1.13.4 Sandbox AI Pipeline)
- ✅ **OCR Service 500 errors** - Fixed Tesseract language code ("en" → "eng")
- ✅ **Frontend 404 on corrections** - Fixed double `/api/api/` URL path
- ✅ **Data Pool 422 validation** - Nested corrected_fields in request body
- ✅ **Data Pool UTF-8 errors** - Recreated database with UTF-8 encoding
- ✅ **Nginx 404 on frontend** - Corrected root directive path
- ✅ **504 Gateway Timeout** - Increased timeouts to 180s across all layers
- ✅ **Random LLM sampling slow** - Disabled 10% sampling on high-confidence receipts
- ✅ **Navigation failures** - Use sessionStorage instead of URL hash for reliable navigation
- ✅ **Missing useEffect import** - Production-breaking bug fixed in v1.1.9
- ✅ **Admin protection** - Only "admin" user undeletable (frontend + backend enforcement)
- ✅ **Event days display** - Events in progress show "Today" instead of negative days
- ✅ **Entity re-assignment** - Clear zoho_expense_id to allow re-push after entity change

---

## Future Enhancements

### Planned Features
- [ ] Mobile app (React Native)
- [ ] Push notifications
- [ ] Advanced analytics
- [ ] Bulk expense import
- [ ] Receipt scanning improvements (ML-based)
- [ ] Multi-currency support
- [ ] Custom report builder
- [ ] Email notifications (partially implemented)

### Technical Debt
- [ ] Add comprehensive unit tests
- [ ] Add E2E tests (Playwright/Cypress)
- [ ] Implement rate limiting
- [ ] Add Redis caching layer
- [ ] Database connection pooling optimization
- [ ] Migrate to microservices (if needed)

---

**Document Maintained By:** AI Assistant  
**For Updates:** See `docs/AI_MASTER_GUIDE.md` → Recent Sessions section
