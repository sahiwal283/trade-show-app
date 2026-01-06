# Pre-Production Deployment Checklist
**Date**: October 30, 2025  
**Target**: Container 201 (Production Backend) & Container 202 (Production Frontend)  
**Current Production**: Frontend v1.4.13, Backend v1.5.1  
**Proposed Deployment**: Frontend v1.27.6, Backend v1.19.6  

⚠️ **CRITICAL**: Production has LIVE USERS and REAL FINANCIAL DATA!

---

## 📋 PRE-DEPLOYMENT CHECKLIST

### ✅ 1. VERSION VERIFICATION
- [x] **Frontend Version**: v1.27.6 (`package.json`)
- [x] **Backend Version**: v1.19.6 (`backend/package.json`)
- [x] **Service Worker**: v1.27.6 (`public/service-worker.js`)
- [x] **Versions Match**: All three versions are in sync

### ⚠️ 2. GIT STATUS
- [ ] **Uncommitted Changes**: 21 modified files + 1 new file
  - Modified: backend/package.json, backend routes, frontend components
  - New: src/components/checklist/ChecklistReceiptUpload.tsx
- [ ] **Git Branch**: Currently on `v1.6.0`
- [ ] **Action Required**: Commit all changes before deployment
- [ ] **Tag Required**: Create production tag (e.g., `v1.27.6-production`)

### ✅ 3. DATABASE SCHEMA VALIDATION (NEW - v1.27.15)
**CRITICAL**: Run schema validation before any deployment

```bash
# Validate production schema against migrations
./scripts/validate-schema.sh production
```

**Expected Exit Codes:**
- `0` = ✅ Schema matches migrations (safe to deploy)
- `1` = ❌ Schema mismatches found (DEPLOYMENT BLOCKED)
- `2` = 🔧 Configuration/connection error

**Action Required**:
- [ ] Run schema validation script
- [ ] Review validation report: `schema-validation-production-*.txt`
- [ ] Fix any schema mismatches before proceeding
- [ ] **NEVER deploy if validation fails**

📖 **Documentation**: `docs/SCHEMA_VALIDATION.md`

### ✅ 4. DATABASE MIGRATIONS
**New Migrations Since Production (v1.5.1):**
1. `016_add_show_and_travel_dates.sql` ✅
2. `017_add_event_checklist.sql` ✅ **CRITICAL - Checklist Feature**
3. `018_add_custom_checklist_items.sql` ✅ **CRITICAL - Checklist Feature**
4. `019_add_checklist_templates.sql` ✅ **CRITICAL - Checklist Feature**
5. `020_add_metadata_to_api_requests.sql` ✅ **CRITICAL - OCR Tracking**
6. `021_add_booth_map.sql` ✅ **Checklist Feature**
7. `022_add_car_rental_assignment.sql` ✅ **Checklist Feature**

**Action Required**: 
- [ ] Validate schema first (see section 3 above)
- [ ] Run all 7 migrations on production database
- [ ] Verify migrations are reversible (if needed)
- [ ] Test migrations on sandbox first (already done)
- [ ] Re-validate schema after migrations

### ✅ 4. MAJOR FEATURES ADDED SINCE PRODUCTION
**Trade Show Checklist Feature** (NEW - Not in Production):
- ✅ Flights tracking per participant
- ✅ Hotel bookings per participant
- ✅ Car rental management (individual/group)
- ✅ Booth ordering and shipping
- ✅ Electricity ordering
- ✅ Booth map upload
- ✅ Custom checklist items
- ✅ Checklist templates
- ✅ Receipt upload integration
- ✅ Event details modal display
- ✅ Role-based access (coordinators, salespersons)

**OCR Improvements**:
- ✅ Google Document AI integration ($1.50/1,000 receipts)
- ✅ Receipt URL from OCR (no double processing)
- ✅ OCR metadata tracking
- ✅ Dev dashboard OCR tab with cost tracking
- ✅ 4-8 second processing time
- ✅ 95%+ confidence on clean receipts

**UX Improvements**:
- ✅ Receipt saved notifications
- ✅ Receipt view indicators
- ✅ Event name badges on expenses
- ✅ Coordinator role enhancements
- ✅ Auto-entity assignment based on card

