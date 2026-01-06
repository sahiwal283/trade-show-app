# Production Migration Guide - v1.18.0

**Version**: v1.18.0 (Frontend) / v1.16.0 (Backend)  
**Date**: October 27, 2025  
**Branch**: `v1.6.0`  
**Status**: ✅ Ready for Production Deployment

---

## 📋 Overview

This guide provides step-by-step instructions for deploying v1.18.0 to production. This release is a **major refactor** focused on code quality improvements with **zero breaking changes** for end users.

### What Changed
- **Phase 3**: Split 3 monolithic files into 29 focused components
- **Phase 4**: Simplified complex logic with helper functions
- **Phase 5**: Created comprehensive testing documentation

### What Didn't Change
- ❌ No database schema changes
- ❌ No API contract changes
- ❌ No environment variable changes
- ❌ No new dependencies
- ❌ No breaking changes for users

**This is a drop-in replacement for v1.17.3.**

---

## ✅ Pre-Deployment Checklist

### 1. Verify Sandbox Stability

- [ ] v1.18.0 running in sandbox for 24+ hours without issues
- [ ] All smoke tests completed successfully (see TESTING_VALIDATION_GUIDE.md)
- [ ] No console errors in browser
- [ ] Zero linter errors confirmed
- [ ] All critical workflows tested

### 2. Backup Production

```bash
# Backup production database
ssh root@192.168.1.190 "
  pct exec 201 -- bash -c '
    cd /tmp &&
    PGPASSWORD=your_password pg_dump -h localhost -U expense_user -d expense_app_prod > backup_pre_v1.18.0_$(date +%Y%m%d_%H%M%S).sql
  '
"

# Backup production frontend
ssh root@192.168.1.190 "
  pct exec 201 -- bash -c '
    cd /var/www/trade-show-app &&
    tar -czf /tmp/frontend_backup_pre_v1.18.0_$(date +%Y%m%d_%H%M%S).tar.gz current/
  '
"

# Backup production backend
ssh root@192.168.1.190 "
  pct exec 201 -- bash -c '
    cd /opt/trade-show-app/backend &&
    tar -czf /tmp/backend_backup_pre_v1.18.0_$(date +%Y%m%d_%H%M%S).tar.gz dist/
  '
"
```

### 3. Review Migration Risks

**Risk Level**: 🟢 **LOW**

| Risk | Probability | Mitigation |
|------|-------------|------------|
| UI Regression | Low | Extensive sandbox testing completed |
| Performance Impact | Very Low | No architectural changes |
| Data Loss | None | No database changes |
| Downtime | Minimal | Standard deployment process (~2 min) |

---

## 🚀 Deployment Steps

### Step 1: Build Frontend

```bash
cd /Users/sahilkhatri/Projects/Work/brands/Haute/expenseApp

# Ensure you're on the correct branch
git checkout v1.6.0
git pull origin v1.6.0

# Verify version number
grep '"version"' package.json
# Should show: "version": "1.18.0"

# Build frontend
npm run build

# Verify build succeeded
ls -lh dist/index.html
# Should see recent timestamp

# Create deployment archive
BUILD_ID=$(date +%Y%m%d_%H%M%S)
tar -czf frontend-v1.18.0-${BUILD_ID}.tar.gz -C dist .

echo "Frontend build complete: frontend-v1.18.0-${BUILD_ID}.tar.gz"
```

### Step 2: Build Backend

```bash
cd backend

# Verify version number
grep '"version"' package.json
# Should show: "version": "1.16.0"

# Build backend
npm run build

# Verify build succeeded
ls -lh dist/server.js
# Should see recent timestamp

# Create deployment archive
BUILD_ID=$(date +%Y%m%d_%H%M%S)
tar -czf backend-v1.16.0-${BUILD_ID}.tar.gz -C dist .

echo "Backend build complete: backend-v1.16.0-${BUILD_ID}.tar.gz"

cd ..
```

### Step 3: Deploy Frontend to Production (Container 201)

