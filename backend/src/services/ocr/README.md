# Enhanced OCR System - Architecture & Usage

**Version:** 1.8.0  
**Branch:** v1.6.0 (Sandbox - Full User Correction Pipeline)  
**Status:** ✅ Sandbox Ready - Complete Feedback Loop Active

---

## Overview

This is a complete rewrite of the receipt OCR system with:
- **PaddleOCR** integration for higher accuracy
- **Modular provider architecture** (easy to swap OCR engines)
- **Field inference engine** with confidence scores
- **Category detection** with keyword matching
- **LLM-ready framework** for future AI enhancement
- **User correction tracking** for continuous learning

---

## Architecture

```
┌─────────────────┐
│  Receipt Image  │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────┐
│       OCR Service Orchestrator       │
│  - Provider selection & fallback     │
│  - Quality assessment                │
│  - LLM enhancement (future)          │
└────────┬─────────────┬──────────────┘
         │             │
         ▼             ▼
┌──────────────┐  ┌──────────────┐
│  PaddleOCR   │  │  Tesseract   │
│  (Primary)   │  │  (Fallback)  │
└──────────────┘  └──────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│     Field Inference Engine           │
│  - Merchant, amount, date extraction │
│  - Card detection                    │
│  - Category prediction               │
│  - Confidence scoring                │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│      Processed Receipt               │
│  - OCR text + confidence             │
│  - Extracted fields + confidence     │
│  - Category suggestions              │
│  - Quality flags (needsReview)       │
└─────────────────────────────────────┘
```

---

## Components

### 1. OCR Providers (`providers/`)

**TesseractProvider** - Legacy OCR engine
- Uses Tesseract.js
- Kept for backward compatibility
- Automatic fallback if PaddleOCR unavailable

**PaddleOCRProvider** - High-accuracy OCR
- Python-based (calls paddleocr_processor.py)
- Preprocessing: deskew, contrast, denoise
- Word-level confidence scores
- Faster and more accurate than Tesseract

### 2. Field Inference Engine (`inference/`)

**RuleBasedInferenceEngine** - Extracts structured data from OCR text
- **Merchant**: First substantial line (filtered heuristics)
- **Amount**: Multiple regex patterns (total, amount, balance, etc.)
- **Date**: Multiple formats (MM/DD/YYYY, Month DD, YYYY, etc.)
- **Card Last Four**: Detects `****1234`, `ending in 1234`, etc.
- **Category**: 12 categories with keyword matching
- **Location**: Address patterns
- **Tax/Tip**: Optional field extraction

Each field returns:
```typescript
{
  value: T | null,
  confidence: number, // 0-1 scale
  source: 'ocr' | 'inference' | 'llm' | 'user',
  rawText?: string,
  alternatives?: Array<{ value: T, confidence: number }>
}
```

**LLMProvider** - Framework for future AI enhancement
- Interfaces for OpenAI, Claude, Local LLM
- Not implemented yet
- Will handle low-confidence fields
- Validation and correction capabilities

### 3. OCR Service Orchestrator (`OCRService.ts`)

Main service that coordinates everything:
- Provider selection (primary → fallback)
- OCR processing
- Field inference
- LLM enhancement (when available)
- Quality assessment
- Overall confidence calculation

### 4. User Correction System (`UserCorrectionService.ts`)

Tracks user edits for continuous learning:
- Stores original OCR + inference
- Records corrected fields
- Analytics for most-corrected fields
- Export functionality for ML training

---

## Ollama LLM Integration (v1.6.0)

**✅ IMPLEMENTED AND ACTIVE IN SANDBOX**

The OCR system now includes optional LLM enhancement using Ollama Lite for low-confidence fields.

**Quick Start:**
- Ollama Container: 302 (ollama-lite) at 192.168.1.173:11434
- Model: dolphin-llama3 (4.7GB, CPU-optimized)
- Enabled by default for fields with confidence < 0.7
- Fully local inference (no external APIs)

**See:** [OLLAMA_SETUP.md](./OLLAMA_SETUP.md) for complete setup guide

**How it Works:**
1. PaddleOCR extracts text → Rule-based engine infers fields
2. Identify low-confidence fields (< 0.7 threshold)
3. Send to Ollama for LLM-based extraction
4. Merge results (keep higher confidence)
5. Store alternatives for user selection

**Example Enhancement:**
```
Rule-based: merchant="WALMAR" (confidence: 0.65)
    ↓
Ollama LLM: merchant="Walmart" (confidence: 0.85)
    ↓
Final: merchant="Walmart" (source: 'llm', alternatives: ["WALMAR"])
```

