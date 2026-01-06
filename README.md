# Trade Show Expense Management App

A professional web application for managing trade show events and expenses with **dynamic role management**, **offline-first PWA architecture**, OCR receipt scanning, expense approval workflows, and **automatic Zoho Books integration**.

**Production:** Frontend v1.4.13 / Backend v1.5.1 (October 16, 2025)  
**Sandbox:** Frontend v1.28.0 / Backend v1.28.0 (November 10, 2025)  
**Production Status:** ✅ Stable and Active  
**Sandbox Status:** ✨ Event Checklist Feature Complete + Full Codebase Refactor (v1.28.0)

📝 See [CHANGELOG.md](CHANGELOG.md) for complete version history  
🏗️ See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for system architecture  
📚 See [docs/MASTER_GUIDE.md](docs/MASTER_GUIDE.md) for complete development guide  
🤖 See [docs/OCR_TRAINING_GUIDE.md](docs/OCR_TRAINING_GUIDE.md) for AI/OCR specifics

---

## 🚀 Quick Start

### 🏠 Local Development (Recommended for Testing)

**One-Line Setup:**
```bash
./scripts/local-deploy.sh
```

This automated script will:
- ✅ Check prerequisites (Node.js, PostgreSQL)
- ✅ Create database if needed
- ✅ Install dependencies
- ✅ Run migrations and seed demo data
- ✅ Start both frontend and backend servers

**URLs:**
- Frontend: http://localhost:5173
- Backend: http://localhost:5000

**Demo Credentials:**
- Admin: `admin` / `password123`
- Coordinator: `sarah` / `password123`
- Salesperson: `mike` / `password123`
- Accountant: `lisa` / `password123`
- Developer: `developer` / `password123`

**Health Check:**
```bash
./scripts/health-check.sh
```

📖 **Detailed Setup:** See [docs/LOCAL_DEPLOYMENT.md](docs/LOCAL_DEPLOYMENT.md) for complete local setup guide

---

### 🌐 Remote Environments

#### Sandbox Environment (Development/Testing)
**URL:** http://192.168.1.144  
**Credentials:**
- Admin: `admin` / `sandbox123`
- Coordinator: `coordinator` / `sandbox123`
- Salesperson: `salesperson` / `sandbox123`
- Accountant: `accountant` / `sandbox123`
- Developer: `developer` / `sandbox123`
- Temporary: `temporary` / `changeme123`

#### Production Environment
**URL:** http://192.168.1.138  
See [docs/BOOMIN_CREDENTIALS.md](docs/BOOMIN_CREDENTIALS.md) for production credentials

---

## 🚧 Latest Development (v1.27.14 - Event Checklist System)

**Branch:** `main` (Sandbox Only - Container 203)  
**Status:** ✨ Event Checklist Feature Complete - Ready for Testing

### ✨ v1.27.14 - Event Checklist System (Nov 5, 2025)

**Major Feature:** Comprehensive trade show logistics management system

**What's New:**
- ✅ **Flights** - Track flight bookings per attendee with carrier, confirmation numbers, notes
- ✅ **Hotels** - Manage hotel reservations with check-in/out dates, property names, special requests
- ✅ **Car Rentals** - Support for group (shared) or individual (assigned) rentals with receipt integration
- ✅ **Booth Management** - Order tracking, booth map uploads (images/PDFs), electricity notes
- ✅ **Shipping** - Multiple shipments per event with carrier tracking, dates, and notes
- ✅ **Custom Checklist Items** - Flexible task tracking with completion status and drag-drop ordering
- ✅ **Templates** - Reusable checklist items that auto-apply to new events

**Database:**
- 7 new tables: `event_checklists`, `checklist_flights`, `checklist_hotels`, `checklist_car_rentals`, `checklist_booth_shipping`, `checklist_custom_items`, `checklist_templates`
- Migration 017_add_event_checklist.sql with foreign keys, indexes, and comprehensive comments
- Cascading deletes maintain referential integrity

**API:**
- 30+ new endpoints under `/api/checklist`
- Full CRUD operations for all checklist entities
- Authorization: Admin, Coordinator, Developer can manage; all users can view

