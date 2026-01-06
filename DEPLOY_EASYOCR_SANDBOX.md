# EasyOCR + PDF Support - Sandbox Deployment Guide

**Version**: v1.10.0  
**Branch**: v1.6.0  
**Environment**: Sandbox Only (Container 203)  
**Date**: October 21, 2025

---

## Quick Deployment Checklist

- [ ] **Step 1**: Install system dependencies in container 203
- [ ] **Step 2**: Install Python packages (EasyOCR, pdf2image, etc.)
- [ ] **Step 3**: Deploy backend code with EasyOCR provider
- [ ] **Step 4**: Deploy frontend code with PDF upload support
- [ ] **Step 5**: Restart backend service
- [ ] **Step 6**: Test with sample receipts (image + PDF)
- [ ] **Step 7**: Verify LLM pipeline and user corrections
- [ ] **Step 8**: Update version numbers and commit

---

## Step 1: Install System Dependencies

```bash
# SSH to Proxmox host
ssh root@192.168.1.190

# Enter container 203
pct exec 203 -- bash

# Run automated installation script
cd /opt/trade-show-app/backend
bash install-easyocr.sh

# Or install manually:
apt-get update
apt-get install -y poppler-utils python3-pip libgl1-mesa-glx libglib2.0-0
```

**Expected Output:**
```
✓ System dependencies installed
✓ Python packages installed
✓ EasyOCR models downloaded
```

---

## Step 2: Verify Installation

```bash
# Test EasyOCR
python3 -c "import easyocr; print('EasyOCR OK')"

# Test pdf2image
python3 -c "from pdf2image import convert_from_path; print('pdf2image OK')"

# Test OpenCV
python3 -c "import cv2; print('OpenCV OK')"
```

**All tests should print "OK"**

---

## Step 3: Deploy Backend

```bash
# On local machine - checkout v1.6.0 branch
cd /Users/sahilkhatri/Projects/Work/trade-show-app
git checkout v1.6.0
git pull origin v1.6.0

# Build backend
cd backend
npm install
npm run build

# Create deployment tarball
BUILD_ID=$(date +%Y%m%d_%H%M%S)
tar -czf backend-v1.10.0-${BUILD_ID}.tar.gz dist/ requirements.txt src/services/ocr/

# Deploy to sandbox
scp backend-v1.10.0-${BUILD_ID}.tar.gz root@192.168.1.190:/tmp/backend-deploy.tar.gz

ssh root@192.168.1.190 "
  pct push 203 /tmp/backend-deploy.tar.gz /tmp/backend-deploy.tar.gz &&
  pct exec 203 -- bash -c '
    cd /opt/trade-show-app/backend &&
    tar -xzf /tmp/backend-deploy.tar.gz &&
    chown -R 501:staff /opt/trade-show-app/backend &&
    systemctl restart trade-show-app-backend &&
    echo \"✓ Backend deployed and restarted\"
  '
"
```

---

## Step 4: Deploy Frontend

```bash
# Build frontend (on local machine)
cd .. # Return to project root
npm install
npm run build

# Add build ID
BUILD_ID=$(date +%Y%m%d_%H%M%S)
echo "<!-- Build: ${BUILD_ID} -->" >> dist/index.html

# Create tarball
tar -czf frontend-v1.10.0-${BUILD_ID}.tar.gz -C dist .

# Deploy to sandbox
scp frontend-v1.10.0-${BUILD_ID}.tar.gz root@192.168.1.190:/tmp/frontend-deploy.tar.gz

ssh root@192.168.1.190 "
  pct push 203 /tmp/frontend-deploy.tar.gz /tmp/frontend-deploy.tar.gz &&
  pct exec 203 -- bash -c '
    cd /var/www/trade-show-app &&
    rm -rf * &&
    tar -xzf /tmp/frontend-deploy.tar.gz &&
    chown -R 501:staff /var/www/trade-show-app &&
    systemctl restart nginx &&
    echo \"✓ Frontend deployed and restarted\"
  ' &&
  pct stop 104 &&  # Restart NPMplus proxy to clear cache
  sleep 3 &&
  pct start 104 &&
  echo \"✓ NPMplus proxy restarted\"
"
```

---

## Step 5: Verify Deployment

### Check Backend Logs

```bash
ssh root@192.168.1.190 "pct exec 203 -- journalctl -u trade-show-app-backend -n 50 --no-pager"
```

**Look for:**
```
[EasyOCR] Provider initialized
[OCRService] Initialized with config: { primary: 'easyocr', ... }
Server running on port 3000
```

**Should NOT see:**
```
ERROR: EasyOCR not found
ERROR: pdf2image not found
ERROR: Provider initialization failed
```

### Check Frontend Version

```bash
# Open browser to http://192.168.1.144
# Check footer for version v1.10.0
# Hard refresh (Cmd+Shift+R) if old version shows
```

---

## Step 6: Test OCR Functionality

### Test 1: Image Receipt Upload

1. Go to http://192.168.1.144
2. Login as developer (sandbox123)
3. Click "Expenses" → "Add Expense"
4. Upload a receipt image (JPEG/PNG)
5. Wait for OCR processing
6. Verify fields extracted: merchant, amount, date, category

