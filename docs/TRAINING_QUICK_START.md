# 🚀 OCR AI Training - Quick Start

## 📖 **TL;DR**

The system **learns automatically** from every correction you make. No manual training needed!

---

## 🎯 **How It Works (Simple Version)**

```
1. Upload Receipt
   ↓
2. OCR Extracts Fields (with warnings if suspicious)
   ↓
3. You Correct Any Mistakes
   ↓
4. System Stores Your Correction
   ↓
5. After 3+ Identical Corrections → Pattern Learned
   ↓
6. Next Similar Receipt → Automatically Correct!
```

---

## 🔍 **Example: Teaching Uber Recognition**

### **Day 1:**
```
Receipt: "YOUR RIDE TO 6000 N TERMINAL PKWY..."
OCR Extracts: Merchant = "YOUR RIDE TO 6000 N TERMINAL..." ❌
⚠️ Warning: "Contains transaction description keywords"
You Fix: Merchant = "Uber" ✅
System Stores: Correction #1
```

### **Day 2:**
```
Receipt: "YOUR RIDE TO 3049 LAS VEGAS BLVD..."
OCR Extracts: Merchant = "YOUR RIDE TO 3049 LAS VEGAS..." ❌
You Fix: Merchant = "Uber" ✅
System Stores: Correction #2
```

### **Day 3:**
```
Receipt: "Trip with Richard, Pickup 7:14 AM..."
OCR Extracts: Merchant = "Trip with Richard, Pickup 7:14..." ❌
You Fix: Merchant = "Uber" ✅
System Stores: Correction #3

🎉 PATTERN LEARNED!
Pattern: /your ride|trip with|pickup/i → "Uber" (confidence: 0.91)
```

### **Day 4 onwards:**
```
Receipt: "YOUR RIDE TO DOWNTOWN ATLANTA..."
OCR Auto-Corrects: Merchant = "Uber" ✅ (learned pattern)
✨ No correction needed!
```

---

## 📊 **View Training Progress**

### **Simple Check (Browser Console)**
After uploading a receipt, check console:
```javascript
[OCR v2] Response: {...}
[AdaptiveEngine] Applying learned pattern: "Uber" (freq: 15)
```

### **Detailed Stats (API)**
```bash
# View all learned patterns
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://sandbox/api/training/patterns

# Response shows what the AI has learned:
{
  "patterns": [
    {
      "field": "merchant",
      "pattern": { "original": "YOUR RIDE TO...", "corrected": "Uber" },
      "frequency": 15,  ← Learned from 15 corrections
      "learnedConfidence": 0.95  ← High confidence!
    }
  ]
}
```

---

## ✅ **Best Practices**

### **DO:**
- ✅ Always correct obvious mistakes
- ✅ Use consistent merchant names ("Uber", not "uber" or "UBER")
- ✅ Select the correct category from dropdown
- ✅ Verify dates and amounts before submitting

### **DON'T:**
- ❌ Skip corrections ("it's close enough")
- ❌ Use different names for same merchant (Uber vs Uber Technologies)
- ❌ Correct fields that are already accurate
- ❌ Leave partial/incomplete information

---

## 🎯 **Quick Metrics**

**How many corrections until AI learns?**
- **Minimum:** 3 identical corrections
- **Optimal:** 5-10 corrections (higher confidence)
- **Maximum benefit:** 20+ corrections (97%+ confidence)

**How fast does learning happen?**
- **Storage:** Instant (when you click "Create Expense")
- **Pattern refresh:** Every 24 hours
- **Immediate effect:** Force refresh via API (developer only)

**Current accuracy rates:**
| Field | Before Learning | After Learning (Target) |
|-------|----------------|------------------------|
| Merchant | ~65% | 85%+ |
| Amount | ~84% | 95%+ |
| Date | ~91% | 95%+ |
| Category | ~62% | 75%+ |

---

## 🔧 **Advanced: Manual Analysis**

For developers wanting deeper insights:

```bash
cd backend

# Analyze last 30 days of corrections
ts-node scripts/retrain_from_corrections.ts

# See what patterns exist
ts-node scripts/retrain_from_corrections.ts --days=60 --min-corrections=5

# Output shows:
# - Most corrected fields
# - Common misread patterns
# - Suggested code improvements
```

---

## 📈 **Monitoring Dashboard** (Coming Soon)

Future versions will include:
- Real-time accuracy charts
- Per-merchant learning curves
- User contribution leaderboard
- Pattern effectiveness scores

---

## 💡 **Pro Tips**

1. **Uber/Lyft receipts** - Always correct to just "Uber" or "Lyft", not the full ride description

2. **Hotel chains** - Use brand name only: "Marriott", "Hilton" (not "Marriott Residence Inn #1234")

3. **Coffee shops** - Correct to "Starbucks", not "STARBUCKS COFFEE #3456"

4. **Multiple amounts** - Always choose the TOTAL (bottom-right on most receipts)

5. **Dates** - Watch for year misreads (2024 vs 2025)

---

## 🐛 **Troubleshooting**

**Q: I've corrected Uber 5 times, why isn't it learning?**
- Check: Did you correct to exactly "Uber" each time? Consistency matters!
- Check: Has 24 hours passed since first correction? (patterns refresh daily)
- Solution: Force refresh via `/api/training/refresh` (developer only)

**Q: How do I know if a pattern is learned?**
- Check backend logs: `[AdaptiveEngine] Applying learned pattern: "Uber"`
- Or use API: `GET /api/training/patterns`

**Q: Can I delete a learned pattern?**
- Currently: No automatic deletion
- Workaround: Patterns naturally decay if original misread stops appearing
- Future: Pattern management UI

---

**Ready to start?** Just upload receipts and correct any mistakes - the AI does the rest! 🚀