**UX:**
- Receipt integration: Car rentals and hotels can upload receipts during checklist entry (auto-creates expense)
- Visual status indicators with green checkmarks for completed items
- Collapsible sections for clean interface
- Inline editing with auto-save
- Confirmation dialogs for all delete operations

**See:** [CHANGELOG.md](CHANGELOG.md) for complete v1.27.14 details

---

### 🏗️ v1.18.0 - Comprehensive Codebase Refactor (Oct 27, 2025)

**Major Achievement:** 26-hour systematic refactor improving code quality, maintainability, and documentation

**What Changed:**

**Phase 3: Component Extraction** (23 hours)
- ✅ Split 3 monolithic files into 29 focused components
- ✅ **ExpenseSubmission.tsx**: 1,307 lines → 438 lines (66% reduction)
  - Extracted 11 components: ReceiptUpload, OcrSection, BasicFields, CategoryManagement, etc.
- ✅ **Approvals.tsx**: 1,578 lines → 964 lines (39% reduction)
  - Extracted 5 components: ApprovalStats, ApprovalFilters, ApprovalsList, ApprovalViewModal, etc.
- ✅ **DevDashboard.tsx**: 888 lines → 232 lines (73% reduction)
  - Extracted 10 tab components: OverviewTab, MetricsTab, AuditLogsTab, AlertsTab, etc.

**Phase 4: Logic Simplification** (2 hours)
- ✅ Extracted helper functions in `ocrCorrections.ts` (75% logic reduction)
- ✅ Simplified `filterUtils.ts` with object-based approach
- ✅ Added comprehensive JSDoc documentation
- ✅ Resolved TODO items

**Phase 5: Testing & Validation** (1 hour)
- ✅ Created comprehensive Testing & Validation Guide (580 lines)
- ✅ Documented validation procedures for all 29 components
- ✅ Defined 3 critical user workflows
- ✅ Created 5-minute smoke test checklist
- ✅ Provided unit test templates for future automation

**Impact:**
- **Code Quality**: 9/10 (DRY, SOLID principles applied)
- **Lines Reduced**: 2,139 lines (57% average reduction)
- **Components Created**: 29 focused, single-responsibility components
- **Documentation**: 3 comprehensive guides created
- **Linter Errors**: 0 (Zero throughout entire refactor)
- **Commits**: 68+ well-documented commits

**Benefits:**
- 🎯 **Maintainability**: Easy to find and modify specific features
- 🔧 **Testability**: Smaller components = easier testing
- 📚 **Readability**: Clear separation of concerns
- 🚀 **Extensibility**: Simple to add new features
- 📖 **Documentation**: Comprehensive testing and validation guides

**Documentation:**
- `docs/TESTING_VALIDATION_GUIDE.md` - Complete testing procedures

---

### 🔧 Session v1.15.13 - Model Training & Audit Trail Fixes (Oct 24, 2025)

**Major Fixes:**
- ✅ **Model Training accuracy metrics** - Now shows real data (was incorrectly 100%)
- ✅ **OCR correction-to-expense linkage** - All new corrections link to their expenses
- ✅ **Audit trail logging** - Inline edits now properly logged (field name mismatch fixed)
- ✅ **Developer Dashboard cleanup** - Removed unnecessary stats

**Key Discoveries:**
- OCR merchant extraction: 0% accuracy (8/8 corrected) - needs improvement
- OCR amount extraction: 100% accuracy (0/8 corrected) - working well
- OCR category extraction: 62.5% accuracy (3/8 corrected) - decent
- Learned patterns require 3+ identical corrections (fuzzy matching recommended)

---

### 🤖 Full AI-Powered OCR Pipeline with Microservices (v1.13.4)

**Major Achievement:** Integrated 3-microservice AI feedback loop for receipt processing

**Architecture:**
```
Trade Show App Sandbox (192.168.1.144)
    ↓ Receipt Upload
External OCR Service (192.168.1.195:8000)
    → Tesseract OCR (15-20s)
    → LLM Enhancement if confidence < 0.70 (95-115s with Ollama)
    ↓ Field Extraction
User Corrections
    ↓ Automatic Tracking
Data Pool (192.168.1.196:5000)
    → Quality Scoring
    → UTF-8 Storage
    ↓ Training Data
Model Training (192.168.1.197:5001)
    → Pattern Analysis
    → Prompt Improvement
    ↓ Enhanced Prompts
Back to OCR Service (Continuous Learning)
```