```bash
# Transfer frontend archive
scp frontend-v1.18.0-*.tar.gz root@192.168.1.190:/tmp/frontend-v1.18.0.tar.gz

# Deploy
ssh root@192.168.1.190 "
  pct push 201 /tmp/frontend-v1.18.0.tar.gz /tmp/frontend-v1.18.0.tar.gz &&
  pct exec 201 -- bash -c '
    cd /var/www/trade-show-app/current &&
    rm -rf * &&
    tar -xzf /tmp/frontend-v1.18.0.tar.gz &&
    chown -R www-data:www-data /var/www/trade-show-app/current &&
    systemctl reload nginx
  '
"

echo "✅ Frontend deployed to production"
```

### Step 4: Deploy Backend to Production (Container 201)

```bash
# Transfer backend archive
scp backend/backend-v1.16.0-*.tar.gz root@192.168.1.190:/tmp/backend-v1.16.0.tar.gz

# Deploy
ssh root@192.168.1.190 "
  pct push 201 /tmp/backend-v1.16.0.tar.gz /tmp/backend-v1.16.0.tar.gz &&
  pct exec 201 -- bash -c '
    cd /opt/trade-show-app/backend &&
    rm -rf dist &&
    mkdir -p dist &&
    tar -xzf /tmp/backend-v1.16.0.tar.gz -C dist &&
    chown -R node:node /opt/trade-show-app/backend &&
    pm2 restart trade-show-app-backend
  '
"

echo "✅ Backend deployed to production"
```

### Step 5: Restart NPMplus Proxy (Container 104)

```bash
# Clear proxy cache
ssh root@192.168.1.190 "
  pct stop 104 &&
  sleep 3 &&
  pct start 104 &&
  sleep 2
"

echo "✅ NPMplus proxy restarted"
```

### Step 6: Verify Deployment

```bash
# Check frontend version
curl -s http://192.168.1.138 | grep -o 'v1.18.0'
# Should output: v1.18.0

# Check backend health
ssh root@192.168.1.190 "
  pct exec 201 -- pm2 list | grep trade-show-app-backend
"
# Should show: online

# Check backend logs (last 20 lines)
ssh root@192.168.1.190 "
  pct exec 201 -- pm2 logs trade-show-app-backend --lines 20 --nostream
"
# Should show no errors

echo "✅ Deployment verification complete"
```

---

## 🧪 Post-Deployment Testing

### Immediate Tests (5 minutes)

Run these tests immediately after deployment:

#### 1. Login Test
- [ ] Navigate to http://192.168.1.138
- [ ] Login as admin
- [ ] Verify dashboard loads
- [ ] Check browser console (F12) - should have zero errors

#### 2. Version Verification
- [ ] Open Dev Dashboard (Developer role)
- [ ] Verify frontend version shows: **v1.18.0**
- [ ] Verify backend version shows: **v1.16.0**

#### 3. Core Functionality
- [ ] Create a test expense (as salesperson)
- [ ] Upload receipt
- [ ] Verify OCR processes correctly
- [ ] Submit expense
- [ ] Approve expense (as admin/accountant)
- [ ] Verify approval works

#### 4. Critical Workflows
- [ ] Dashboard quick actions work
- [ ] Expense filters function correctly
- [ ] Approval modal opens and functions
- [ ] Dev Dashboard tabs all load

### Extended Tests (30 minutes)

Run these tests within 1 hour of deployment:

1. **All Role Permissions**
   - [ ] Admin: Full access verified
   - [ ] Accountant: Approval workflows work
   - [ ] Coordinator: Event management works
   - [ ] Salesperson: Expense submission works
   - [ ] Developer: Dev Dashboard accessible

2. **All Major Features**
   - [ ] Event creation/editing
   - [ ] Expense submission with various file types (JPEG, PNG, HEIC, PDF)
   - [ ] OCR processing (success and failure cases)
   - [ ] Expense approval workflow
   - [ ] Entity assignment
   - [ ] Reimbursement tracking
   - [ ] Zoho Books push (test on dummy expense)

3. **UI Components**
   - [ ] All filters work (date, event, category, status)
   - [ ] Table sorting functions
   - [ ] Modals open and close properly
   - [ ] All tabs in Dev Dashboard load

4. **Browser Compatibility**
   - [ ] Chrome (latest)
   - [ ] Firefox (latest)
   - [ ] Safari (latest)
   - [ ] Mobile Safari (iOS)

---

## 🐛 Rollback Procedure

If critical issues are discovered post-deployment:

### Quick Rollback (2 minutes)

