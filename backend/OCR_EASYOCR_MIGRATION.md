# EasyOCR Migration Guide - v1.6.0

**Status**: Sandbox Only (Container 203, Branch v1.6.0)  
**Date**: October 21, 2025

---

## Overview

This document describes the migration from Tesseract/PaddleOCR to **EasyOCR** as the primary OCR engine for receipt processing, including native **PDF support** for multi-page receipts.

### Why EasyOCR?

**Problems with Previous OCR Engines:**
- **Tesseract**: Poor accuracy (60-70%) on real-world receipts with varied layouts and fonts
- **PaddleOCR**: Requires AVX2 CPU instruction set (not available on current Proxmox hardware)
- Both lacked native PDF support

**EasyOCR Advantages:**
- ✅ **High accuracy** (80-90%) on complex receipt layouts
- ✅ **No AVX2 requirement** - works on any CPU
- ✅ **Handles rotated/skewed text** out of the box
- ✅ **Multi-language support** (80+ languages)
- ✅ **Native PDF processing** via pdf2image integration
- ✅ **Multi-page PDF support** with automatic page stitching
- ✅ **Maintains existing LLM and user correction pipeline**

---

## Architecture Changes

### OCR Provider Layer

```
Old Architecture:
PaddleOCR (primary) → Tesseract (fallback) → Inference Engine → LLM Enhancement

New Architecture:
EasyOCR (primary, no fallback needed) → PDF Processor (if PDF) → Inference Engine → LLM Enhancement
```

### File Type Support

**Before:**
- Images only: JPEG, PNG, HEIC, HEIF, WebP

**After:**
- Images: JPEG, PNG, HEIC, HEIF, WebP (unchanged)
- **NEW**: PDF (single and multi-page)

### Processing Flow

#### Image Processing:
1. User uploads receipt image
2. EasyOCR preprocesses image (denoise, enhance, threshold)
3. Text extraction with bounding boxes and confidence scores
4. Field inference (merchant, amount, date, card, category)
5. LLM enhancement for low-confidence fields (if enabled)
6. User correction tracking

#### PDF Processing (NEW):
1. User uploads PDF receipt
2. PDF converted to images (one per page) at 300 DPI
3. Each page processed with EasyOCR
4. Text from all pages combined with page markers
5. Field inference on combined text
6. LLM enhancement for low-confidence fields
7. User correction tracking

---

## Implementation Details

### Python Components

#### 1. EasyOCR Processor (`easyocr_processor.py`)

**Purpose**: Process image receipts with EasyOCR

**Key Features:**
- Automatic image preprocessing (grayscale, denoise, threshold)
- Configurable languages (default: English)
- GPU support (optional, disabled by default)
- Per-line confidence scores
- Structured JSON output

**Usage:**
```bash
python3 easyocr_processor.py receipt.jpg --lang en --gpu false --preprocess true
```

**Output:**
```json
{
  "success": true,
  "text": "Full extracted text...",
  "confidence": 0.87,
  "provider": "easyocr",
  "line_count": 15,
  "lines": [
    {"text": "MERCHANT NAME", "confidence": 0.95},
    {"text": "Total: $45.67", "confidence": 0.92}
  ]
}
```

#### 2. PDF Processor (`pdf_processor.py`)

**Purpose**: Convert PDF receipts to images and process with EasyOCR

**Key Features:**
- Multi-page PDF support
- Configurable DPI (default: 300)
- Per-page OCR results
- Combined text output with page markers
- Parallel processing for multi-page PDFs

**Usage:**
```bash
python3 pdf_processor.py receipt.pdf --dpi 300 --lang en --gpu false
```

**Output:**
```json
{
  "success": true,
  "text": "--- Page 1 ---\nText...\n\n--- Page 2 ---\nMore text...",
  "confidence": 0.85,
  "provider": "easyocr-pdf",
  "page_count": 2,
  "pages": [
    {"page": 1, "text": "...", "confidence": 0.88},
    {"page": 2, "text": "...", "confidence": 0.82}
  ]
}
```

### TypeScript Components

#### 1. EasyOCRProvider (`providers/EasyOCRProvider.ts`)

**Purpose**: Node.js integration with Python OCR scripts

**Key Methods:**
- `isAvailable()`: Check if EasyOCR is installed
- `process(imagePath)`: Process image receipt
- `processPDF(pdfPath, dpi)`: Process PDF receipt

**Example:**
```typescript
const provider = new EasyOCRProvider({
  languages: ['en'],
  useGPU: false
});

const result = await provider.process('/path/to/receipt.jpg');
console.log(`Extracted: ${result.text}`);
console.log(`Confidence: ${result.confidence}`);
```

#### 2. OCRService (`OCRService.ts`)

**Purpose**: Orchestrate OCR, inference, and LLM enhancement

**Key Changes:**
- Primary provider changed from `paddleocr` to `easyocr`
- No fallback provider (EasyOCR is reliable)
- Auto-detects PDF vs image files
- Routes to appropriate processor