**What's Complete:**
- ✅ External OCR Service integration (HTTP multipart file upload)
- ✅ Automatic user correction tracking
- ✅ Data Pool sync with UTF-8 encoding
- ✅ Model Training v1.2.0 (improved merchant/category extraction)
- ✅ LLM enhancement for low-confidence receipts (Ollama + dolphin-llama3)
- ✅ Progressive timeout architecture (180s Nginx → 180s Backend → 120s OCR)
- ✅ Health checks before external service calls
- ✅ Non-blocking Data Pool integration
- ✅ Quality score calculation (76-86% average)

**Performance:**
- High confidence receipts (≥0.70): **15-20 seconds** ⚡
- Low confidence receipts (<0.70): **95-115 seconds** (LLM-enhanced) 🧠

**Key Files:**
- `backend/src/routes/ocrV2.ts` - External OCR integration
- `backend/src/services/ocr/UserCorrectionService.ts` - Data Pool sync
- `src/utils/ocrCorrections.ts` - Frontend correction tracking

**Next Steps:**
- ⏳ Session timeout warnings & token refresh
- ⏳ OCR progress feedback with stages
- ⏳ Faster LLM model (tinyllama vs dolphin-llama3)
- ⏳ Batch receipt upload
- ⏳ Production deployment (Container 201)

---

## 🆕 Recent Updates (v1.1.0 - v1.5.1)

**October 16, 2025 - Major Feature Release & Production Deployment**

### 🎯 Major Features (v1.3.0 - v1.4.13)

#### ✨ Unified Expense & Approval Workflows (v1.3.0)
- **Merged Approvals page into Expenses page** - Single unified interface for all expense management
- **Role-based views**: Regular users see only their expenses, accountants/admins see approval workflows
- **Approval cards** showing pending counts, reimbursements, and unassigned entities
- **Inline entity assignment** and Zoho push directly from expense table
- **Editable detail modal** - Status, reimbursement, and entity can be modified in-place
- **Mark as Paid button** - Quick reimbursement payment tracking
- **Zoho push status indicator** in detail modal

#### 🤖 Automated Approval Workflow (v1.4.0)
- **Removed manual approval buttons** - Approvals now happen automatically
- **Auto-approve on entity assignment** - Assigning an entity automatically approves the expense
- **Auto-approve on reimbursement decision** - Approved/rejected reimbursement auto-approves expense
- **Regression detection** - Automatically sets "needs further review" status when fields are reverted
- **Simplified 3-rule logic** - Clear, reliable status transitions

### 🐛 Critical Bug Fixes

#### Timezone Bug (v1.1.12)
- **Issue**: Expenses submitted at 9:35 PM showed next day's date
- **Fix**: Created `getTodayLocalDateString()` to use local time instead of UTC
- **Impact**: All date inputs now use correct local dates

#### Offline Notification Spam (v1.1.13)
- **Issue**: Multiple "Working Offline" notifications stacking up, not dismissing
- **Fix**: Implemented notification ID tracking, less aggressive network detection
- **Impact**: Clean, single offline notification that properly dismisses

#### Session Timeout Warning (v1.1.14)
- **Issue**: Users logged out without seeing 5-minute warning modal
- **Fix**: Corrected token refresh URL, improved session/API coordination
- **Impact**: Users now see warning before timeout

#### Auto-Status Logic Reliability (v1.5.0)
- **Issue**: Expenses stuck in "needs further review" despite corrective actions
- **Fix**: Completely rewrote logic with 3 clear rules (regression → approval → no-op)
- **Impact**: Bulletproof status transitions, impossible to miss edge cases

#### Pending Tasks Navigation (v1.4.13/v1.5.1)
- **Issue**: "Push to Zoho" button in dashboard led to 404 (old approvals page)
- **Fix**: Updated all task links to point to unified expenses page
- **Impact**: All dashboard quick actions work correctly

### 💡 UI/UX Improvements
- **Settings cleanup** - Removed redundant summary, counts moved to card headers
- **Responsive expense table** - Readable with nav pane open or closed
- **Collapsible inline filters** - Hidden by default, toggle button in Actions column
- **Category colors restored** - Charts match expense table colors
- **Delete confirmations** - All delete operations now ask for confirmation
- **Reimbursement status clarity** - "Approved" now reads "Approved (pending payment)"