### ⚠️ 5. BREAKING CHANGES / RISKS
**High Risk Areas**:
- [ ] **New OCR Endpoint**: Uses `/ocr/v2/process` - production OCR service must be configured
- [ ] **Checklist Feature**: Entirely new feature - needs thorough testing
- [ ] **Database Schema Changes**: 7 new tables/columns
- [ ] **API Changes**: New endpoints for checklist

**Medium Risk Areas**:
- [ ] **Receipt Upload Flow**: Changed to prevent double OCR processing
- [ ] **Card Dropdown**: Changed from text input to dropdown in checklist
- [ ] **FormData Handling**: Booth map upload uses direct fetch

**Low Risk Areas**:
- [ ] **Dev Dashboard Updates**: Only affects admin/developer view
- [ ] **Visual Indicators**: UI-only changes

### ⚠️ 6. ENVIRONMENT CONFIGURATION
**Production OCR Service**:
- [ ] **OCR Service Running**: Container 204 (192.168.1.190:8000) - SANDBOX ONLY!
- [ ] **Production OCR**: Does production have OCR service? Or uses embedded Tesseract?
- [ ] **OCR_SERVICE_URL**: Must be configured in production .env
- [ ] **Google Document AI**: Are credentials configured for production?

**CRITICAL QUESTION**: What OCR service does production use?
- Option 1: Use sandbox OCR service (192.168.1.190:8000) - NOT RECOMMENDED
- Option 2: Deploy OCR service to production container
- Option 3: Use embedded Tesseract (existing production setup)

**API Endpoints**:
- [ ] **VITE_API_BASE_URL**: Must be set for production build
- [ ] **Production URL**: https://expapp.duckdns.org/api
- [ ] **CORS Configuration**: Verify production domains are whitelisted

### ✅ 7. DEPLOYMENT ARTIFACTS
**Frontend**:
- [ ] Build with production mode: `npm run build:production`
- [ ] Verify `.env.production` is used (not .env.development)
- [ ] Service worker version matches
- [ ] Build creates unique timestamp

**Backend**:
- [ ] TypeScript compilation clean: `npm run build`
- [ ] Zero linter errors
- [ ] All dependencies installed
- [ ] Python OCR scripts copied (if using embedded OCR)

### ⚠️ 8. TESTING REQUIREMENTS
**MUST TEST IN SANDBOX BEFORE PRODUCTION**:
- [ ] **Checklist Feature**:
  - [ ] Create new event with checklist
  - [ ] Add flights for participants
  - [ ] Add hotels for participants
  - [ ] Add car rentals (individual and group)
  - [ ] Upload booth map
  - [ ] Upload receipts for each section
  - [ ] View checklist in event details modal
  - [ ] Test as coordinator role
  - [ ] Test as salesperson role
  
- [ ] **Receipt Upload**:
  - [ ] Upload receipt with OCR
  - [ ] Verify no double processing
  - [ ] Confirm receipt saves correctly
  - [ ] Check receipt view indicators
  - [ ] Verify success/failure notifications
  
- [ ] **Expense Workflow**:
  - [ ] Create expense
  - [ ] Submit for approval
  - [ ] Approve expense
  - [ ] Assign to Zoho entity
  - [ ] Reimburse expense
  
- [ ] **OCR Service**:
  - [ ] Verify OCR processes in 4-8 seconds
  - [ ] Check OCR accuracy
  - [ ] Verify fallback to Tesseract works
  - [ ] Test dev dashboard OCR metrics

### ⚠️ 9. ROLLBACK PLAN
**If Deployment Fails**:
```bash
# Rollback Backend (Container 201)
ssh root@192.168.1.190 'pct exec 201 -- bash -c "
  cd /opt/trade-show-app &&
  git checkout v1.5.1-production-tag &&
  cd backend &&
  npm install &&
  npm run build &&
  systemctl restart trade-show-app-backend
"'

# Rollback Frontend (Container 202)
# Restore from last production backup archive

# Rollback Database
# Run reverse migrations (if needed)
```

**Database Rollback**:
- [ ] Document how to reverse migrations
- [ ] Test rollback on sandbox first
- [ ] Backup production database before deployment

### ✅ 10. BACKUP VERIFICATION
**Before Deployment**:
- [ ] **Database Backup**: Verify recent backup exists
- [ ] **Code Backup**: Create git tag for current production
- [ ] **Frontend Archive**: Save current production frontend build
- [ ] **Backend Archive**: Save current production backend build