---

## Installation

### 1. Install Python Dependencies

```bash
cd backend
pip3 install -r requirements.txt
```

**Required packages:**
- `paddleocr>=2.7.0` - OCR engine
- `paddlepaddle>=2.5.0` - Deep learning framework
- `opencv-python>=4.8.0` - Image preprocessing
- `numpy`, `Pillow` - Support libraries

### 2. Verify Installation

```bash
# Test PaddleOCR
python3 -c "import paddleocr; print('PaddleOCR OK')"

# Test OCR processor
python3 src/services/ocr/paddleocr_processor.py /path/to/test/image.jpg
```

### 3. Configure Environment (Optional)

```bash
# .env
PYTHON_PATH=python3  # Path to Python executable (default: python3)
OCR_PRIMARY_PROVIDER=paddleocr  # 'paddleocr' or 'tesseract'
OCR_FALLBACK_PROVIDER=tesseract
OCR_CONFIDENCE_THRESHOLD=0.6
```

---

## API Usage

### Enhanced OCR Processing

**Endpoint:** `POST /api/ocr/v2/process`

**Request:**
```bash
curl -X POST http://localhost:3000/api/ocr/v2/process \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "receipt=@receipt.jpg"
```

**Response:**
```json
{
  "success": true,
  "ocr": {
    "text": "WALMART\\nTotal: $45.99\\n10/15/2025",
    "confidence": 0.92,
    "provider": "paddleocr",
    "processingTime": 1234
  },
  "fields": {
    "merchant": {
      "value": "WALMART",
      "confidence": 0.88,
      "source": "inference"
    },
    "amount": {
      "value": 45.99,
      "confidence": 0.95,
      "source": "inference",
      "alternatives": [
        { "value": 45.90, "confidence": 0.70 }
      ]
    },
    "date": {
      "value": "10/15/2025",
      "confidence": 0.92,
      "source": "inference"
    },
    "cardLastFour": {
      "value": "1234",
      "confidence": 0.90,
      "source": "inference"
    },
    "category": {
      "value": "Meal and Entertainment",
      "confidence": 0.75,
      "source": "inference"
    }
  },
  "categories": [
    {
      "category": "Meal and Entertainment",
      "confidence": 0.75,
      "keywords": ["walmart", "food"],
      "source": "rule-based"
    }
  ],
  "quality": {
    "overallConfidence": 0.89,
    "needsReview": false
  },
  "receiptUrl": "/uploads/receipt-123.jpg"
}
```

### Submit User Correction

**Endpoint:** `POST /api/ocr/v2/corrections`

```javascript
fetch('/api/ocr/v2/corrections', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    expenseId: 'expense-uuid',
    originalOCRText: 'WALMAR\nTotal: $45.99',
    originalInference: { /* full inference object */ },
    correctedFields: {
      merchant: 'Walmart',  // User corrected
      amount: 45.99         // No change
    },
    notes: 'OCR misread merchant name'
  })
});
```

### Get Correction Statistics

**Endpoint:** `GET /api/ocr/v2/corrections/stats` (Admin/Developer only)

```json
{
  "success": true,
  "stats": {
    "totalCorrections": 127,
    "byField": {
      "merchant": 45,
      "amount": 32,
      "date": 28,
      "category": 15,
      "cardLastFour": 7
    },
    "avgConfidenceWhenCorrected": 0.68
  }
}
```

---

## Frontend Integration

### Updating Expense Form

```typescript
// 1. Call enhanced OCR endpoint
const formData = new FormData();
formData.append('receipt', file);

const response = await fetch('/api/ocr/v2/process', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: formData
});

const result = await response.json();

// 2. Populate form with inferred fields
setFormData({
  merchant: result.fields.merchant.value || '',
  amount: result.fields.amount.value || 0,
  date: result.fields.date.value || '',
  cardUsed: result.fields.cardLastFour.value || '',
  category: result.fields.category.value || ''
});

// 3. Show confidence indicators
setFieldConfidence({
  merchant: result.fields.merchant.confidence,
  amount: result.fields.amount.confidence,
  // ... etc
});

// 4. Show category suggestions
setCategorySuggestions(result.categories);

// 5. Flag for review if needed
setNeedsReview(result.quality.needsReview);
setReviewReasons(result.quality.reviewReasons);
```

### Showing Confidence Scores

```tsx
<div className="field-with-confidence">
  <label>Merchant</label>
  <input 
    value={merchant}
    onChange={e => setMerchant(e.target.value)}
  />
  <ConfidenceBadge 
    confidence={fieldConfidence.merchant}
    needsReview={fieldConfidence.merchant < 0.7}
  />
</div>
```