### 📝 Lessons Learned
- **Database schema constraints** must be updated BEFORE deploying code that uses new values
- **Frontend deployment directory** is `/var/www/trade-show-app/current/` not root
- **Backend service path** is `/opt/trade-show-app/backend/`
- **Always create version tags** after production deployment
- **One branch per development session**, not per individual change
- **Separate Zoho credentials** for sandbox/production is intentional (data isolation)

### ⚠️ Breaking Changes (v1.3.0+)
- **Approvals page removed** - All approval workflows moved to Expenses page
- **Manual approval buttons removed** - Status changes are now automated
- **Navigation structure changed** - Dashboard tasks now navigate to /expenses

---

## ✨ Complete Feature List

### 🎪 Event Management
- **Create & manage trade show events** with start/end dates, locations, budgets
- **Participant tracking** - Add users to events with assigned roles
- **Temporary attendees** - Create on-the-fly users for one-time participants
- **Event status tracking** - Upcoming, in progress, completed
- **Budget management** (admin-only visibility)
- **Event filtering & search**

### ✅ Event Checklist System 🆕 (v1.27.14)
- **Flight Bookings** - Track per-attendee flights with carrier, confirmation, status
- **Hotel Reservations** - Manage check-in/out dates, property details, room notes
- **Car Rentals** - Group or individual assignments with optional receipt upload
- **Booth Management** - Order status, map uploads (images/PDFs), electricity tracking
- **Shipping Tracking** - Multiple shipments with carrier names, tracking numbers, dates
- **Custom Checklist Items** - Flexible task tracking with completion status
- **Checklist Templates** - Reusable templates auto-applied to new events
- **Receipt Integration** - Upload car rental/hotel receipts during checklist entry (auto-creates expenses)

### 💰 Expense Management
- **Submit expenses** with receipt upload (10+ file formats including phone camera images)
- **OCR receipt scanning** - Auto-extract merchant, amount, date, category, card info
- **Offline submission** - Queue expenses when offline, sync automatically
- **Automated approval workflows** (v1.4.0+):
  - Auto-approve when entity assigned
  - Auto-approve when reimbursement decided
  - Regression detection (needs further review)
- **Inline entity assignment** - Assign Zoho entities directly from table
- **Reimbursement tracking** - Request, approve/reject, mark as paid
- **Approval cards** - Dashboard showing pending approvals, reimbursements, unassigned entities
- **Advanced filtering** - Date, merchant, category, status, entity, reimbursement status
- **Editable detail modal** - Modify status, entity, reimbursement in-place
- **Receipt viewing** - Full-size with hide option
- **Delete confirmations** - All deletions require explicit confirmation

### 🔗 Zoho Books Integration
- **5-entity support** - Haute Brands, Alpha, Beta, Gamma, Delta
- **One-click Zoho push** - Sync expenses with receipt attachments
- **Duplicate prevention** - Track `zoho_expense_id` to prevent re-pushing
- **OAuth 2.0 authentication** - Automatic token refresh
- **Entity re-assignment** - Clear Zoho ID and re-push to different entity
- **Smart navigation** - Dashboard links to events with most unsynced items
- **Separate credentials** for sandbox/production (data isolation)

### 📊 Reports & Analytics
- **Detailed reports** by event with real-time filters
- **Sortable expense tables** - Click column headers to sort
- **Total calculations** - Automatic sum of filtered expenses
- **Receipt thumbnails** in reports
- **Export capabilities** (coming soon: CSV, PDF, Excel)
- **Entity-based filtering** - View expenses by Zoho organization

### 🎭 Dynamic Role Management System (v1.0.54+)
- **Create custom roles** dynamically from the UI
- **System roles** (admin, accountant, coordinator, salesperson, developer, temporary, pending) are protected
- **Custom roles** can be added, edited, and deleted
- **Role properties**: Label, description, color badge (10 color options)
- **Database-driven**: All role data stored in `roles` table
- **Developer permissions**: Developers have full admin capabilities PLUS exclusive Dev Dashboard access

### 👥 User Management
- **View all users** - Table with name, username, email, role
- **Create users** - Add new users with role assignment
- **Edit users** - Update details, change roles, reset passwords
- **Delete users** - Confirmation required, "admin" user protected
- **Dynamic role dropdown** - Loads from database (system + custom roles)

