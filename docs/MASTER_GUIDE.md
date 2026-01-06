# 🤖 MASTER GUIDE - ExpenseApp

**Last Updated:** November 12, 2025  
**Status:** ✅ Production v1.29.0 Ready | 🔬 Sandbox v1.28.16 - PDF Optimization & Diagnostics

**Purpose:** This is the SINGLE AUTHORITATIVE SOURCE for all AI agents working on ExpenseApp. It contains everything you need to know: what works, what doesn't, what's being built, what's planned, failures, lessons learned, and critical information.

**⚠️ IMPORTANT:** Before working on this project, read `docs/AGENT_CONTRACT.md` to understand your role, permissions, scope, and responsibilities.

---

## 📋 Table of Contents

1. [Current State](#-current-state)
2. [What's Working](#-whats-working)
3. [What's Not Working / Failures](#-whats-not-working--failures)
4. [What's Being Worked On](#-whats-being-worked-on)
5. [What's Planned / Roadmap](#-whats-planned--roadmap)
6. [Critical Information](#-critical-information)
7. [Application Overview](#-application-overview)
8. [Architecture](#-architecture)
9. [Credentials & Access](#-credentials--access)
10. [Deployment](#-deployment)
11. [Development Workflows](#-development-workflows)
12. [Known Issues & Solutions](#-known-issues--solutions)
13. [Common Pitfalls & Errors to Avoid](#️-common-pitfalls--errors-to-avoid)
14. [Prevention Checklist](#️-prevention-checklist)
15. [API Reference](#-api-reference)
16. [Historical Sessions & Lessons Learned](#-historical-sessions--lessons-learned)
17. [Troubleshooting](#-troubleshooting)

---

## 🎯 Current State

### Versions

**Production (Container 201 & 202)**
- **Frontend:** v1.29.0 (Ready for Deployment)
- **Backend:** v1.29.0 (Ready for Deployment)
- **Branch:** `main`
- **Status:** ✅ Ready for Production Deployment
- **Last Updated:** November 12, 2025

**Sandbox (Container 203)**
- **Frontend:** v1.28.16 (Container 203)
- **Backend:** v1.28.16 (Container 203)
- **Branch:** `v1.28.0`
- **Status:** 🔬 PDF Optimization, Checklist Features, Full Codebase Refactor
- **Last Updated:** November 12, 2025

### Container Mapping (MEMORIZE THIS!)
- **Container 201** = **PRODUCTION Backend** (Live users, real financial data)
- **Container 202** = **PRODUCTION Frontend**
- **Container 203** = **SANDBOX** (Testing environment)
- **Container 104** = **NPMplus Proxy**

### Quick Access
- **Production URL:** https://expapp.duckdns.org
- **Sandbox URL:** http://192.168.1.144
- **Proxmox Host:** 192.168.1.190
- **Repository:** https://github.com/sahiwal283/expenseApp

---

## ✅ What's Working

### Production Features (v1.4.13 / v1.5.1)
- ✅ **Expense Management** - Full CRUD operations, receipt upload
- ✅ **Event Management** - Create/manage events, participants
- ✅ **Zoho Integration** - 5-entity sync, OAuth 2.0, duplicate prevention
- ✅ **Automated Approval Workflows** - Auto-approve on entity assignment/reimbursement
- ✅ **User & Role Management** - Dynamic roles, custom permissions
- ✅ **Reports** - Detailed reports with filtering
- ✅ **PWA/Offline** - Service Worker, IndexedDB, background sync
- ✅ **Tesseract OCR** - Embedded OCR processing (production)

### Sandbox Features (v1.28.0)
- ✅ **Event Checklist System** - Flights, hotels, car rentals, booth, shipping
- ✅ **External OCR Service** - Google Document AI integration (4-8s processing, 95%+ confidence)
- ✅ **AI Training Pipeline** - OCR corrections → Data Pool → Model Training
- ✅ **Repository Pattern** - Clean separation of concerns (Routes → Services → Repositories)
- ✅ **Component Modularization** - Feature-based organization, reusable hooks
- ✅ **Helper Functions** - 13 backend helpers, organized frontend utilities
- ✅ **Type Safety** - No `any` types, proper interfaces throughout

### What Worked Well
- ✅ **Helper Function Extraction** - Reduced DevDashboardService complexity significantly
- ✅ **Repository Pattern** - Improved testability and maintainability
- ✅ **Component Modularization** - Easier to find and modify features
- ✅ **Schema Validation** - Prevents deployment disasters
- ✅ **Separate Sandbox/Production Credentials** - Data isolation works perfectly
- ✅ **Automated Approval Workflows** - No manual buttons needed
- ✅ **Zod Validation** - Runtime input validation prevents bad data

---

## ❌ What's Not Working / Failures

### Critical Failures (RESOLVED)

**1. Production Login Failure (November 10, 2025) - RESOLVED**
- **What Happened:** All users unable to log in - "Invalid username or password"
- **Root Causes:**
  1. Database schema mismatch (`audit_log` vs `audit_logs`)
  2. Missing database columns (7 columns missing from `audit_logs`)
  3. Network-level routing override (iptables DNAT rule)
  4. Stale backend process running old code
- **Resolution:** Fixed table names, added columns, removed NAT rule, restarted service
- **Lessons:** Always validate schema, restart services after deployment, check network rules

**2. Database Migration System - RESOLVED**
- **What Happened:** Migrations not running automatically
- **Resolution:** Manual migration process established
- **Status:** ✅ Resolved

**3. Expenses Not Assigning Entity - RESOLVED**
- **What Happened:** Expenses not getting Zoho entity assigned
- **Resolution:** Fixed entity assignment logic
- **Status:** ✅ Resolved

**4. Caching Problems - RESOLVED**
- **What Happened:** Service worker caching old versions
- **Resolution:** Cache busting procedure established
- **Status:** ✅ Resolved

**5. Auto-Logout Not Working - RESOLVED**
- **What Happened:** Users not logged out after inactivity
- **Resolution:** Fixed session timeout logic
- **Status:** ✅ Resolved

### Known Issues (ONGOING)

**1. OCR Service Configuration for Production**
- **Problem:** Production doesn't have external OCR service (Container 204 is sandbox-only)
- **Current State:** Production uses embedded Tesseract
- **Options:**
  1. Keep embedded Tesseract (safest, slower)
  2. Deploy external OCR service (requires new infrastructure)
- **Decision Needed:** Which OCR method for production?
- **Impact:** Affects production deployment of checklist feature

**2. Checklist Feature Not in Production**
- **Problem:** Major new feature (v1.27.14) only in sandbox
- **Risk:** Not tested with production data/scale
- **Status:** Ready for testing, needs production deployment decision
- **Action Required:** Decide on deployment strategy

**3. Uncommitted Changes**
- **Problem:** Multiple files modified but not committed
- **Impact:** Deployment readiness unclear
- **Action Required:** Review and commit all changes

### What Didn't Work / Lessons Learned

**1. Database Schema Constraints**
- **Failure:** Deployed code with new enum values without updating CHECK constraints
- **Result:** Runtime errors, production failures
- **Lesson:** ALWAYS update schema constraints BEFORE deploying code
- **Fix:** Schema validation process created

**2. Frontend Deployment Directory**
- **Failure:** Deployed to wrong directory (`/var/www/html` instead of `/var/www/trade-show-app`)
- **Result:** 404 errors, broken frontend
- **Lesson:** Always verify deployment paths
- **Fix:** Documented correct paths

**3. Backend Service Path Case Sensitivity**
- **Failure:** Wrong case in path (`expenseapp` vs `expenseApp`)
- **Result:** Service wouldn't start
- **Lesson:** Case-sensitive filesystems require exact paths
- **Fix:** Documented correct path with capital 'A'

**4. Version Number Management**
- **Failure:** Accidentally set version to 2.0.0 without breaking changes
- **Result:** Confused versioning, broke semantic versioning
- **Lesson:** Never change version numbers without explicit approval
- **Fix:** Reset to proper versions

**5. Network-Level Routing Override**
- **Failure:** iptables DNAT rule redirecting production traffic to sandbox
- **Result:** Production login failures
- **Lesson:** Network-level rules override application config
- **Fix:** Removed malicious rule, added monitoring

**6. Session Timeout During OCR Processing**
- **Failure:** JWT token expires if OCR takes too long (95-115s for LLM enhancement)
- **Result:** Users logged out mid-processing
- **Status:** NEEDS FIX
- **Solution Needed:** Token refresh mechanism or extended expiry

**7. LLM Processing Slow**
- **Failure:** dolphin-llama3 model takes 95-115 seconds for low-confidence receipts
- **Result:** Poor UX for 20% of receipts
- **Status:** Acceptable for now, but needs improvement
- **Future:** Switch to faster model (tinyllama, phi-2) or GPU acceleration

**8. OCR Service Single Point of Failure**
- **Failure:** No fallback if external OCR service is down
- **Result:** OCR completely fails (embedded OCR removed per user request)
- **Status:** Mitigation in place (health checks, local corrections stored first)
- **Future:** Consider fallback to embedded OCR

---

## 🔨 What's Being Worked On

### Active Development (v1.28.0)

**1. Codebase Refactor - COMPLETE**
- ✅ Repository pattern implemented
- ✅ Service layer created
- ✅ Component modularization
- ✅ Helper function extraction
- ✅ Type safety improvements
- **Status:** ✅ Complete

**2. Event Checklist System - COMPLETE**
- ✅ Flights, hotels, car rentals tracking
- ✅ Booth management and shipping
- ✅ Custom checklist items
- ✅ Templates system
- ✅ Receipt integration
- **Status:** ✅ Complete (Sandbox only)

**3. Helper Functions Documentation - COMPLETE**
- ✅ 13 backend helpers documented
- ✅ Frontend utilities organized
- ✅ HELPER_FUNCTIONS.md created
- **Status:** ✅ Complete

### In Progress

**1. Production Deployment Preparation**
- **Status:** Planning phase
- **Blockers:**
  - OCR service configuration decision needed
  - Database migrations need production testing
  - Checklist feature needs production testing
- **Action Required:** See PRE_PRODUCTION_CHECKLIST.md

**2. Schema Validation Automation**
- **Status:** Scripts created, needs integration
- **Goal:** Automated schema validation before deployments
- **Progress:** Manual validation working, automation pending

---

## 🗺️ What's Planned / Roadmap

### Immediate Priorities

**1. Production Deployment of Checklist Feature**
- **Priority:** HIGH
- **Dependencies:**
  - OCR service configuration decision
  - Database migrations tested
  - Production testing completed
- **Timeline:** TBD

**2. Session Timeout Fix for OCR**
- **Priority:** MEDIUM
- **Problem:** Tokens expire during long OCR processing
- **Solution Options:**
  - Token refresh mechanism
  - Extended token expiry for OCR endpoints
  - Progress feedback with token refresh
- **Timeline:** TBD

### Planned Features

**1. Mobile App (React Native)**
- **Status:** Planned
- **Priority:** LOW
- **Timeline:** Future

**2. Push Notifications**
- **Status:** Planned
- **Priority:** MEDIUM
- **Timeline:** Future

**3. Advanced Analytics**
- **Status:** Planned
- **Priority:** LOW
- **Timeline:** Future

**4. Bulk Expense Import**
- **Status:** Planned
- **Priority:** MEDIUM
- **Timeline:** Future

**5. Receipt Scanning Improvements (ML-based)**
- **Status:** Planned
- **Priority:** MEDIUM
- **Timeline:** Future

**6. Multi-Currency Support**
- **Status:** Planned
- **Priority:** LOW
- **Timeline:** Future

**7. Custom Report Builder**
- **Status:** Planned
- **Priority:** LOW
- **Timeline:** Future

**8. Email Notifications**
- **Status:** Partially implemented
- **Priority:** MEDIUM
- **Timeline:** Future

**9. Export Capabilities (CSV, PDF, Excel)**
- **Status:** Coming soon
- **Priority:** MEDIUM
- **Timeline:** Future

### Technical Debt

**1. Comprehensive Unit Tests**
- **Status:** Needed
- **Priority:** HIGH
- **Impact:** Prevents regressions

**2. E2E Tests (Playwright/Cypress)**
- **Status:** Needed
- **Priority:** MEDIUM
- **Impact:** Automated testing

**3. Rate Limiting**
- **Status:** Needed
- **Priority:** MEDIUM
- **Impact:** Security

**4. Redis Caching Layer**
- **Status:** Planned
- **Priority:** LOW
- **Impact:** Performance

**5. Database Connection Pooling Optimization**
- **Status:** Needed
- **Priority:** MEDIUM
- **Impact:** Performance

**6. OCR Improvements**
- **Status:** Ongoing
- **Priority:** MEDIUM
- **Goals:**
  - Faster LLM model (tinyllama vs dolphin-llama3)
  - OCR progress feedback with stages
  - Batch receipt upload
  - Better accuracy (currently 65% merchant, 84% amount, 91% date, 62% category)

### OCR Training Roadmap

**v1.13.0 - Enhanced Learning (Next)**
- [ ] Implement category pattern learning
- [ ] Add amount validation patterns
- [ ] Cross-merchant learning (similar patterns)
- [ ] Confidence decay (older patterns get lower confidence)

**v1.14.0 - Advanced AI (Future)**
- [ ] Fine-tune Ollama on correction data
- [ ] Multi-provider ensemble (Tesseract + EasyOCR vote)
- [ ] OCR quality prediction (pre-process)
- [ ] Automatic pattern A/B testing

**v2.0.0 - Production ML (Long-term)**
- [ ] Custom-trained OCR model for receipts
- [ ] End-to-end neural network (image → structured data)
- [ ] Active learning prompts (ask user for specific confirmations)
- [ ] Multi-language support

---

## 🚨 Critical Information

### ⚠️ PRODUCTION DEPLOYMENT PROTECTION

**🛑 NEVER DEPLOY TO PRODUCTION WITHOUT EXPLICIT USER CONFIRMATION!**

### Database Schema Updates

**ALWAYS update database schema constraints when deploying code that uses new values!**

**Common Pitfall:** Deploying code that uses new enum values (like new status types) WITHOUT updating the database CHECK constraints will cause runtime errors.

**Required Steps:**
1. Update `schema.sql` - Add new values to CHECK constraints
2. Create migration file for existing constraint updates
3. Test in sandbox FIRST
4. Run migration in production BEFORE deploying code
5. Verify constraint - Check that new values are allowed

**Example:**
```sql
ALTER TABLE table_name DROP CONSTRAINT IF EXISTS constraint_name;
ALTER TABLE table_name ADD CONSTRAINT constraint_name 
  CHECK (column_name IN ('value1', 'value2', 'NEW_VALUE'));
```

### Schema Validation Before Deployment (CRITICAL)

**⚠️ MUST RUN BEFORE EVERY PRODUCTION DEPLOYMENT**

**Why Schema Validation is Critical:**
- Prevents `column does not exist` errors at runtime
- Catches missing tables before code tries to query them
- Verifies foreign key constraints are properly defined
- Ensures CHECK constraints match code expectations
- Identifies missing migrations before deployment

**How to Run Validation:**

**Method 1: Automated Script (If Available)**
```bash
cd backend
npm run validate-schema
```

**Method 2: Manual SQL Validation**
```bash
# Connect to production database
ssh root@192.168.1.190
pct exec 201 -- su - postgres -c 'psql -d expense_app_production'

# 1. Verify all required tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

# 2. Verify table column counts
SELECT 
  table_name,
  COUNT(column_name) as column_count
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('event_checklists', 'checklist_flights', 'expenses', 'events', 'users')
GROUP BY table_name
ORDER BY table_name;

# 3. Verify critical columns exist
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'event_checklists' AND column_name IN ('event_id', 'booth_ordered', 'electricity_ordered'))
    OR (table_name = 'expenses' AND column_name IN ('id', 'user_id', 'event_id', 'status', 'zoho_entity'))
  )
ORDER BY table_name, column_name;

# 4. Verify foreign key constraints
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name;
```

**Pre-Deployment Checklist:**
- [ ] All required tables exist
- [ ] Column counts match expected values
- [ ] Critical columns exist (foreign keys, status fields)
- [ ] Foreign key constraints are properly defined
- [ ] CHECK constraints exist for enum-like fields
- [ ] Indexes exist on foreign key columns

**If Validation Fails:**
1. **STOP deployment immediately**
2. Document the failure
3. Review migration files
4. Apply missing migrations
5. Re-run validation
6. **Only proceed after validation passes**

### Sandbox vs Production Credentials

**CRITICAL UNDERSTANDING**: Sandbox and production use **SEPARATE** Zoho Books OAuth credentials intentionally!

**Why Separate Credentials?**
- ✅ **Data Isolation**: Sandbox writes to "Meals" account, production to "Trade Shows"
- ✅ **Security**: Sandbox breach doesn't compromise production data
- ✅ **Testing Freedom**: Can delete all sandbox test data safely
- ✅ **Audit Trail**: Easy to identify what's test vs real

**DO NOT "Fix" This!**
- **Sandbox**: Uses OAuth app ending in `...EGPHAA` → writes to "Meals" expense account
- **Production**: Uses OAuth app ending in `...SQNQVI` → writes to "Trade Shows" expense account
- **Both**: Connect to same Zoho Books organization (856048585 - Haute Brands)

**Credential Locations:**
- **Sandbox Credentials**: `credentials/SANDBOX_CREDENTIALS.md`
- **Production Credentials**: `credentials/HAUTE_CREDENTIALS.md`
- **DO NOT** mix or "unify" these credentials!

### AI Training Pipeline Database Setup

**⚠️ TRAINING PIPELINE REQUIRES SPECIFIC DATABASE TABLES!**

As of **v1.11.0+**, the AI training pipeline requires `ocr_corrections` table to exist.

**Required Database Migrations:**
- `006_create_ocr_corrections_table.sql` - Creates main corrections table
- `007_enhance_ocr_corrections_for_cross_environment.sql` - Adds training features

**How to Verify:**
```bash
ssh root@192.168.1.190
pct exec 203 -- su - postgres -c 'psql -d expense_app -c "\dt"'
# Should see: ocr_corrections
```

### Frontend Deployment Directory

**CRITICAL**: Frontend MUST be deployed to `/var/www/trade-show-app` (NOT `/var/www/html`)

**Why:**
- Nginx is configured to serve from `/var/www/trade-show-app`
- `/var/www/html` is used by other services
- Wrong directory = 404 errors

**Verify:**
```bash
ssh root@192.168.1.190 "pct exec 203 -- ls -la /var/www/trade-show-app"
```

### Backend Deployment Path Case Sensitivity

**CRITICAL**: Backend MUST be deployed to `/opt/trade-show-app/backend` (capital 'A' in expenseApp)

**Why:**
- Service file references exact path
- Case-sensitive filesystem
- Wrong case = service won't start

---

## 📱 Application Overview

### What is ExpenseApp?

**ExpenseApp** is a professional trade show expense management system for **Haute Brands** and its sub-brands (Alpha, Beta, Gamma, Delta). It manages the complete expense lifecycle from receipt capture to Zoho Books accounting integration.

### Core Modules

| Module | Features | Key Users |
|--------|----------|-----------|
| **Event Management** | Create events, manage participants, track budgets | Admin, Coordinator |
| **Expense Submission** | Upload receipts, OCR extraction, offline support | All users |
| **Approval Workflows** | Automated approval, entity assignment, reimbursement | Admin, Accountant |
| **Zoho Integration** | 5-entity sync, duplicate prevention, OAuth 2.0 | Admin, Accountant |
| **Reports** | Detailed & summary reports, filtering, exports | Admin, Accountant |
| **User Management** | CRUD operations, role assignments | Admin, Developer |
| **Role Management** | Custom roles, dynamic permissions | Admin, Developer |
| **Dashboard** | Widgets, quick actions, pending tasks | All users |
| **Developer Tools** | Diagnostics, health checks, cache management | Developer only |
| **PWA/Offline** | Service Worker, IndexedDB, background sync | All users |
| **Event Checklist** | Trade show logistics (flights, hotels, car rentals, booth) | Coordinator, Admin |

### Unique Capabilities

1. **Dynamic Role System** - Create custom roles with colors and permissions
2. **Automated Approval Workflows** - No manual approval buttons, status changes automatically
3. **5-Entity Zoho Support** - Multi-brand accounting with separate Zoho organizations
4. **Offline-First Architecture** - Submit expenses without internet, sync automatically
5. **OCR + LLM Enhancement** (Sandbox) - AI-powered receipt extraction with continuous learning
6. **Reimbursement Tracking** - Complete workflow from request to payment
7. **Developer Dashboard** - Exclusive debugging tools for developer role
8. **Entity Re-assignment** - Change Zoho entity and re-push expenses
9. **Trade Show Checklist** - Complete event logistics management

### Technology Stack

**Frontend:** React 18 + TypeScript + Tailwind CSS + Vite  
**Backend:** Node.js + Express + TypeScript + PostgreSQL  
**Architecture:** Repository Pattern (Backend) + Component Modularization (Frontend)  
**Infrastructure:** Proxmox LXC (Debian 12) + Nginx + PM2  
**Integrations:** Zoho Books API (OAuth 2.0)  
**OCR:** Tesseract (production) | External microservice with Ollama LLM (sandbox)  
**PWA:** Service Worker + IndexedDB + Background Sync

---

## 🏗️ Architecture

### Backend Architecture (v1.28.0+)

**Pattern: Routes → Services → Repositories → Database**

```
┌─────────────────┐
│  Routes/       │  ← HTTP request handling, validation
│  Controllers   │  ← Input sanitization, response formatting
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Services       │  ← Business logic, orchestration
│                 │  ← Authorization checks
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Repositories   │  ← Data access layer
│                 │  ← Query building, type safety
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  PostgreSQL     │  ← Database
└─────────────────┘
```

**Available Repositories:**
- `BaseRepository` - Common CRUD operations
- `ExpenseRepository` - Expense data access
- `UserRepository` - User data access
- `EventRepository` - Event data access
- `AuditLogRepository` - Audit log data access
- `ChecklistRepository` - Checklist data access
- `ApiRequestRepository` - API analytics data access

**Available Services:**
- `ExpenseService` - Expense business logic
- `DevDashboardService` - Developer dashboard logic
- `ZohoMultiAccountService` - Multi-entity Zoho integration
- `ZohoBooksService` - Zoho Books API integration
- `OCRService` - OCR processing orchestration
- `UserCorrectionService` - OCR correction tracking
- `DuplicateDetectionService` - Expense duplicate detection
- `ExpenseAuditService` - Audit trail management

### Frontend Architecture (v1.28.0+)

**Pattern: Feature-Based Organization with Component Modularization**

```
src/components/
├── common/                ← Shared components
│   ├── Badge.tsx
│   ├── StatusBadge.tsx
│   └── ...
├── expenses/              ← Expense feature
│   ├── ExpenseSubmission.tsx
│   ├── ExpenseSubmission/  ← Sub-components
│   │   ├── hooks/          ← Feature hooks
│   │   └── *.tsx
│   └── ReceiptUpload/
├── admin/                 ← Admin features
│   ├── AdminSettings.tsx
│   └── AdminSettings/
└── checklist/             ← Checklist feature
    └── sections/
```

**Benefits:**
- Feature isolation
- Reusable hooks
- Component composition
- Easier testing
- Better maintainability

### File Structure

**Backend:**
```
backend/src/
├── config/                    ← Configuration files
├── database/
│   ├── schema.sql             ← Base schema
│   ├── migrations/            ← Database migrations
│   └── repositories/          ← Repository pattern
├── middleware/                ← Express middleware
├── routes/                    ← HTTP route handlers
├── services/                  ← Business logic layer
└── utils/                     ← Utility functions
```

**Frontend:**
```
src/
├── components/
│   ├── common/                ← Shared components
│   ├── expenses/              ← Expense feature
│   ├── admin/                 ← Admin features
│   └── checklist/             ← Checklist feature
├── hooks/                      ← Shared custom hooks
├── utils/                      ← Utility functions
└── constants/                  ← App constants
```

### OCR System Architecture

**Sandbox (v1.11.0+):**
- **External OCR Service** (192.168.1.195:8000) with LLM enhancement
- **Ollama LLM** (192.168.1.173:11434) - dolphin-llama3
- **Model Training** (192.168.1.197:5001) - v1.2.0 prompts
- **Data Pool Integration** (192.168.1.196:5000) with UTF-8 encoding

**Production:**
- **Tesseract OCR** - Embedded processing
- **No LLM enhancement** - Rule-based inference only

---

## 🔐 Credentials & Access

### Production Environment

**URL**: https://expapp.duckdns.org  
**Containers**: 201 (Backend), 202 (Frontend)  
**Proxmox Host**: 192.168.1.190

⚠️ **Production credentials are private and not documented here for security**

### Sandbox Environment

**URL**: http://192.168.1.144  
**Container**: 203  
**Database**: `expense_app_sandbox`

**ALL sandbox users share password**: `sandbox123`

| Username | Email | Role |
|----------|-------|------|
| admin | admin@example.com | admin |
| accountant | accountant@example.com | accountant |
| coordinator | coordinator@example.com | coordinator |
| salesperson | salesperson@example.com | salesperson |
| developer | developer@example.com | developer |

**Reset Sandbox Passwords:**
```bash
ssh root@192.168.1.190 "pct exec 203 -- bash -c 'cd /opt/trade-show-app/backend && node reset-sandbox-passwords.js'"
```

### Proxmox Access

**Host**: 192.168.1.190  
**User**: root  
**Access**: SSH key authentication

**Common Commands:**
```bash
# List containers
pct list

# Enter container
pct exec 203 -- bash

# Copy file to container
pct push 203 /local/file /remote/path

# Check container status
pct status 203
```

---

## 🚀 Deployment

### Local Development Setup

**Prerequisites:**
- Node.js v18+
- npm v8+
- PostgreSQL 16+

**Quick Start:**
```bash
# Clone repo
git clone https://github.com/sahiwal283/expenseApp.git
cd expenseApp

# Frontend
npm install
npm run dev
# → http://localhost:5173

# Backend (new terminal)
cd backend
npm install
cp env.example .env
# Edit .env with your database credentials
npm run migrate
npm run seed
npm run dev
# → http://localhost:5000/api
```

### Sandbox Deployment (Container 203)

**CRITICAL**: Follow this process EXACTLY to avoid caching issues

**Pre-Deployment Checklist:**
- [ ] All changes on correct branch
- [ ] Version updated in `package.json`
- [ ] Service worker cache names updated
- [ ] Changes committed and pushed to GitHub

**Build Process:**
```bash
# 1. Clean
rm -rf dist/

# 2. Build
npm run build

# 3. Add build ID
BUILD_ID=$(date +%Y%m%d_%H%M%S)
echo "<!-- Build: ${BUILD_ID} -->" >> dist/index.html

# 4. Create tarball
tar -czf frontend-v1.0.X-$(date +%H%M%S).tar.gz -C dist .
```

**Deploy to Sandbox:**
```bash
# 1. Copy to Proxmox
TARFILE=$(ls -t frontend-v1.0.*-*.tar.gz | head -1)
scp "$TARFILE" root@192.168.1.190:/tmp/sandbox-deploy.tar.gz

# 2. Deploy to /var/www/trade-show-app (NOT /var/www/html!)
ssh root@192.168.1.190 "
  pct push 203 /tmp/sandbox-deploy.tar.gz /tmp/sandbox-deploy.tar.gz &&
  pct exec 203 -- bash -c '
    cd /var/www/trade-show-app &&
    rm -rf * &&
    tar -xzf /tmp/sandbox-deploy.tar.gz &&
    chown -R 501:staff /var/www/trade-show-app &&
    systemctl restart nginx &&
    echo \"✓ Deployed\"
  '
"

# 3. Restart NPMplus to clear proxy cache
ssh root@192.168.1.190 "pct stop 104 && sleep 3 && pct start 104 && echo '✓ NPMplus restarted'"
```

**Verify Deployment:**
```bash
ssh root@192.168.1.190 "pct exec 203 -- bash -c '
  echo \"=== Service Worker ===\"
  head -3 /var/www/trade-show-app/service-worker.js
  echo
  echo \"=== Build ID ===\"
  grep \"Build:\" /var/www/trade-show-app/index.html
'"
```

**Browser Testing:**
1. Close all browser tabs with sandbox
2. Clear browsing data (cached files, cookies, all time)
3. Restart browser completely
4. Open incognito window
5. Open DevTools → Network tab → Check "Disable cache"
6. Load http://192.168.1.144
7. Verify version in footer matches deployment

### Production Deployment

⚠️ **Production deployment requires explicit user approval - never deploy automatically**

**Pre-Deployment:**
1. Run schema validation (see Critical Information section)
2. Test in sandbox first
3. Get explicit user approval
4. Backup production database

**Deployment Steps:**
1. Deploy backend to Container 201
2. Run database migrations
3. Restart backend service
4. Deploy frontend to Container 202
5. Restart NPMplus proxy (Container 104)
6. Verify deployment

**Post-Deployment:**
1. Test critical functionality
2. Monitor logs for errors
3. Verify version numbers
4. Check service status

---

## 🔧 Development Workflows

### Version Control

**Branch Strategy:**
- `main` - Production code (protected)
- `v1.X.X` - Feature branches
- `hotfix/*` - Emergency fixes

**Commit Message Format:**
```
type(scope): description

[optional body]

[optional footer]
```

**Types:**
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation
- `refactor` - Code refactoring
- `test` - Tests
- `chore` - Maintenance

### Testing Checklist

**Before Committing:**
- [ ] Code compiles without errors
- [ ] Linter passes
- [ ] TypeScript types are correct
- [ ] No `any` types used
- [ ] Tests pass (if applicable)

**Before Deployment:**
- [ ] Tested in sandbox
- [ ] Schema validation passed
- [ ] Version numbers updated
- [ ] Service worker cache updated
- [ ] Database migrations tested

### Code Quality Standards

**TypeScript:**
- No `any` types
- Proper interfaces for all data structures
- Type safety throughout

**React:**
- Use custom hooks for shared logic
- Component composition over inheritance
- Feature-based organization

**Backend:**
- Repository pattern for data access
- Service layer for business logic
- Thin controllers (routes)

---

## 🐛 Known Issues & Solutions

### Critical Issues (RESOLVED)

**1. Database Migration System (RESOLVED)**
- **Issue**: Migrations not running automatically
- **Solution**: Manual migration process established
- **Status**: ✅ Resolved

**2. Expenses Not Assigning Entity (RESOLVED)**
- **Issue**: Expenses not getting Zoho entity assigned
- **Solution**: Fixed entity assignment logic
- **Status**: ✅ Resolved

**3. Caching Problems (RESOLVED)**
- **Issue**: Service worker caching old versions
- **Solution**: Cache busting procedure established
- **Status**: ✅ Resolved

**4. Auto-Logout Not Working (RESOLVED)**
- **Issue**: Users not logged out after inactivity
- **Solution**: Fixed session timeout logic
- **Status**: ✅ Resolved

### Common Issues

**1. "npm: command not found"**
- **Solution**: Install Node.js v18+ and npm

**2. Port Already in Use**
- **Solution**: Kill process using port or change port in config

**3. Database Connection Failed**
- **Solution**: Check database credentials and connection string

**4. Sandbox Not Updating After Deployment**
- **Solution**: Clear browser cache, restart NPMplus, use incognito mode

**5. OCR Not Working / Low Accuracy**
- **Solution**: Check OCR service status, verify image quality, check logs

---

## ⚠️ Common Pitfalls & Errors to Avoid

### 🚨 CRITICAL PITFALLS (Will Break Production!)

**1. Database Schema Constraints Not Updated**
- **Pitfall:** Deploying code with new enum values without updating CHECK constraints
- **Error:** `"new row violates check constraint"` or `"Failed to update entity"`
- **Example:** Adding `'needs further review'` status without updating `expenses_status_check`
- **Fix:** ALWAYS update schema.sql and create migration BEFORE deploying code
- **Prevention:** Run schema validation before every deployment

**2. Frontend Deployment Directory Wrong**
- **Pitfall:** Deploying to `/var/www/html` or `/var/www/trade-show-app/` instead of `/var/www/trade-show-app/current/`
- **Error:** 404 Not Found errors, frontend doesn't load
- **Fix:** Always deploy to `/var/www/trade-show-app/current/` (production) or `/var/www/trade-show-app/` (sandbox)
- **Prevention:** Check Nginx root path before deploying

**3. Backend Service Path Case Sensitivity**
- **Pitfall:** Using `expenseapp` instead of `expenseApp` (capital 'A')
- **Error:** Service won't start, 500 errors
- **Fix:** Always use `/opt/trade-show-app/backend` (exact case)
- **Prevention:** Copy path from service file, never type manually

**4. Forgetting to Restart NPMplus Proxy**
- **Pitfall:** Deploying frontend but not restarting Container 104
- **Error:** Old version cached, users see stale frontend
- **Fix:** Always run `pct stop 104 && sleep 3 && pct start 104` after frontend deployment
- **Prevention:** Include in deployment checklist

**5. Not Updating Service Worker Cache Names**
- **Pitfall:** Changing version in package.json but not in service-worker.js
- **Error:** Service worker doesn't update, users see old version
- **Fix:** Update ALL version references in service-worker.js (CACHE_NAME, STATIC_CACHE, console logs)
- **Prevention:** Version update checklist

**6. Deploying to Production Without Approval**
- **Pitfall:** Accidentally deploying to Container 201 instead of 203
- **Error:** Breaks production for real users
- **Fix:** ALWAYS ask for explicit confirmation before production deployment
- **Prevention:** Default to sandbox, require explicit "deploy to production" command

### 🐛 Common Bugs & Errors

**1. Timezone Bug with Date Handling**
- **Bug:** Expenses submitted at 9:35 PM showed next day's date
- **Cause:** Using `new Date(dateString)` treats YYYY-MM-DD as UTC midnight
- **Error:** Date shifts backward by one day in timezones behind UTC
- **Fix:** Always use `dateUtils.parseLocalDate()` instead of `new Date()`
- **Prevention:** Never use `new Date()` for date-only strings, always use dateUtils

**2. Offline Notification Spam**
- **Bug:** Multiple "Working Offline" notifications stacking up, not dismissing
- **Cause:** Network detection too aggressive, no notification ID tracking
- **Fix:** Implemented notification ID tracking, less aggressive detection
- **Prevention:** Always track notification IDs to prevent duplicates

**3. Session Timeout Warning Not Appearing**
- **Bug:** Users logged out without seeing 5-minute warning modal
- **Cause:** Token refresh URL incorrect, session/API coordination issues
- **Fix:** Corrected token refresh URL, improved coordination
- **Prevention:** Test session timeout flow in development

**4. Auto-Status Logic Not Reliable**
- **Bug:** Expenses stuck in "needs further review" despite corrective actions
- **Cause:** Complex logic with edge cases, regression detection issues
- **Fix:** Rewrote with 3 clear rules (regression → approval → no-op)
- **Prevention:** Keep status logic simple and test all edge cases

**5. Pending Tasks Navigation 404**
- **Bug:** "Push to Zoho" button in dashboard led to 404 (old approvals page)
- **Cause:** Navigation links not updated after page merge
- **Fix:** Updated all task links to point to unified expenses page
- **Prevention:** Update all navigation links when restructuring pages

**6. Phone Camera Images Rejected**
- **Bug:** HEIC, HEIF, WebP images from phones rejected
- **Cause:** MIME type validation too strict
- **Fix:** Accept any `image/*` MIME type
- **Prevention:** Use flexible MIME type checking for image uploads

**7. Missing useEffect Import**
- **Bug:** Production-breaking bug - useEffect not imported
- **Cause:** Missing import statement
- **Fix:** Added `import { useEffect } from 'react'`
- **Prevention:** Always check imports, use linter

**8. Double `/api/api/` URL Path**
- **Bug:** Frontend 404 on corrections endpoint
- **Cause:** API client adding `/api/` prefix to already-prefixed URLs
- **Fix:** Fixed URL construction to prevent double prefix
- **Prevention:** Check API client URL construction logic

**9. Data Pool 422 Validation Error**
- **Bug:** Data Pool rejecting correction submissions
- **Cause:** `corrected_fields` not nested in request body
- **Fix:** Nested corrected_fields properly in request
- **Prevention:** Match Data Pool API schema exactly

**10. Data Pool UTF-8 Encoding Errors**
- **Bug:** Unicode characters (™, ®, ©) causing database errors
- **Cause:** Database not created with UTF-8 encoding
- **Fix:** Recreated database with UTF-8 encoding
- **Prevention:** Always use UTF-8 encoding for databases

**11. Nginx 404 on Frontend**
- **Bug:** Frontend files not loading after deployment
- **Cause:** Nginx root directive path incorrect
- **Fix:** Corrected root directive to match deployment path
- **Prevention:** Verify Nginx config matches deployment structure

**12. 504 Gateway Timeout During OCR**
- **Bug:** OCR processing taking too long, causing timeouts
- **Cause:** Timeouts too short for LLM enhancement (95-115s)
- **Fix:** Increased timeouts to 180s across all layers (Nginx, Backend, OCR)
- **Prevention:** Set appropriate timeouts for long-running operations

**13. Random LLM Sampling Slow**
- **Bug:** High-confidence receipts still triggering slow LLM processing
- **Cause:** 10% random sampling on all receipts
- **Fix:** Disabled sampling on high-confidence receipts
- **Prevention:** Only use LLM for low-confidence receipts

**14. Navigation Failures**
- **Bug:** Navigation not working reliably
- **Cause:** Using URL hash for navigation state
- **Fix:** Use sessionStorage instead of URL hash
- **Prevention:** Prefer sessionStorage/localStorage over URL state

**15. Entity Change Warning Not Appearing**
- **Bug:** Warning dialog not showing when changing entity in modal
- **Cause:** onChange event not firing properly
- **Status:** Under investigation
- **Workaround:** User can still change entities, just without warning
- **Prevention:** Test modal interactions thoroughly

**16. Zoho Duplicate Prevention Issues**
- **Bug:** In-memory Set prevents re-push of deleted expenses
- **Cause:** Set persists across requests but not backend restarts
- **Status:** Needs database-based duplicate check
- **Workaround:** Restart backend to clear Set
- **Prevention:** Use database-based duplicate tracking

**17. OCR Service 500 Errors**
- **Bug:** OCR service returning 500 errors
- **Cause:** Tesseract language code wrong ("en" instead of "eng")
- **Fix:** Changed to "eng" language code
- **Prevention:** Verify Tesseract language codes

**18. Event Days Display Negative**
- **Bug:** Events in progress showing negative days
- **Cause:** Date calculation logic issue
- **Fix:** Show "Today" instead of negative days
- **Prevention:** Handle edge cases in date calculations

**19. Entity Re-assignment Not Clearing Zoho ID**
- **Bug:** Can't re-push expense after changing entity
- **Cause:** `zoho_expense_id` not cleared on entity change
- **Fix:** Clear `zoho_expense_id` when entity changes
- **Prevention:** Always clear related IDs when changing relationships

**20. Double OCR Processing**
- **Bug:** Receipt processed twice (once on upload, once on save)
- **Cause:** OCR triggered both in upload handler and expense creation
- **Fix:** Store receipt URL from OCR, skip processing if already done
- **Prevention:** Track OCR processing state to prevent duplicates

### 💡 Development Pitfalls

**1. Using `any` Types in TypeScript**
- **Pitfall:** Using `any` to bypass type checking
- **Problem:** Loses type safety, harder to catch errors
- **Fix:** Always define proper interfaces
- **Prevention:** Enable strict TypeScript, no `any` policy

**2. Not Testing in Sandbox First**
- **Pitfall:** Deploying directly to production
- **Problem:** Breaks production for real users
- **Fix:** ALWAYS test in sandbox first
- **Prevention:** Make sandbox testing mandatory

**3. Not Updating Version Numbers**
- **Pitfall:** Forgetting to increment version in package.json and service-worker.js
- **Problem:** Cache issues, users see old version
- **Fix:** Always update all version references
- **Prevention:** Version update checklist

**4. Creating Too Many Branches**
- **Pitfall:** Creating new branch for each small change
- **Problem:** Clutters repo, hard to track
- **Fix:** One branch per development session, many commits
- **Prevention:** Follow branch management strategy

**5. Not Committing Changes**
- **Pitfall:** Leaving uncommitted changes before deployment
- **Problem:** Deployment readiness unclear, risk of losing work
- **Fix:** Always commit before deployment
- **Prevention:** Pre-deployment checklist

**6. Not Restarting Services After Deployment**
- **Pitfall:** Deploying code but not restarting backend service
- **Problem:** Old code still running, changes not applied
- **Fix:** Always restart services after deployment
- **Prevention:** Include in deployment checklist

**7. Not Validating Schema Before Deployment**
- **Pitfall:** Deploying code without checking database schema
- **Problem:** Runtime errors, production failures
- **Fix:** ALWAYS run schema validation first
- **Prevention:** Make schema validation mandatory

**8. Mixing Sandbox and Production Credentials**
- **Pitfall:** Trying to "fix" separate credentials
- **Problem:** Breaks data isolation, security risk
- **Fix:** Keep credentials separate (intentional design)
- **Prevention:** Understand why credentials are separate

**9. Not Documenting Changes**
- **Pitfall:** Making changes without updating documentation
- **Problem:** Future AI agents don't know what changed
- **Fix:** Always update MASTER_GUIDE.md
- **Prevention:** Documentation update checklist

**10. Not Testing Edge Cases**
- **Pitfall:** Only testing happy path
- **Problem:** Bugs in edge cases break production
- **Fix:** Test all edge cases, especially date/timezone issues
- **Prevention:** Comprehensive testing checklist

### 🔧 Code-Specific Pitfalls

**1. Date Handling Without dateUtils**
- **Pitfall:** Using `new Date(dateString)` for YYYY-MM-DD strings
- **Problem:** Timezone conversion bugs
- **Fix:** Always use `dateUtils.parseLocalDate()`
- **Example:**
  ```typescript
  // ❌ BAD
  const date = new Date("2026-02-07");
  
  // ✅ GOOD
  import { parseLocalDate } from '@/utils/dateUtils';
  const date = parseLocalDate("2026-02-07");
  ```

**2. Not Using Repository Pattern**
- **Pitfall:** Writing SQL queries directly in routes
- **Problem:** Hard to test, violates separation of concerns
- **Fix:** Use repositories for all database access
- **Prevention:** Follow architecture pattern

**3. Not Extracting Helper Functions**
- **Pitfall:** Keeping large functions in service files
- **Problem:** Hard to test, hard to maintain
- **Fix:** Extract to `.helpers.ts` files
- **Prevention:** Extract functions >20 lines used in multiple places

**4. Not Using Zod Validation**
- **Pitfall:** Trusting client input without validation
- **Problem:** Bad data reaches database, security issues
- **Fix:** Always validate input with Zod schemas
- **Prevention:** Validation checklist

**5. Not Handling Errors Properly**
- **Pitfall:** Swallowing errors or not logging them
- **Problem:** Hard to debug production issues
- **Fix:** Always log errors, return proper error responses
- **Prevention:** Error handling standards

---

## 🛡️ Prevention Checklist

**Before Every Deployment:**
- [ ] Schema validation passed
- [ ] Version numbers updated (package.json + service-worker.js)
- [ ] Tested in sandbox first
- [ ] All changes committed
- [ ] Service worker cache names updated
- [ ] NPMplus restart included in deployment script
- [ ] Correct deployment paths verified
- [ ] Services restart included
- [ ] Documentation updated

**Before Every Code Change:**
- [ ] Check for existing helpers/functions before creating new ones
- [ ] Use dateUtils for all date handling
- [ ] Use TypeScript interfaces (no `any` types)
- [ ] Add JSDoc comments for public methods
- [ ] Test edge cases (timezones, null values, empty strings)
- [ ] Validate input with Zod schemas
- [ ] Follow repository pattern (backend)
- [ ] Follow component modularization (frontend)

**Before Every Database Change:**
- [ ] Update schema.sql
- [ ] Create migration file
- [ ] Test migration in sandbox
- [ ] Update CHECK constraints if adding enum values
- [ ] Verify foreign key constraints
- [ ] Run schema validation after migration

---

## 📡 API Reference

### Core Endpoints

**Authentication:**
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `POST /api/auth/logout` - User logout

**Expenses:**
- `GET /api/expenses` - Get expenses (with filters)
- `POST /api/expenses` - Create expense
- `PUT /api/expenses/:id` - Update expense
- `PUT /api/expenses/:id/receipt` - Update expense receipt (v1.28.9)
- `DELETE /api/expenses/:id` - Delete expense

**Events:**
- `GET /api/events` - Get events
- `POST /api/events` - Create event
- `PUT /api/events/:id` - Update event

**Checklist:**
- `GET /api/checklist/:eventId` - Get checklist for event
- `POST /api/checklist` - Create checklist
- `PUT /api/checklist/:id` - Update checklist
- `POST /api/checklist/:id/flights` - Add flight
- `POST /api/checklist/:id/hotels` - Add hotel
- `POST /api/checklist/:id/car-rentals` - Add car rental
- `GET /api/checklist/user/:eventId` - Get user checklist for event (v1.28.3)
- `POST /api/checklist/user/:eventId/items` - Create user checklist item (v1.28.3)
- `PUT /api/checklist/user/:eventId/items/:id` - Update user checklist item (v1.28.3)
- `DELETE /api/checklist/user/:eventId/items/:id` - Delete user checklist item (v1.28.3)

**OCR:**
- `POST /api/ocr/v2/process` - Process receipt with OCR
- `POST /api/ocr/v2/corrections` - Submit user corrections

**Zoho:**
- `POST /api/zoho/push/:expenseId` - Push expense to Zoho
- `GET /api/zoho/accounts` - Get Zoho accounts

### API Authentication

All endpoints (except login/register) require authentication via JWT token in `Authorization` header:
```
Authorization: Bearer <token>
```

---

## 📚 Historical Sessions & Lessons Learned

### Session: November 10, 2025 - Full Codebase Refactor (v1.28.0)

**Status:** ✅ Refactor Complete - Architecture Modernized

**Objectives:**
1. Split files >500 lines into smaller, focused modules
2. Separate concerns (controllers, services, repositories)
3. Extract reusable patterns (hooks, utilities, shared components)
4. Remove legacy artifacts
5. Improve code reusability

**Files Refactored:**

**Backend:**
- `devDashboard.ts`: 1,058 lines → Split into service layer
- `expenses.ts`: 980 lines → Split into ExpenseService + ExpenseRepository
- `checklist.ts`: 596 lines → Maintained with Zod validation
- `ocrV2.ts`: 437 lines → Maintained with OCR service architecture

**Frontend:**
- `EventSetup.tsx`: 1,062 lines → Split into hooks + sub-components
- `ExpenseSubmission.tsx`: 915 lines → Split into ExpenseSubmission/ + hooks/
- `AdminSettings.tsx`: 745 lines → Split into AdminSettings/ sub-components
- `ReceiptUpload.tsx`: 719 lines → Split into ReceiptUpload/ sub-components
- `BoothSection.tsx`: 699 lines → Split into BoothSection/ sub-components
- `UserManagement.tsx`: 641 lines → Split into UserManagement/ sub-components

**Architecture Changes:**
- ✅ Repository pattern implemented (Backend)
- ✅ Service layer created (Backend)
- ✅ Component modularization (Frontend)
- ✅ Custom hooks extracted (Frontend)
- ✅ Type safety improved (Full codebase)

**Complexity Reduction Strategy:**

**What Worked:**
- ✅ **Helper Function Extraction** - Extracted 13 helper functions from DevDashboardService (368 lines → cleaner service)
- ✅ **Utility File Organization** - Frontend utilities organized by domain (date, event, filter, OCR)
- ✅ **Single Responsibility** - Each helper has one clear purpose
- ✅ **Reusability** - Helpers can be used across multiple services/components
- ✅ **Testability** - Pure functions easier to test independently

**Helper Functions Created:**

**Backend (`DevDashboardService.helpers.ts`):**
- 6 alert functions: `checkErrorRateAlert`, `checkSlowResponseAlert`, `checkStaleSessionsAlert`, `checkEndpointFailureAlert`, `checkTrafficSpikeAlert`, `checkAuthFailuresAlert`
- 7 utility functions: `parseTimeRange`, `getSystemMemoryMetrics`, `getSystemCPUMetrics`, `formatSessionDuration`, `mapEndpointToPage`, `checkOCRServiceHealth`, `calculateOCRCosts`

**Frontend (`src/utils/`):**
- `dateUtils.ts` - Date parsing/formatting (prevents timezone bugs)
- `eventUtils.ts` - Event filtering (removes old events from dropdowns)
- `filterUtils.ts` - Generic filtering logic
- `ocrUtils.ts` - OCR correction tracking
- Plus: `apiClient.ts`, `sessionManager.ts`, `expenseUtils.ts`, `reportUtils.ts`, `checklistUtils.ts`

**Lessons Learned:**
- **Extract when:** Function used in multiple places, >20 lines, complex logic, pure function
- **Don't extract when:** Used once, tightly coupled, <5 lines, needs component state
- **File naming:** Use `.helpers.ts` suffix for backend, domain-based names for frontend
- **Documentation:** Always add JSDoc comments with `@param` and `@returns`

**Reference:** See `docs/HELPER_FUNCTIONS.md` for complete helper function reference

**For Future Development:**
- Backend: Create repository → service → route → helpers (if needed)
- Frontend: Create feature directory → extract hooks → use shared components → use utilities
- Always: Check for existing helpers before creating new ones, use TypeScript interfaces, add JSDoc comments

### Session: November 10, 2025 - Production Login Failure Incident

**Status:** ✅ RESOLVED - Production Login Restored

**Issue:** All users unable to log in to production - "Invalid username or password" error

**Root Causes:**
1. **Database Schema Mismatch** - Code referenced `audit_log` but database had `audit_logs`
2. **Missing Database Columns** - `audit_logs` table missing 7 required columns
3. **Network-Level Routing Override** - iptables DNAT rule redirecting traffic to sandbox
4. **Stale Backend Process** - Backend service running old code

**Resolution:**
1. Fixed table name mismatch (`audit_log` → `audit_logs`)
2. Added missing columns to `audit_logs` table
3. Removed malicious NAT rule
4. Restarted backend service

**Lessons Learned:**
- Network-level rules override application config
- Schema validation scripts created
- Always restart services after deployments
- Multiple symptoms can have single root cause
- **Always validate schema before deployment**

### Session: November 5, 2025 - Event Checklist System (v1.27.14)

**Status:** ✅ Complete - Ready for Production Testing

**What Was Built:**
- Complete trade show logistics management system
- Flights, hotels, car rentals, booth, shipping tracking
- Custom checklist items and templates
- Receipt integration (auto-creates expenses)
- Role-based access control

**Database:**
- 7 new tables with proper foreign keys and indexes
- Migration 017_add_event_checklist.sql

**API:**
- 30+ new endpoints under `/api/checklist`
- Full CRUD operations
- Zod validation for input

**Lessons Learned:**
- Large features need comprehensive planning
- Database migrations must be tested thoroughly
- Receipt integration requires careful expense creation logic
- Templates system provides good UX

**Status:** Complete in sandbox, awaiting production deployment decision

---

## 🔍 Troubleshooting

### Common Problems

**1. "npm: command not found"**
```bash
# Install Node.js v18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**2. Port Already in Use**
```bash
# Find process using port
lsof -i :5000
# Kill process
kill -9 <PID>
```

**3. Database Connection Failed**
- Check database credentials in `.env`
- Verify PostgreSQL is running
- Check connection string format

**4. Sandbox Not Updating After Deployment**
- Clear browser cache completely
- Restart NPMplus: `pct stop 104 && pct start 104`
- Test in incognito mode
- Check service worker version

**5. OCR Not Working**
- Check OCR service status
- Verify image quality
- Check backend logs: `journalctl -u trade-show-app-backend -f`
- Verify OCR service endpoint is accessible

**6. Service Worker Issues**
- Clear browser cache
- Unregister service worker in DevTools
- Hard refresh (Ctrl+Shift+R)
- Check service worker version matches deployment

### Debugging Commands

**Check Backend Logs:**
```bash
ssh root@192.168.1.190 "pct exec 201 -- journalctl -u trade-show-app-backend -f"
```

**Check Frontend Files:**
```bash
ssh root@192.168.1.190 "pct exec 202 -- ls -la /var/www/trade-show-app"
```

**Check Database:**
```bash
ssh root@192.168.1.190 "pct exec 201 -- su - postgres -c 'psql -d expense_app_production'"
```

**Check Service Status:**
```bash
ssh root@192.168.1.190 "pct exec 201 -- systemctl status trade-show-app-backend"
```

---

## 📚 Additional Resources

### External Documentation
- **React**: https://react.dev/
- **TypeScript**: https://www.typescriptlang.org/
- **PostgreSQL**: https://www.postgresql.org/docs/
- **Express**: https://expressjs.com/
- **Zoho Books API**: https://www.zoho.com/books/api/v3/

### Project-Specific Documentation
- **Agent Contract:** `docs/AGENT_CONTRACT.md` - **READ THIS FIRST** - Defines all agent roles, permissions, scope, and responsibilities
- **Environment Separation:** `docs/ENVIRONMENT_SEPARATION.md` - **CRITICAL** - Prevents cross-environment misconfigurations, includes build-time validation
- Database schema: `backend/src/database/schema.sql`
- Deployment scripts: `deployment/` folder
- Nginx config: `deployment/nginx/expenseapp.conf`
- Repository pattern: `backend/src/database/repositories/README.md`
- OCR system: `backend/src/services/ocr/README.md`
- Helper functions: `docs/HELPER_FUNCTIONS.md` - Complete reference for all helper functions
- Frontend utilities: `src/utils/README.md` - Frontend utility functions guide
- Pre-production checklist: `PRE_PRODUCTION_CHECKLIST.md` - Production deployment readiness

---

## 🤝 AI Assistant Guidelines

**When working on this project:**

1. **Read this file first** - It contains all context you need
2. **Update this file** with new issues, solutions, and session summaries
3. **Follow the deployment checklist** religiously
4. **Always update version numbers** with every change
5. **Test in sandbox first** - never deploy directly to production
6. **Commit atomically** - one feature/fix per commit
7. **Document breaking changes** clearly
8. **Ask for approval** before:
   - Merging to main
   - Deploying to production
   - Making database schema changes
   - Changing authentication/security logic
9. **Be cautious** with:
   - Sandbox credentials (never change them)
   - Production access (require explicit permission)
   - Database migrations (test locally first)
10. **Communicate clearly** - explain what you're doing and why

**Code Quality Rules:**
- ❌ Never use `any` types in TypeScript
- ✅ Always define proper interfaces
- ✅ Follow repository pattern (backend)
- ✅ Use component modularization (frontend)
- ✅ Extract reusable hooks
- ✅ Add JSDoc comments for public methods

**When Documenting:**
- ✅ Document what worked and why
- ✅ Document what didn't work and why
- ✅ Document failures and lessons learned
- ✅ Document new features being added
- ✅ Document plans and roadmap
- ✅ Document anything that needs to be addressed
- ✅ Keep this file comprehensive and up-to-date

---

**END OF MASTER GUIDE**

For updates to this document, add new sections under appropriate headings and update the "Last Updated" date at the top.