### Submitting Corrections

```typescript
// When user submits expense with modified fields
if (userModifiedFields.length > 0) {
  await fetch('/api/ocr/v2/corrections', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}` 
    },
    body: JSON.stringify({
      expenseId,
      originalOCRText: ocrResult.ocr.text,
      originalInference: ocrResult.fields,
      correctedFields: {
        merchant: userEditedMerchant,
        amount: userEditedAmount,
        // Only include fields that changed
      }
    })
  });
}
```

---

## Configuration

### OCR Service Config

```typescript
const ocrService = new OCRService({
  primaryProvider: 'paddleocr',     // or 'tesseract'
  fallbackProvider: 'tesseract',    // optional
  inferenceEngine: 'rule-based',    // or 'llm' (future)
  llmProvider: undefined,           // 'openai', 'claude', 'local' (future)
  confidenceThreshold: 0.6,         // Min confidence to accept
  enableUserCorrections: true,      // Track corrections
  logOCRResults: true               // Log for analytics
});
```

### Category Keywords

Edit `inference/RuleBasedInferenceEngine.ts` to add/modify categories:

```typescript
private categoryKeywords = {
  'Your Custom Category': {
    keywords: ['keyword1', 'keyword2', 'keyword3'],
    weight: 1.0  // 0-1 scale
  },
  // ...
};
```

---

## Testing & Benchmarking

### Manual Testing

```bash
# 1. Start backend
cd backend
npm run dev

# 2. Test OCR endpoint
curl -X POST http://localhost:3000/api/ocr/v2/process \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "receipt=@test-receipt.jpg"

# 3. Check logs for confidence scores
# Look for: [OCR v2] Success - Overall confidence: 0.XX
```

### Benchmark Suite (TODO)

Create `backend/src/services/ocr/__tests__/benchmark.ts`:
- Test suite of 50+ receipts
- Compare PaddleOCR vs Tesseract accuracy
- Measure field extraction accuracy
- Track category prediction accuracy
- Performance metrics (processing time)

---

## Database Schema

### ocr_corrections Table

```sql
CREATE TABLE ocr_corrections (
  id UUID PRIMARY KEY,
  expense_id UUID REFERENCES expenses(id),
  user_id UUID REFERENCES users(id),
  
  -- Original OCR
  ocr_provider VARCHAR(50),
  ocr_text TEXT,
  ocr_confidence DECIMAL(3,2),
  original_inference JSONB,
  
  -- Corrected fields
  corrected_merchant VARCHAR(255),
  corrected_amount DECIMAL(12,2),
  corrected_date VARCHAR(50),
  corrected_card_last_four VARCHAR(4),
  corrected_category VARCHAR(100),
  
  -- Metadata
  fields_corrected TEXT[],
  correction_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE
);
```

---

## Future Enhancements

### 1. LLM Integration

**OpenAI GPT-4 Vision:**
```typescript
// Implement in inference/LLMProvider.ts
async extractFields(ocrText: string, lowConfidenceFields: string[]) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4-vision-preview',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: this.buildExtractionPrompt(ocrText, lowConfidenceFields) },
        { type: 'image_url', image_url: receiptImageUrl }
      ]
    }]
  });
  return JSON.parse(response.choices[0].message.content);
}
```

### 2. ML Model Retraining

Use collected corrections to retrain/fine-tune:
1. Export corrections: `GET /api/ocr/v2/corrections/export`
2. Format as training dataset
3. Fine-tune PaddleOCR or custom model
4. Deploy updated model

### 3. Confidence Calibration

Track actual vs predicted confidence:
- Compare user corrections to confidence scores
- Calibrate confidence thresholds per field
- Improve "needsReview" accuracy

### 4. Multi-Page Receipt Support

- Detect multi-page receipts
- Stitch OCR results
- Handle receipt + itemized list

---

## Troubleshooting

### PaddleOCR Not Available

**Symptom:** Falls back to Tesseract for all requests

**Solution:**
```bash
# Check Python installation
python3 --version

# Check PaddleOCR
python3 -c "import paddleocr"