### ⚠️ 11. DEPLOYMENT SEQUENCE
**Recommended Order**:
1. [ ] **Git Commit & Tag**: Commit all changes, create production tag
2. [ ] **Database Backup**: Full production database backup
3. [ ] **Run Migrations**: Execute all 7 migrations on production
4. [ ] **Deploy Backend**: Build and restart backend service
5. [ ] **Deploy Frontend**: Build, upload, restart nginx
6. [ ] **Clear Caches**: Restart NPMplus proxy (CRITICAL!)
7. [ ] **Health Check**: Verify /api/health endpoint
8. [ ] **Smoke Test**: Test critical user flows

### ⚠️ 12. MONITORING PLAN
**Post-Deployment Monitoring** (First 24 Hours):
- [ ] Check backend logs every hour
- [ ] Monitor error rates in dev dashboard
- [ ] Watch for OCR failures
- [ ] Monitor database performance
- [ ] Check user reports/support tickets
- [ ] Verify Zoho integration still works

---

## 🚨 CRITICAL ISSUES TO RESOLVE

### Issue #1: OCR Service Configuration
**Problem**: Production doesn't have external OCR service (Container 204 is sandbox-only)

**Options**:
1. **Use Embedded Tesseract** (SAFEST):
   - Production already has this
   - No new infrastructure
   - Slower but reliable
   - **Recommendation**: Use this for initial production deployment

2. **Deploy External OCR Service**:
   - Requires new container setup
   - Google Document AI credentials
   - More complex deployment
   - **Recommendation**: Phase 2 enhancement

**Action Required**: 
- [ ] Decide which OCR method to use for production
- [ ] Configure backend accordingly
- [ ] Update env variables

### Issue #2: Uncommitted Changes
**Problem**: 21 files modified, 1 new file, all uncommitted

**Action Required**:
- [ ] Review all changes
- [ ] Commit with descriptive message
- [ ] Create production tag
- [ ] Push to GitHub

### Issue #3: Checklist Feature - New to Production
**Problem**: Major new feature, not tested with production data

**Recommendation**: 
- [ ] Deploy to production but mark as "beta"
- [ ] Only enable for specific users/roles initially
- [ ] Monitor closely for issues
- [ ] Have rollback plan ready

---

## ✅ DEPLOYMENT READINESS SCORE

**Overall Score**: 6/10 (NOT READY for immediate production deployment)

**Blockers**:
1. ⚠️ Uncommitted changes (MUST commit)
2. ⚠️ OCR service configuration unclear
3. ⚠️ Database migrations not tested on production
4. ⚠️ Major feature not tested with production scale

**Recommended Actions**:
1. **Commit all changes** to git
2. **Decide on OCR strategy** for production
3. **Test migrations** on production database backup
4. **Run full smoke test** in sandbox
5. **Schedule maintenance window** for deployment
6. **Notify users** of potential downtime
7. **Have rollback plan** tested and ready

---

## 📝 DEPLOYMENT TIMELINE

**Estimated Time**: 2-3 hours

**Breakdown**:
- Database backup: 10 minutes
- Run migrations: 15 minutes
- Backend deployment: 20 minutes
- Frontend deployment: 15 minutes
- Testing & verification: 45 minutes
- Monitoring & adjustments: 60 minutes

**Recommended Window**: Off-peak hours (evening or weekend)

---

## ✅ FINAL CHECKLIST BEFORE DEPLOY

- [ ] All code committed and pushed
- [ ] Production tag created
- [ ] Database backup verified
- [ ] Migrations tested
- [ ] OCR strategy decided
- [ ] Rollback plan documented and tested
- [ ] Users notified (if needed)
- [ ] Team available for support
- [ ] Monitoring tools ready

**ONLY PROCEED IF ALL ITEMS CHECKED! ✅**

---

## 📞 SUPPORT CONTACTS

If issues arise during deployment:
- **Backend Issues**: Check logs, verify migrations
- **Frontend Issues**: Check nginx, clear caches
- **OCR Issues**: Fallback to Tesseract
- **Database Issues**: Be ready to rollback

**Emergency Rollback**: Use commands from Section 9 above