### 📱 Dashboard & Quick Actions
- **Role-based widgets** - Different views for users vs admins/accountants
- **Upcoming events** - Next 3 events with countdown
- **Recent expenses** - Last 5 submitted by user
- **Active events** - Currently in-progress events
- **Pending approvals** (admin/accountant) - Count with link to Expenses
- **Unassigned entities** (admin/accountant) - Count with link
- **Pending reimbursements** (admin/accountant) - Count with link
- **Push to Zoho tasks** (admin/accountant) - Count of unsynced expenses
- **Quick action links** - Direct navigation to filtered expense views

### 🛠️ Developer Dashboard
- **System diagnostics** - Node version, uptime, memory usage
- **Database status** - Connection health, query performance
- **Cache management** - View and clear caches
- **API health checks** - Test external services (OCR, Data Pool)
- **Environment info** - View non-sensitive configuration
- **Exclusive access** - Only developer role, not available to admins

### ⚙️ Settings & Configuration
- **App version display** - Current frontend/backend versions
- **Environment indicator** - Production vs Sandbox
- **Database connection status** - Real-time health monitoring
- **OCR configuration** (developer only) - Provider, timeouts, Data Pool status
- **Admin-only access** - Configure application-wide settings

### 🔐 Role-Based Access Control
- **Admin**: Full system access + user/role management
- **Developer**: All admin capabilities + Dev Dashboard (debugging tools, diagnostics)
- **Accountant**: Approve expenses, manage reimbursements, Zoho Books integration, reports
- **Event Coordinator**: Create/manage events, assign participants, view event expenses
- **Salesperson**: Submit expenses for assigned events, upload receipts
- **Temporary Attendee**: Limited event participation for custom attendees

### 📱 Progressive Web App (PWA)
- **Offline-first architecture** with IndexedDB
- **Sync queue** for offline expense submissions
- **Service Worker** with cache versioning (auto-updates)
- **Network-first strategy** for API calls (prevents stale data)
- **Background sync** - Auto-sync when connection restored
- **Install prompt** - Add to home screen on mobile
- **Push notifications** (coming soon)

---

## 🏗️ Tech Stack

### Frontend
- **React 18** with TypeScript
- **Tailwind CSS** for styling
- **Vite** for build tooling
- **Lucide React** for icons
- **Service Worker** for PWA functionality
- **IndexedDB** for offline storage

### Backend
- **Node.js** with Express
- **PostgreSQL** database
- **TypeScript**
- **JWT** for authentication
- **Tesseract.js** for OCR
- **Sharp** for image preprocessing
- **Multer** for file uploads
- **bcrypt** for password hashing

### Infrastructure
- **Proxmox LXC Containers** (Debian 12)
- **Nginx** reverse proxy
- **NPMplus** proxy manager
- **PM2** process manager
- **PostgreSQL 15**

---

## 📦 Installation & Setup

### Prerequisites
- Node.js (v18 or higher)
- PostgreSQL (v15 or higher)
- npm or yarn

### 1. Clone Repository
```bash
git clone https://github.com/sahiwal283/trade-show-app.git
cd trade-show-app
```

### 2. Database Setup

**Create Database:**
```bash
psql postgres
CREATE DATABASE expense_app_sandbox;
CREATE USER expense_sandbox WITH PASSWORD 'sandbox123';
GRANT ALL PRIVILEGES ON DATABASE expense_app_sandbox TO expense_sandbox;
\q
```

**Run Migrations:**
   ```bash
cd backend
   npm install
npm run migrate
npm run seed
   ```

### 3. Backend Setup

**Environment Configuration:**
```bash
cd backend
cp env.example .env
```

**Edit `.env`:**
```env
# Server
PORT=3000
NODE_ENV=development

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=expense_app_sandbox
DB_USER=expense_sandbox
DB_PASSWORD=sandbox123

# JWT
JWT_SECRET=your_random_secret_min_32_chars

# Uploads
UPLOAD_DIR=uploads
MAX_FILE_SIZE=5242880

# Zoho Books (optional)
ZOHO_CLIENT_ID=your_client_id
ZOHO_CLIENT_SECRET=your_client_secret
ZOHO_REFRESH_TOKEN=your_refresh_token
ZOHO_ORGANIZATION_ID=your_org_id
```