# Reinstall if needed
pip3 uninstall paddleocr paddlepaddle
pip3 install -r requirements.txt
```

### Low Confidence Scores

**Symptom:** Most fields have confidence < 0.7

**Possible causes:**
- Poor image quality (blurry, dark, skewed)
- Unusual receipt format
- Non-English text

**Solutions:**
- Improve image preprocessing
- Add more regex patterns for your receipt types
- Implement LLM fallback

### Slow Processing

**Symptom:** OCR takes > 5 seconds

**Solutions:**
- Use GPU for PaddleOCR (install `paddlepaddle-gpu`)
- Reduce image resolution before processing
- Cache results for duplicate receipts

---

## Maintenance

### Adding New Categories

1. Edit `RuleBasedInferenceEngine.ts`
2. Add to `categoryKeywords` map
3. Restart backend
4. Update frontend category dropdown

### Updating Extraction Patterns

1. Edit patterns in `RuleBasedInferenceEngine.ts`
2. Test with diverse receipts
3. Monitor correction stats for accuracy

### Reviewing Corrections

```bash
# Check what fields users correct most
curl http://localhost:3000/api/ocr/v2/corrections/stats \
  -H "Authorization: Bearer DEVELOPER_TOKEN"

# This tells you where to improve inference
```

---

## Security Considerations

- OCR text may contain PII - store securely
- User corrections are tied to user accounts
- Only admin/developer can access correction stats
- Receipt images auto-deleted after X days (TODO)
- Sanitize OCR text before LLM processing

---

## Performance Metrics (Targets)

| Metric | Target | Current (PaddleOCR) |
|--------|--------|---------------------|
| Processing Time | < 2s | ~1.5s |
| Merchant Accuracy | > 90% | TBD (needs benchmarking) |
| Amount Accuracy | > 95% | TBD |
| Date Accuracy | > 90% | TBD |
| Category Accuracy | > 75% | TBD |
| Overall Confidence | > 0.80 | ~0.85 (varies) |

---

## Support & Questions

For issues or questions:
1. Check logs: `backend/logs/ocr-service.log` (if logging configured)
2. Review correction stats to identify weak areas
3. Test with Python script directly: `python3 paddleocr_processor.py image.jpg`
4. Refer to master guide: `docs/AI_MASTER_GUIDE.md`

---

## 🔄 User Correction Feedback Pipeline (v1.8.0)

### Overview
v1.8.0 adds complete user correction capture and cross-environment training dataset generation for continuous learning.

### How It Works

**1. Frontend Captures Corrections**
```typescript
// When user edits OCR-extracted fields, system detects changes
// Automatically sends to: POST /api/ocr/v2/corrections
```

**2. Backend Stores with Metadata**
```typescript
// UserCorrectionService stores:
- Original OCR text & inference
- User corrections (merchant, amount, date, category)
- Environment tag (sandbox/production)
- LLM model version
- Confidence scores
```

**3. Cross-Environment Aggregation**
```typescript
// CrossEnvironmentSyncService aggregates:
- Sandbox corrections (testing data)
- Production corrections (real user data)
- Filters by quality score
- Exports to JSONL training datasets
```

**4. Export Training Data**
```bash
# Admin can export corrections for ML training
POST /api/training/sync/export
{
  "minQualityScore": 0.7,
  "includeSandbox": true,
  "includeProduction": true,
  "limit": 10000
}
```

### Database Schema (Migration 007)
```sql
-- Enhanced ocr_corrections table with:
- environment (sandbox/production)
- llm_model_version
- used_in_training
- training_dataset_id
- data_quality_score
- anonymized (privacy flag)
- correction_confidence_before/after
- synced_to_training
```

### API Endpoints
```bash
# Export dataset
POST /api/training/sync/export

# Get statistics
GET /api/training/sync/report

# View dataset
GET /api/training/sync/dataset/:id

# Mark as trained
POST /api/training/sync/mark-used/:id

# Anonymize
POST /api/training/sync/anonymize
```

### Files
- `UserCorrectionService.ts` - Stores corrections with metadata
- `CrossEnvironmentSyncService.ts` - ETL and dataset export
- `routes/trainingSync.ts` - Admin API endpoints
- `migrations/007_*.sql` - Enhanced schema

### Usage Example
```bash
# Check correction stats
curl http://sandbox/api/training/sync/report

# Export training dataset
curl -X POST http://sandbox/api/training/sync/export \
  -d '{"minQualityScore": 0.7, "limit": 1000}'

# Verify export
ls /opt/trade-show-app/training_data/dataset_*.jsonl
```

### Future (v1.9.0)
- Automated retraining workflows
- Prompt optimization based on corrections
- A/B testing of LLM models
- Real-time accuracy monitoring

---

**Last Updated:** October 16, 2025  
**Branch:** v1.6.0 (Sandbox - v1.8.0 Complete Pipeline Active)

