"""
Eval harness for FieldInferenceEngine against real production corrections.

Usage (from the ocr-service directory):
    python3 -m eval.run_eval [--failures] [--field merchant|amount|date|category|cardLastFour]
    python3 eval/run_eval.py [--failures]

Each record in eval/corrections-eval.json contains raw OCR text plus
human-corrected field values. A non-null corrected_X is treated as ground
truth; a null corrected_X means the user accepted the original value
(unknown), so that field is skipped for that record.
"""

import argparse
import difflib
import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

EVAL_DIR = Path(__file__).resolve().parent
SERVICE_ROOT = EVAL_DIR.parent
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

DATA_PATH = EVAL_DIR / "corrections-eval.json"

FIELDS = ["merchant", "amount", "date", "category", "cardLastFour"]
CORRECTED_KEYS = {
    "merchant": "corrected_merchant",
    "amount": "corrected_amount",
    "date": "corrected_date",
    "category": "corrected_category",
    "cardLastFour": "corrected_card_last_four",
}

MIN_USABLE_TEXT_CHARS = 20


_MERCHANT_STOPWORDS = {"and", "the"}


def normalize_merchant(value: str) -> str:
    v = value.lower().strip()
    v = re.sub(r"[^a-z0-9 ]+", " ", v)
    # Light plural stemming so "Palmer Events Center" == "Palmer Event Center";
    # stopwords dropped so "Butcher & Thief" == "Butcher and Thief".
    tokens = [t[:-1] if len(t) > 3 and t.endswith("s") else t
              for t in v.split() if t not in _MERCHANT_STOPWORDS]
    return " ".join(tokens)


def merchant_match(expected: str, got: Optional[str]) -> bool:
    if not got:
        return False
    e, g = normalize_merchant(expected), normalize_merchant(got)
    if not e or not g:
        return False
    if e == g:
        return True
    # Fuzzy contains-match both directions ("Southwest" vs "Southwest Airlines"),
    # also space-stripped so OCR spacing artifacts ("saltlickbbq") still match.
    for a, b in ((e, g), (e.replace(" ", ""), g.replace(" ", ""))):
        if len(b) >= 4 and b in a:
            return True
        if len(a) >= 4 and a in b:
            return True
    # OCR near-miss tolerance ("Cafe Covote" vs "Cafe Cayote")
    return difflib.SequenceMatcher(None, e, g).ratio() >= 0.8


def amount_match(expected: float, got: Any) -> bool:
    if got is None:
        return False
    try:
        return abs(float(expected) - float(got)) < 0.005
    except (TypeError, ValueError):
        return False


def date_match(expected: str, got: Optional[str]) -> bool:
    if not got:
        return False
    return str(expected).strip()[:10] == str(got).strip()[:10]


def category_match(expected: str, got: Optional[str]) -> bool:
    if not got:
        return False
    return expected.strip().lower() == str(got).strip().lower()


MATCHERS = {
    "merchant": merchant_match,
    "amount": amount_match,
    "date": date_match,
    "category": category_match,
    "cardLastFour": lambda e, g: str(e).strip() == str(g or "").strip(),
}


def run(show_failures: bool = False, only_field: Optional[str] = None,
        engine_name: str = "current") -> Dict[str, Dict[str, int]]:
    if engine_name == "legacy":
        from eval.legacy_engine import legacy_field_inference_engine as engine
    else:
        from app.services.postprocess import field_inference_engine as engine

    records = json.loads(DATA_PATH.read_text())

    excluded = 0
    stats = {f: {"correct": 0, "total": 0} for f in FIELDS}
    failures: List[Dict[str, Any]] = []

    for idx, rec in enumerate(records):
        text = (rec.get("ocr_text") or "").strip()
        if len(text) < MIN_USABLE_TEXT_CHARS:
            excluded += 1
            continue

        inferred = engine.infer_fields(text, rec.get("ocr_confidence") or 0.8)

        for field in FIELDS:
            if only_field and field != only_field:
                continue
            expected = rec.get(CORRECTED_KEYS[field])
            if expected is None:
                continue
            got = (inferred.get(field) or {}).get("value")
            ok = MATCHERS[field](expected, got)
            stats[field]["total"] += 1
            if ok:
                stats[field]["correct"] += 1
            else:
                failures.append({
                    "idx": idx,
                    "field": field,
                    "expected": expected,
                    "got": got,
                    "snippet": text[:220].replace("\n", " | "),
                })

    print(f"\nEngine: {engine_name}")
    print(f"Records: {len(records)}  (excluded as unusable: {excluded})")
    print(f"{'field':<14}{'correct':>8}{'total':>8}{'accuracy':>10}")
    for field in FIELDS:
        s = stats[field]
        if s["total"] == 0:
            print(f"{field:<14}{'-':>8}{'-':>8}{'n/a':>10}")
            continue
        acc = s["correct"] / s["total"]
        print(f"{field:<14}{s['correct']:>8}{s['total']:>8}{acc:>9.1%}")

    if show_failures:
        print(f"\n--- {len(failures)} failures ---")
        for f in failures:
            print(f"\n[{f['idx']}] {f['field']}: expected={f['expected']!r} got={f['got']!r}")
            print(f"    text: {f['snippet']}")

    return stats


def main() -> None:
    parser = argparse.ArgumentParser(description="Score field_inference_engine against corrections")
    parser.add_argument("--failures", action="store_true", help="dump mismatches")
    parser.add_argument("--field", choices=FIELDS, default=None, help="limit to one field")
    parser.add_argument("--engine", choices=["current", "legacy"], default="current",
                        help="legacy = original engine (baseline)")
    args = parser.parse_args()

    import logging
    logging.disable(logging.CRITICAL)  # extraction logging drowns out the report

    run(show_failures=args.failures, only_field=args.field, engine_name=args.engine)


if __name__ == "__main__":
    main()