**Start Backend:**
```bash
npm run dev
# Backend runs on http://localhost:3000
```

### 4. Frontend Setup

```bash
cd ..  # Return to project root
npm install
npm run dev
# Frontend runs on http://localhost:5173
```

---

## 🗄️ Database Schema

### Core Tables
- **users** - User accounts with roles
- **roles** - Role definitions (labels, colors, permissions) *NEW*
- **events** - Trade show events
- **event_participants** - User-event relationships
- **expenses** - Expense records with OCR data
- **settings** - Application configuration

### Key Relationships
- Users → Roles (many-to-one)
- Events → Participants (many-to-many through event_participants)
- Expenses → Users (many-to-one)
- Expenses → Events (many-to-one)

---

## 🔑 API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration

### Users
- `GET /api/users` - Get all users
- `GET /api/users/:id` - Get user by ID
- `POST /api/users` - Create user (admin/developer)
- `PUT /api/users/:id` - Update user (admin/developer)
- `DELETE /api/users/:id` - Delete user (admin/developer)

### Roles *(NEW)*
- `GET /api/roles` - Get all active roles
- `POST /api/roles` - Create role (admin/developer)
- `PUT /api/roles/:id` - Update role (admin/developer)
- `DELETE /api/roles/:id` - Soft delete role (admin/developer)

### Events
- `GET /api/events` - Get all events
- `GET /api/events/:id` - Get event by ID
- `POST /api/events` - Create event
- `PUT /api/events/:id` - Update event
- `DELETE /api/events/:id` - Delete event

### Event Checklists 🆕 (v1.27.14)
- `GET /api/checklist/:eventId` - Get or create checklist for event
- `PUT /api/checklist/:checklistId` - Update booth/electricity fields
- `POST /api/checklist/:checklistId/booth-map` - Upload booth map
- `DELETE /api/checklist/:checklistId/booth-map` - Delete booth map
- `POST /api/checklist/:checklistId/flights` - Add flight
- `PUT /api/checklist/flights/:flightId` - Update flight
- `DELETE /api/checklist/flights/:flightId` - Delete flight
- `POST /api/checklist/:checklistId/hotels` - Add hotel
- `PUT /api/checklist/hotels/:hotelId` - Update hotel
- `DELETE /api/checklist/hotels/:hotelId` - Delete hotel
- `POST /api/checklist/:checklistId/car-rentals` - Add car rental
- `PUT /api/checklist/car-rentals/:rentalId` - Update car rental
- `DELETE /api/checklist/car-rentals/:rentalId` - Delete car rental
- `POST /api/checklist/:checklistId/booth-shipping` - Add shipping record
- `GET /api/checklist/:checklistId/custom-items` - Get custom items
- `POST /api/checklist/:checklistId/custom-items` - Create custom item
- `PUT /api/checklist/custom-items/:id` - Update custom item
- `DELETE /api/checklist/custom-items/:id` - Delete custom item
- `GET /api/checklist/templates` - Get all active templates
- `POST /api/checklist/templates` - Create template
- `PUT /api/checklist/templates/:id` - Update template
- `DELETE /api/checklist/templates/:id` - Soft delete template
- `POST /api/checklist/:checklistId/apply-templates` - Apply templates to checklist

### Expenses
- `GET /api/expenses` - Get all expenses
- `GET /api/expenses/:id` - Get expense by ID
- `POST /api/expenses` - Create expense with receipt upload
- `PUT /api/expenses/:id` - Update expense
- `PATCH /api/expenses/:id/status` - Update expense status (auto-approval workflow)
- `PATCH /api/expenses/:id/entity` - Assign Zoho entity (triggers auto-approval)
- `PATCH /api/expenses/:id/reimbursement` - Set reimbursement status (triggers auto-approval)
- `POST /api/expenses/:id/zoho` - Push expense to Zoho Books
- `DELETE /api/expenses/:id` - Delete expense

### Quick Actions
- `GET /api/quick-actions` - Get pending tasks for dashboard widget

### Settings
- `GET /api/settings` - Get application settings
- `PUT /api/settings` - Update settings (admin)

---