**Example:**
```typescript
const result = await ocrService.processReceipt('/path/to/receipt.pdf');
// Automatically handles PDF conversion and OCR
```

---

## Installation

### System Dependencies

#### Ubuntu/Debian (Proxmox LXC):
```bash
# Install poppler (required for pdf2image)
sudo apt-get update
sudo apt-get install -y poppler-utils

# Install Python and pip (if not already installed)
sudo apt-get install -y python3 python3-pip python3-dev

# Install OpenCV dependencies
sudo apt-get install -y libgl1-mesa-glx libglib2.0-0
```

#### macOS:
```bash
brew install poppler python3
```

### Python Packages

```bash
cd backend

# Install all dependencies from requirements.txt
pip3 install -r requirements.txt

# Or install individually:
pip3 install easyocr>=1.7.0
pip3 install opencv-python>=4.8.0
pip3 install numpy>=1.24.0
pip3 install Pillow>=10.0.0
pip3 install pdf2image>=1.16.0
pip3 install PyPDF2>=3.0.0
```

**First Run:**
EasyOCR will automatically download language models (~150MB for English) on first execution. Models are cached in `/tmp/easyocr_models/`.

### Verification

#### Test Image OCR:
```bash
cd backend/src/services/ocr

# Test with a sample receipt
python3 easyocr_processor.py /path/to/sample_receipt.jpg

# Should output JSON with extracted text
```

#### Test PDF OCR:
```bash
# Test with a sample PDF receipt
python3 pdf_processor.py /path/to/sample_receipt.pdf

# Should output JSON with page-by-page results
```

#### Test Node.js Integration:
```bash
cd backend

# Start backend server
npm run dev

# Test OCR endpoint with curl
curl -X POST http://localhost:3000/api/ocr/v2/process \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "receipt=@/path/to/receipt.jpg"
```

---

## Deployment to Sandbox (Container 203)

### Step 1: Install System Dependencies

```bash
ssh root@192.168.1.190

# Enter container 203
pct exec 203 -- bash

# Install poppler and dependencies
apt-get update
apt-get install -y poppler-utils python3-pip libgl1-mesa-glx libglib2.0-0
```

### Step 2: Install Python Packages

```bash
# Navigate to backend directory
cd /opt/trade-show-app/backend

# Install Python dependencies
pip3 install -r requirements.txt

# Wait for EasyOCR model download (first time only, ~3-5 minutes)
```

### Step 3: Test OCR Installation

```bash
# Test EasyOCR
python3 -c "import easyocr; reader = easyocr.Reader(['en']); print('EasyOCR OK')"

# Test pdf2image
python3 -c "from pdf2image import convert_from_path; print('pdf2image OK')"
```

### Step 4: Deploy Backend Code

From your local machine:

```bash
# Ensure you're on v1.6.0 branch
git checkout v1.6.0
git pull origin v1.6.0

# Build backend
cd backend
npm run build

# Create tarball
tar -czf backend-v1.6.0-easyocr.tar.gz dist/ requirements.txt src/services/ocr/

# Deploy to container 203
scp backend-v1.6.0-easyocr.tar.gz root@192.168.1.190:/tmp/

ssh root@192.168.1.190 "
  pct push 203 /tmp/backend-v1.6.0-easyocr.tar.gz /tmp/backend-deploy.tar.gz &&
  pct exec 203 -- bash -c '
    cd /opt/trade-show-app/backend &&
    tar -xzf /tmp/backend-deploy.tar.gz &&
    systemctl restart trade-show-app-backend &&
    echo \"Backend deployed and restarted\"
  '
"
```

### Step 5: Verify Deployment

```bash
# Check backend logs
ssh root@192.168.1.190 "pct exec 203 -- journalctl -u trade-show-app-backend -n 50 --no-pager"

# Should see:
# [EasyOCR] Provider initialized
# [OCRService] Initialized with config: { primary: 'easyocr', ... }
```

### Step 6: Deploy Frontend

```bash
# Build frontend
cd .. # Return to project root
npm run build

# Deploy (follow existing frontend deployment process)
# See SANDBOX_DEPLOYMENT_CHECKLIST.md
```

---

## Testing

### Test Cases

#### 1. Image Receipt (JPEG/PNG)
```bash
# Upload via frontend
# Expected: OCR extracts merchant, amount, date with 80%+ confidence
```

#### 2. HEIC/WebP Image (iPhone/Android)
```bash
# Upload phone camera image
# Expected: OCR processes successfully, extracts fields
```

#### 3. Single-Page PDF
```bash
# Upload 1-page PDF receipt
# Expected: PDF converted, OCR extracts text, fields inferred
```

#### 4. Multi-Page PDF
```bash
# Upload 2-3 page PDF receipt
# Expected: All pages processed, combined text, fields extracted
```