```bash
# Rollback frontend
ssh root@192.168.1.190 "
  pct exec 201 -- bash -c '
    cd /var/www/trade-show-app/current &&
    rm -rf * &&
    tar -xzf /tmp/frontend_backup_pre_v1.18.0_*.tar.gz &&
    systemctl reload nginx
  '
"

# Rollback backend
ssh root@192.168.1.190 "
  pct exec 201 -- bash -c '
    cd /opt/trade-show-app/backend &&
    rm -rf dist &&
    tar -xzf /tmp/backend_backup_pre_v1.18.0_*.tar.gz &&
    pm2 restart trade-show-app-backend
  '
"

# Restart proxy
ssh root@192.168.1.190 "
  pct stop 104 && sleep 3 && pct start 104
"

echo "✅ Rollback complete - Verify production is back to v1.17.3"
```

### Database Rollback (if needed)

**Note:** No database changes in v1.18.0, so database rollback should NOT be needed.

If database restore is required for any reason:

```bash
ssh root@192.168.1.190 "
  pct exec 201 -- bash -c '
    PGPASSWORD=your_password psql -h localhost -U expense_user -d expense_app_prod < /tmp/backup_pre_v1.18.0_*.sql
  '
"
```

---

## 📊 Success Criteria

Deployment is considered successful when:

- ✅ Frontend version displays as v1.18.0
- ✅ Backend version displays as v1.16.0
- ✅ Zero JavaScript console errors
- ✅ All role-based permissions work correctly
- ✅ Core workflows (submit, approve, assign entity) function
- ✅ All dashboard widgets load
- ✅ Dev Dashboard tabs accessible
- ✅ No user-reported issues within first 24 hours

---

## 📞 Support & Escalation

### If Issues Arise

1. **Check logs immediately**:
   ```bash
   ssh root@192.168.1.190 "pct exec 201 -- pm2 logs trade-show-app-backend --lines 50"
   ```

2. **Check browser console** (F12 in Chrome):
   - Look for JavaScript errors
   - Check network tab for failed API calls

3. **Check Nginx logs**:
   ```bash
   ssh root@192.168.1.190 "pct exec 201 -- tail -n 50 /var/log/nginx/error.log"
   ```

4. **If critical**: Execute rollback procedure immediately

5. **Document issues**: Take screenshots, save logs, note steps to reproduce

---

## 🎯 Expected Outcomes

### User Experience
- ✅ **No noticeable changes** - App functions identically to v1.17.3
- ✅ **Improved reliability** - Better code structure = fewer bugs
- ✅ **Same performance** - No architectural changes affecting speed

### Developer Experience
- ✅ **Easier maintenance** - 29 focused components vs 3 monolithic files
- ✅ **Faster debugging** - Clear separation of concerns
- ✅ **Better testability** - Smaller components easier to test
- ✅ **Clearer documentation** - Comprehensive testing guides

---

## 📅 Deployment Schedule

**Recommended Timing:**
- **Best**: Friday afternoon (allows weekend monitoring)
- **Acceptable**: Any weekday after 5 PM (outside business hours)
- **Avoid**: Monday mornings, during active trade shows

**Estimated Downtime:** 2-3 minutes (during backend restart)

---

## ✅ Post-Deployment Tasks

After successful deployment:

1. **Update Production Tracking**
   - [ ] Update `README.md` production version line
   - [ ] Tag release in Git: `git tag -a v1.18.0-prod -m "Production release v1.18.0"`
   - [ ] Push tag: `git push origin v1.18.0-prod`

2. **Monitor for 24 Hours**
   - [ ] Check error logs daily
   - [ ] Monitor user feedback
   - [ ] Verify no performance degradation

3. **Document Deployment**
   - [ ] Record deployment time
   - [ ] Note any issues encountered
   - [ ] Update MASTER_GUIDE.md if needed

---

## 📝 Notes

- **No database migrations required** - This is purely a code refactor
- **No API changes** - All endpoints remain the same
- **No environment changes** - Existing `.env` files work unchanged
- **Drop-in replacement** - v1.18.0 directly replaces v1.17.3

**Confidence Level**: 🟢 **HIGH** - Extensive sandbox testing completed, zero breaking changes, production-ready code quality.

---

*Last Updated: October 27, 2025*  
*Prepared By: AI Assistant*  
*Version: v1.18.0 Migration Guide*