## 🚀 Deployment

### Sandbox Deployment (v1.0.10 branch)

**Frontend:**
```bash
# Build
npm run build

# Add build ID
BUILD_ID=$(date +%Y%m%d_%H%M%S)
echo "<!-- Build: ${BUILD_ID} -->" >> dist/index.html

# Deploy
tar -czf frontend-v1.0.X-${BUILD_ID}.tar.gz -C dist .
scp frontend-v1.0.X-*.tar.gz root@192.168.1.190:/tmp/frontend-v1.0.X.tar.gz

# Extract and restart
ssh root@192.168.1.190 "
  pct push 203 /tmp/frontend-v1.0.X.tar.gz /tmp/frontend-v1.0.X.tar.gz &&
  pct exec 203 -- bash -c 'cd /var/www/trade-show-app && rm -rf * && tar -xzf /tmp/frontend-v1.0.X.tar.gz && systemctl restart nginx' &&
  pct stop 104 && sleep 3 && pct start 104 && sleep 2
"
```

**Backend:**
```bash
cd backend
npm run build
tar -czf backend-v1.0.X.tar.gz -C dist .
scp backend-v1.0.X.tar.gz root@192.168.1.190:/tmp/backend-v1.0.X.tar.gz

ssh root@192.168.1.190 "
  pct push 203 /tmp/backend-v1.0.X.tar.gz /tmp/backend-v1.0.X.tar.gz &&
  pct exec 203 -- bash -c 'cd /opt/trade-show-app/backend && rm -rf dist && tar -xzf /tmp/backend-v1.0.X.tar.gz -C dist && systemctl restart trade-show-app-backend'
"
```

**⚠️ CRITICAL**: Always restart NPMplus proxy (LXC 104) after frontend deployment to clear cache!

---

## 🐛 Troubleshooting

### Version Not Updating After Deployment
**Cause:** Caching at browser, service worker, or NPMplus proxy level

**Solution:**
1. Hard refresh browser (Cmd+Shift+R or Ctrl+Shift+F5)
2. Verify service worker cache cleared (check console logs)
3. Restart NPMplus proxy: `pct stop 104 && sleep 3 && pct start 104`

### Roles Not Showing in Dropdown
**Cause:** `roles` table migration not applied

**Solution:**
```bash
ssh root@192.168.1.190
pct exec 203
PGPASSWORD=sandbox123 psql -h localhost -U expense_sandbox -d expense_app_sandbox -f /path/to/003_create_roles_table.sql
```

### Developer Cannot Delete Users
**Cause:** Backend authorization checks missing 'developer' role

**Solution:** Already fixed in backend v1.0.23

### Backend Logs
```bash
ssh root@192.168.1.190 "pct exec 203 -- journalctl -u trade-show-app-backend -n 50 --no-pager"
```

---

## 📚 Documentation

- **[CHANGELOG.md](CHANGELOG.md)** - Complete version history
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** - System architecture and diagrams
- **[docs/AI_MASTER_GUIDE.md](docs/AI_MASTER_GUIDE.md)** - Development guide for AI assistants
- **[docs/BOOMIN_CREDENTIALS.md](docs/BOOMIN_CREDENTIALS.md)** - Production credentials
- **[docs/ZOHO_BOOKS_SETUP.md](docs/ZOHO_BOOKS_SETUP.md)** - Zoho Books integration guide

---

## 📝 License

Proprietary software. © 2025 Haute Brands. All rights reserved.

---

## 🔧 Recent Updates (v1.0.54 - v1.0.58)

### v1.0.58 (October 15, 2025)
- **Fixed**: Role labels now load dynamically from database
- **Fixed**: Developer and temporary roles no longer show as "Pending Approval"

### v1.0.57
- **Improved**: Larger, more readable font sizes in Role Management

### v1.0.56
- **Added**: Developer role now has full admin capabilities
- **Fixed**: Role dropdowns now load all roles dynamically from database

### v1.0.55
- **Changed**: Role Management moved below User Management
- **Changed**: Made Role Management collapsible (collapsed by default)

### v1.0.54
- **Added**: Dynamic Role Management System
- **Added**: Create, edit, delete custom roles from UI
- **Added**: Database migration for `roles` table

See [CHANGELOG.md](CHANGELOG.md) for complete history.