#### 5. Low-Confidence Receipt
```bash
# Upload blurry/faded receipt
# Expected: OCR reports low confidence, LLM enhancement triggered (if Ollama available)
```

#### 6. User Correction Tracking
```bash
# Upload receipt, OCR extracts fields
# Manually correct merchant name
# Save expense
# Expected: Correction logged to ocr_corrections table
```

### Performance Benchmarks

| Metric | Target | Actual (TBD) |
|--------|--------|--------------|
| Image OCR time | < 2s | ? |
| PDF OCR time (1 page) | < 3s | ? |
| PDF OCR time (3 pages) | < 8s | ? |
| Merchant accuracy | > 90% | ? |
| Amount accuracy | > 95% | ? |
| Date accuracy | > 90% | ? |
| Category accuracy | > 75% | ? |

---

## LLM Integration (Unchanged)

The EasyOCR migration preserves the existing LLM enhancement pipeline:

1. **Low-Confidence Detection**: Fields with confidence < 0.7 flagged
2. **Ollama Enhancement**: Ollama Lite (container 302) re-extracts low-confidence fields
3. **Field Merge**: LLM results merged with rule-based inference (higher confidence wins)
4. **User Override**: User corrections always take precedence

**No changes required to:**
- `inference/LLMProvider.ts`
- `inference/RuleBasedInferenceEngine.ts`
- Ollama Lite container (302)
- User correction service

---

## User Correction Pipeline (Unchanged)

User corrections continue to work exactly as before:

1. User uploads receipt → OCR extracts fields
2. Frontend pre-fills form with OCR data
3. User reviews and corrects any mistakes
4. On save, frontend compares original vs edited values
5. Corrections sent to `/api/ocr/v2/corrections`
6. Stored in `ocr_corrections` table for future analysis

**No changes required to:**
- `UserCorrectionService.ts`
- `ocr_corrections` database table
- Frontend correction tracking logic

---

## Rollback Plan

If EasyOCR causes issues:

### Option 1: Revert to Tesseract (Quick)

```typescript
// backend/src/services/ocr/OCRService.ts
export const ocrService = new OCRService({
  primaryProvider: 'tesseract', // Revert to Tesseract
  fallbackProvider: undefined,
  // ... rest unchanged
});
```

### Option 2: Full Rollback

```bash
# Checkout previous version
git checkout v1.5.1-backend
cd backend
npm run build

# Deploy previous backend
# (follow standard deployment process)
```

### Option 3: Hybrid (Image: EasyOCR, PDF: Disable)

Temporarily disable PDF uploads while keeping EasyOCR for images:

```typescript
// backend/src/routes/expenses.ts & ocrV2.ts
fileFilter: (req, file, cb) => {
  const mimetypeOk = file.mimetype.startsWith('image/'); // Remove PDF support
  // ...
}
```

---

## Known Limitations

1. **PDF Size**: PDFs > 10MB may timeout (same limit as images)
2. **Page Limit**: Recommended max 5 pages per PDF for reasonable processing time
3. **GPU**: Not enabled by default (CPU mode is sufficient)
4. **Languages**: Currently English only (can be expanded)
5. **Handwritten Text**: EasyOCR handles typed text best (handwriting accuracy ~60%)

---

## Future Enhancements

1. **GPU Acceleration**: Enable GPU mode for faster processing (requires CUDA)
2. **Multi-Language**: Support Spanish, French for international receipts
3. **Batch Processing**: Process multiple receipts simultaneously
4. **Table Extraction**: Detect and extract itemized line items from receipts
5. **Confidence Calibration**: Fine-tune confidence thresholds based on real-world data
6. **Model Fine-Tuning**: Train custom EasyOCR model on receipt dataset

---

## Support & Troubleshooting

### Common Issues

#### "EasyOCR not found"
```bash
# Solution: Install EasyOCR
pip3 install easyocr
```

#### "poppler not installed" (PDF error)
```bash
# Solution: Install poppler
sudo apt-get install poppler-utils
```

#### "Out of memory" (large PDFs)
```bash
# Solution: Reduce DPI or split PDF
python3 pdf_processor.py receipt.pdf --dpi 200  # Lower DPI = less memory
```

#### "Model download failed"
```bash
# Solution: Download models manually
mkdir -p /tmp/easyocr_models
# Models will auto-download on next run with internet connection
```

### Debug Logging

Enable verbose logging:

```typescript
// backend/src/services/ocr/OCRService.ts
this.config = {
  // ...
  logOCRResults: true  // Enable detailed logging
};
```

### Contact

For issues or questions about the EasyOCR migration:
- Check logs: `journalctl -u trade-show-app-backend -n 100`
- Review this guide: `backend/OCR_EASYOCR_MIGRATION.md`
- Check master guide: `docs/AI_MASTER_GUIDE.md`

---

**Document Version**: 1.0  
**Last Updated**: October 21, 2025  
**Author**: AI Assistant  
**Branch**: v1.6.0  
**Environment**: Sandbox Only (Container 203)