**Expected:**
- Processing completes in < 3 seconds
- Confidence scores displayed
- Fields pre-filled in form

### Test 2: PDF Receipt Upload

1. Click "Add Expense"
2. Upload a PDF receipt (single or multi-page)
3. Wait for OCR processing (may take longer for multi-page)
4. Verify fields extracted from PDF content

**Expected:**
- PDF accepted by file picker
- Processing completes in < 5 seconds per page
- Multi-page PDFs combine text correctly
- Fields pre-filled from PDF text

### Test 3: LLM Enhancement

1. Upload a poor-quality receipt (blurry/faded)
2. OCR should report low confidence
3. LLM (Ollama Lite) should enhance low-confidence fields
4. Check logs for LLM enhancement messages

**Expected:**
```
[OCRService] Enhancing 2 low-confidence fields with LLM: merchant, amount
[OCRService] LLM enhancements applied: 2 field(s) improved
```

### Test 4: User Corrections

1. Upload receipt, OCR extracts fields
2. Manually correct merchant name
3. Save expense
4. Check database for correction record

**Expected:**
```sql
SELECT * FROM ocr_corrections ORDER BY created_at DESC LIMIT 1;
-- Should show: original OCR value, corrected value, fields corrected
```

---

## Step 7: Performance Benchmarks

Run these tests and record results:

| Test | Target | Result |
|------|--------|--------|
| Image OCR (1 receipt) | < 2s | ___ |
| PDF OCR (1 page) | < 3s | ___ |
| PDF OCR (3 pages) | < 8s | ___ |
| Merchant accuracy | > 90% | ___ |
| Amount accuracy | > 95% | ___ |
| Date accuracy | > 90% | ___ |

**How to test:**
- Upload 10 varied receipts
- Compare OCR results vs actual values
- Calculate accuracy percentages

---

## Troubleshooting

### Issue: "EasyOCR not found"

**Solution:**
```bash
pct exec 203 -- bash -c 'cd /opt/trade-show-app/backend && pip3 install -r requirements.txt'
```

### Issue: "poppler not installed" (PDF error)

**Solution:**
```bash
pct exec 203 -- apt-get install -y poppler-utils
```

### Issue: Backend won't start

**Check logs:**
```bash
pct exec 203 -- journalctl -u trade-show-app-backend -n 100 --no-pager
```

**Common fixes:**
- Check /opt/trade-show-app/backend path (capital A!)
- Verify dist/ directory exists
- Check node_modules are installed
- Restart: `systemctl restart trade-show-app-backend`

### Issue: Old version showing in browser

**Clear all caches:**
1. Hard refresh browser (Cmd+Shift+R)
2. Restart NPMplus proxy: `pct stop 104 && sleep 3 && pct start 104`
3. Clear service worker: DevTools → Application → Service Workers → Unregister

---

## Rollback Plan

If issues occur, revert to previous version:

```bash
# Checkout previous stable version
git checkout v1.9.17
cd backend
npm run build

# Deploy previous backend
# (follow standard backend deployment)

# Uninstall EasyOCR if needed
pct exec 203 -- pip3 uninstall easyocr opencv-python pdf2image
```

---

## Post-Deployment

### Update Version Numbers

```bash
# Update package.json
"version": "1.10.0"

# Update service-worker.js cache names
CACHE_NAME = 'expenseapp-v1.10.0'
STATIC_CACHE = 'expenseapp-static-v1.10.0'

# Commit changes
git add -A
git commit -m "feat: EasyOCR migration + PDF support (v1.10.0)"
git push origin v1.6.0
```

### Create Git Tags

```bash
git tag -a "v1.10.0-backend" -m "Backend v1.10.0 - EasyOCR + PDF support"
git tag -a "v1.10.0-frontend" -m "Frontend v1.10.0 - PDF upload support"
git push origin --tags
```

### Update Documentation

- [ ] Update AI_MASTER_GUIDE.md with deployment date
- [ ] Update CHANGELOG.md with version entry
- [ ] Mark OCR migration as complete

---

## Success Criteria

✅ **Backend:**
- EasyOCR installed and working
- PDF processing functional
- Backend logs show no errors
- OCR API responds correctly

✅ **Frontend:**
- PDF files accepted in upload
- OCR results display correctly
- Version number updated
- No console errors

✅ **Integration:**
- LLM enhancement pipeline works
- User corrections tracked
- Database records created correctly
- End-to-end expense submission successful

---

## Documentation

- **Migration Guide**: `backend/OCR_EASYOCR_MIGRATION.md`
- **Master Guide**: `docs/AI_MASTER_GUIDE.md`
- **Installation Script**: `backend/install-easyocr.sh`
- **This Deployment Guide**: `DEPLOY_EASYOCR_SANDBOX.md`

---

**Deployment Status**: ⏳ Pending  
**Next Step**: Execute Step 1 (Install Dependencies)  
**Branch**: v1.6.0 (sandbox only)  
**Approver**: User confirmation required before production

