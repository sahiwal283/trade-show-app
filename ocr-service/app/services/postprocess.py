"""
Postprocessing and Field Inference - FALLBACK ONLY

⚠️ IMPORTANT: This module is now used as FALLBACK ONLY when LLM extraction fails.

Primary extraction flow: OCR → LLM (direct extraction)
Fallback flow: OCR → LLM fails → Rule-based (this module)

This module extracts structured fields from OCR text using regex patterns and 
rule-based inference. It is only called when:
1. LLM extraction is disabled (ENABLE_LLM_INFERENCE=false)
2. LLM extraction fails (timeout, error, etc.)
3. LLM provider is unavailable

The `suggest_categories()` method is still used for category suggestions as a 
supplementary feature, but field extraction should always use LLM first.

Migrated from Expense App RuleBasedInferenceEngine.
"""

import re
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime

from app.utils.logger import setup_logger

logger = setup_logger(__name__)


def _keyword_matches_in_text(text_lower: str, keyword: str) -> bool:
    """
    Match a category keyword as a whole word/phrase to avoid false positives
    (e.g. 'gas' matching inside 'Las Vegas', 'mobil' inside 'mobile').
    """
    kw = keyword.strip().lower()
    if not kw:
        return False
    if " " in kw or "-" in kw:
        return kw in text_lower
    return bool(re.search(rf"(?<![a-z0-9]){re.escape(kw)}(?![a-z0-9])", text_lower))


class FieldInferenceEngine:
    """
    Extract structured fields from OCR text
    
    Supported fields:
    - merchant: Business name
    - amount: Transaction total
    - date: Transaction date
    - cardLastFour: Last 4 digits of payment card
    - category: Expense category
    - location: Address/location
    - taxAmount: Tax amount
    - tipAmount: Tip/gratuity amount
    """
    
    # Category keywords with weights
    CATEGORY_KEYWORDS = {
        'Booth / Marketing / Tools': {
            'keywords': ['booth', 'display', 'banner', 'signage', 'marketing', 'promotion', 'brochure', 'flyer', 'tools', 'equipment'],
            'weight': 1.0
        },
        'Travel - Flight': {
            'keywords': ['airline', 'airways', 'flight', 'aviation', 'airport', 'boarding', 'departure', 'arrival'],
            'weight': 1.0
        },
        'Accommodation - Hotel': {
            'keywords': ['hotel', 'motel', 'inn', 'resort', 'marriott', 'hilton', 'hyatt', 'holiday inn', 'best western', 'lodging', 'accommodation', 'night', 'stay'],
            'weight': 1.0
        },
        'Transportation - Uber / Lyft / Others': {
            'keywords': ['uber', 'uberx', 'lyft', 'taxi', 'cab', 'rideshare', 'ride-share', 'ride with', 'transport', 'your ride', 'trip with', 'pickup', 'drop-off', 'dropoff', 'driver'],
            'weight': 1.0
        },
        'Parking Fees': {
            'keywords': ['parking', 'parked', 'valet', 'parking garage', 'parking fee', 'park fee'],
            'weight': 1.0
        },
        'Rental - Car / U-haul': {
            'keywords': ['rental', 'hertz', 'enterprise', 'avis', 'budget', 'u-haul', 'uhaul', 'car hire', 'vehicle rental'],
            'weight': 1.0
        },
        'Meal and Entertainment': {
            'keywords': [
                'restaurant', 'cafe', 'coffee', 'diner', 'bistro', 'grill', 'kitchen', 'bar', 'pub',
                'food', 'dining', 'breakfast', 'lunch', 'dinner', 'meal', 'entertainment',
                'bagel', 'deli', 'bakery', 'cappuccino', 'espresso', 'sandwich', 'catering',
                'starbucks',
            ],
            'weight': 1.0
        },
        'Gas / Fuel': {
            'keywords': ['gas', 'fuel', 'gasoline', 'diesel', 'petrol', 'shell', 'bp', 'exxon', 'chevron', 'mobil'],
            'weight': 1.0
        },
        'Show Allowances - Per Diem': {
            'keywords': ['per diem', 'allowance', 'daily allowance', 'show allowance'],
            'weight': 1.0
        },
        'Model': {
            'keywords': ['model', 'talent', 'contractor', 'appearance'],
            'weight': 1.0
        },
        'Shipping Charges': {
            'keywords': ['shipping', 'freight', 'delivery', 'courier', 'fedex', 'ups', 'usps', 'dhl'],
            'weight': 1.0
        },
        'Other': {
            'keywords': ['misc', 'miscellaneous', 'other'],
            'weight': 0.5
        }
    }
    
    def infer_fields(self, ocr_text: str, ocr_confidence: float) -> Dict[str, Any]:
        """
        Extract all fields from OCR text - FALLBACK ONLY
        
        ⚠️ This method is only called when LLM extraction fails or is disabled.
        It should NOT be called directly from the OCR route. The normal flow is:
        OCR → LLM extraction → (fallback to this only if LLM fails)
        
        Called from: `llm_enhancement._fallback_to_rule_based()`
        
        Args:
            ocr_text: Raw OCR text
            ocr_confidence: OCR confidence score (0-1)
        
        Returns:
            Dictionary with inferred fields
        """
        logger.warning("Using rule-based field inference (FALLBACK - LLM extraction failed or disabled)")
        logger.info("Starting field inference...")
        
        lines = [line.strip() for line in ocr_text.split('\n') if line.strip()]
        text_lower = ocr_text.lower()
        
        return {
            'merchant': self._extract_merchant(lines, ocr_confidence),
            'amount': self._extract_amount(ocr_text, text_lower, ocr_confidence),
            'date': self._extract_date(ocr_text, ocr_confidence),
            'cardLastFour': self._extract_card_last_four(ocr_text, ocr_confidence),
            'category': self._predict_category(text_lower, ocr_confidence),
            'location': self._extract_location(ocr_text, ocr_confidence),
            'taxAmount': self._extract_tax_amount(ocr_text, ocr_confidence),
            'tipAmount': self._extract_tip_amount(ocr_text, ocr_confidence)
        }
    
    def suggest_categories(self, ocr_text: str, ocr_confidence: float, top_n: int = 3) -> List[Dict[str, Any]]:
        """
        Suggest multiple possible categories
        
        Note: This method is still actively used for category suggestions as a 
        supplementary feature alongside LLM extraction. It provides rule-based 
        category suggestions that complement LLM-extracted categories.
        
        Args:
            ocr_text: Raw OCR text
            ocr_confidence: OCR confidence score
            top_n: Number of suggestions to return
        
        Returns:
            List of category suggestions with confidence scores
        """
        text_lower = ocr_text.lower()
        suggestions = []
        
        for category, data in self.CATEGORY_KEYWORDS.items():
            keywords = data['keywords']
            weight = data['weight']
            
            matched_keywords = [kw for kw in keywords if _keyword_matches_in_text(text_lower, kw)]
            
            if matched_keywords:
                match_score = len(matched_keywords) / len(keywords)
                confidence = min((0.5 + match_score * 0.4) * weight * ocr_confidence, 0.95)
                
                suggestions.append({
                    'category': category,
                    'confidence': round(confidence, 4),
                    'keywords': matched_keywords,
                    'source': 'rule-based'
                })
        
        # Sort by confidence and return top N
        suggestions.sort(key=lambda x: x['confidence'], reverse=True)
        return suggestions[:top_n]
    
    def _extract_merchant(self, lines: List[str], ocr_confidence: float) -> Dict[str, Any]:
        """Extract merchant name (usually first substantial line)"""
        full_text = ' '.join(lines).lower()
        
        # Check for known brands FIRST (more specific, higher confidence)
        known_merchants = [
            # Rideshare (CHECK THESE FIRST!)
            (r'\blyft\b', 'Lyft', 0.95),
            (r'\buberx?\b', 'Uber', 0.95),
            (r'siegel', "Siegel's Bagelmania", 0.90),
            (r'bagelmania', "Siegel's Bagelmania", 0.92),
            # Car rental
            (r'\bhertz\b', 'Hertz', 0.95),
            (r'\benterprise\b', 'Enterprise', 0.95),
            (r'\bavis\b', 'Avis', 0.95),
            (r'\bbudget\b', 'Budget', 0.95),
            # Food/Coffee
            (r'\bstarbucks\b', 'Starbucks', 0.95),
            (r'\bmcdonalds?\b', 'McDonalds', 0.95),
            (r'\bsubway\b', 'Subway', 0.95),
            (r'\bchipotle\b', 'Chipotle', 0.95),
            # Retail
            (r'\bwalmart\b', 'Walmart', 0.95),
            (r'\btarget\b', 'Target', 0.95),
            (r'\bcostco\b', 'Costco', 0.95),
            # Hotels
            (r'\bmarriott\b', 'Marriott', 0.95),
            (r'\bhilton\b', 'Hilton', 0.95),
            (r'\bhyatt\b', 'Hyatt', 0.95),
        ]
        
        for pattern, name, confidence in known_merchants:
            if re.search(pattern, full_text):
                logger.info(f"Merchant: {name} (known brand)")
                return {
                    'value': name,
                    'confidence': confidence,
                    'source': 'inference'
                }
        
        # If no brand found, check for ride-sharing phrases (when brand isn't explicitly shown)
        rideshare_patterns = [
            (r'your ride to', 'Uber', 0.85),  # Lower confidence since no explicit brand
            (r'trip with uber', 'Uber', 0.95),
            (r'uber trip', 'Uber', 0.95),
            (r'trip with lyft', 'Lyft', 0.95),
            (r'lyft trip', 'Lyft', 0.95),
            (r'your lyft', 'Lyft', 0.90),
            (r'your trip with noel', 'Lyft', 0.85),  # Lyft driver patterns
        ]
        
        for pattern, name, confidence in rideshare_patterns:
            if re.search(pattern, full_text):
                logger.info(f"Merchant: {name} (rideshare pattern: {pattern})")
                return {
                    'value': name,
                    'confidence': confidence,
                    'source': 'inference'
                }
        
        # Fall back: Extract merchant name from phrases like "Thanks for booking with X"
        booking_patterns = [
            r'(?:thanks for booking with|booking with)\s+([A-Z][a-z]+)',
            r'(?:your reservation at|reservation at)\s+([A-Z][a-z]+)',
            r'(?:welcome to|visit us at)\s+([A-Z][a-z]+)'
        ]
        
        for pattern in booking_patterns:
            match = re.search(pattern, ' '.join(lines), re.IGNORECASE)
            if match:
                merchant_name = match.group(1)
                logger.info(f"Merchant: {merchant_name} (extracted from booking phrase)")
                return {
                    'value': merchant_name,
                    'confidence': 0.85,
                    'source': 'inference'
                }
        
        # Last resort: Look for capitalized words that might be business names
        # Skip common words and focus on proper nouns
        skip_words = {'thanks', 'please', 'thank', 'you', 'receipt', 'total', 'date', 'time'}
        for line in lines[:5]:
            words = line.split()
            for word in words:
                cleaned = re.sub(r'[^\w]', '', word)
                if (len(cleaned) > 3 and 
                    cleaned[0].isupper() and 
                    cleaned.lower() not in skip_words):
                    logger.info(f"Merchant: {cleaned} (capitalized word)")
                    return {
                        'value': cleaned,
                        'confidence': round(0.70 * ocr_confidence, 4),
                        'source': 'inference'
                    }
        
        return {'value': None, 'confidence': 0, 'source': 'inference'}
    
    def _extract_amount(self, text: str, text_lower: str, ocr_confidence: float) -> Dict[str, Any]:
        """Extract transaction amount"""
        patterns = [
            # (?<![a-z]) avoids matching the "total" inside "Subtotal".
            (r'(?:grand[\s]+)?(?<![a-z])total[\s:]*(?:\$|USD)?\s*(\d{1,3}(?:,\d{3})*(?:[.,]\d{2})?)', 0.98),
            (r'(?<![a-z])total\b[\s:]*(?:\$|USD)?\s*(\d{1,3}(?:,\d{3})*(?:[.,]\d{2})?)', 0.96),
            (r'balance(?:\s+due)?[\s:]*(?:\$|USD)?\s*(\d{1,3}(?:,\d{3})*(?:[.,]\d{2})?)', 0.94),
            (r'amount[\s]*(?:due|paid|charged)?[\s:]*(?:\$|USD)?\s*(\d{1,3}(?:,\d{3})*(?:[.,]\d{2})?)', 0.92),
            (r'(?:\$|USD)\s*(\d{1,3}(?:,\d{3})*\.\d{2})\b', 0.70),
        ]
        
        best_match = None
        best_confidence = 0.0
        weak_candidates: List[float] = []
        
        for pattern, pattern_conf in patterns:
            matches = re.finditer(pattern, text, re.I)
            for match in matches:
                amount_str = match.group(1)
                amount = self._normalize_amount(amount_str)
                
                if amount and 0.01 <= amount <= 100000:
                    confidence = min(pattern_conf * ocr_confidence, 0.98)
                    if pattern_conf >= 0.90:
                        if confidence > best_confidence:
                            best_confidence = confidence
                            best_match = {'value': amount, 'confidence': round(confidence, 4), 'source': 'inference'}
                    else:
                        weak_candidates.append(amount)
        
        if best_match:
            logger.info(f"Amount: ${best_match['value']:.2f} (confidence: {best_match['confidence']})")
            return best_match
        
        if weak_candidates:
            # Without a labeled total line, prefer the largest plausible amount (totals are usually largest).
            amount = max(weak_candidates)
            confidence = min(0.70 * ocr_confidence, 0.75)
            best_match = {'value': amount, 'confidence': round(confidence, 4), 'source': 'inference'}
            logger.info(f"Amount (largest $ match): ${best_match['value']:.2f} (confidence: {best_match['confidence']})")
            return best_match
        
        return {'value': None, 'confidence': 0, 'source': 'inference'}
    
    def _normalize_amount(self, amount_str: str) -> Optional[float]:
        """Normalize amount string to float"""
        try:
            normalized = amount_str.replace(' ', '')
            
            # European format: 1.234,56 -> 1234.56
            if re.match(r'\d+\.\d{3},\d{2}', normalized):
                normalized = normalized.replace('.', '').replace(',', '.')
            # Comma decimal: 123,45 -> 123.45
            elif re.match(r'^\d+,\d{2}$', normalized):
                normalized = normalized.replace(',', '.')
            # US format: 1,234.56
            else:
                normalized = normalized.replace(',', '')
            
            return float(normalized)
        except:
            return None
    
    def _extract_date(self, text: str, ocr_confidence: float) -> Dict[str, Any]:
        """Extract and normalize date to ISO format"""
        patterns = [
            (r'(\d{4}[-/]\d{1,2}[-/]\d{1,2})', 0.98, 'ISO'),
            (r'(?:date|on|dated)[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{4})', 0.95, 'MM/DD/YYYY'),
            (r'(\d{1,2}[-/]\d{1,2}[-/]\d{4})', 0.90, 'MM/DD/YYYY'),
            (r'((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})', 0.98, 'Month DD, YYYY'),
        ]
        
        for pattern, pattern_conf, date_format in patterns:
            match = re.search(pattern, text, re.I)
            if match:
                raw_date = match.group(1)
                normalized = self._normalize_date(raw_date, date_format)
                
                if normalized:
                    confidence = min(pattern_conf * ocr_confidence, 0.98)
                    logger.info(f"Date: {raw_date} -> {normalized}")
                    return {
                        'value': normalized,
                        'confidence': round(confidence, 4),
                        'source': 'inference'
                    }
        
        return {'value': None, 'confidence': 0, 'source': 'inference'}
    
    def _normalize_date(self, date_str: str, date_format: str) -> Optional[str]:
        """Normalize date to ISO format (YYYY-MM-DD)"""
        month_map = {
            'jan': '01', 'january': '01', 'feb': '02', 'february': '02',
            'mar': '03', 'march': '03', 'apr': '04', 'april': '04',
            'may': '05', 'jun': '06', 'june': '06',
            'jul': '07', 'july': '07', 'aug': '08', 'august': '08',
            'sep': '09', 'september': '09', 'oct': '10', 'october': '10',
            'nov': '11', 'november': '11', 'dec': '12', 'december': '12'
        }
        
        try:
            if date_format == 'ISO':
                parts = re.split(r'[-/]', date_str)
                return f"{parts[0]}-{parts[1].zfill(2)}-{parts[2].zfill(2)}"
            
            if date_format == 'MM/DD/YYYY':
                parts = re.split(r'[-/]', date_str)
                return f"{parts[2]}-{parts[0].zfill(2)}-{parts[1].zfill(2)}"
            
            if 'Month' in date_format:
                match = re.match(r'([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})', date_str, re.I)
                if match:
                    month_str, day, year = match.groups()
                    month = month_map.get(month_str.lower())
                    if month:
                        return f"{year}-{month}-{day.zfill(2)}"
            
            return None
        except:
            return None
    
    def _extract_card_last_four(self, text: str, ocr_confidence: float) -> Dict[str, Any]:
        """Extract last 4 digits of payment card"""
        patterns = [
            (r'\*+(\d{4})', 0.9),
            (r'x{4,}(\d{4})', 0.9),
            (r'ending\s+(?:in\s+)?(\d{4})', 0.95),
            (r'(?:visa|mastercard|amex|discover)\s+\*+(\d{4})', 1.0),
        ]
        
        for pattern, pattern_conf in patterns:
            match = re.search(pattern, text, re.I)
            if match:
                last_four = match.group(1)
                confidence = min(pattern_conf * ocr_confidence, 0.98)
                logger.info(f"Card: ****{last_four}")
                return {
                    'value': last_four,
                    'confidence': round(confidence, 4),
                    'source': 'inference'
                }
        
        return {'value': None, 'confidence': 0, 'source': 'inference'}
    
    def _predict_category(self, text_lower: str, ocr_confidence: float) -> Dict[str, Any]:
        """Predict expense category"""
        best_match = None
        best_confidence = 0
        
        for category, data in self.CATEGORY_KEYWORDS.items():
            keywords = data['keywords']
            weight = data['weight']
            
            matched_keywords = [kw for kw in keywords if _keyword_matches_in_text(text_lower, kw)]
            
            if matched_keywords:
                match_score = len(matched_keywords) / len(keywords)
                confidence = min((0.5 + match_score * 0.4) * weight * ocr_confidence, 0.95)
                
                if confidence > best_confidence:
                    best_confidence = confidence
                    best_match = {
                        'value': category,
                        'confidence': round(confidence, 4),
                        'source': 'inference'
                    }
        
        if best_match:
            logger.info(f"Category: {best_match['value']} (confidence: {best_match['confidence']})")
            return best_match
        
        return {'value': None, 'confidence': 0, 'source': 'inference'}
    
    def _extract_location(self, text: str, ocr_confidence: float) -> Dict[str, Any]:
        """Extract location/address"""
        patterns = [
            (r'[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z]{2}\s*\d{5}(?:-\d{4})?', 0.95),
            (r'[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z]{2}\b', 0.85),
        ]
        
        for pattern, pattern_conf in patterns:
            match = re.search(pattern, text)
            if match:
                location = match.group(0).strip()
                confidence = min(pattern_conf * ocr_confidence, 0.98)
                logger.info(f"Location: {location}")
                return {
                    'value': location,
                    'confidence': round(confidence, 4),
                    'source': 'inference'
                }
        
        return {'value': None, 'confidence': 0, 'source': 'inference'}
    
    def _extract_tax_amount(self, text: str, ocr_confidence: float) -> Dict[str, Any]:
        """Extract tax amount"""
        patterns = [
            r'tax[\s:]*\$?\s*(\d+[.,]\d{2})',
            r'sales\s+tax[\s:]*\$?\s*(\d+[.,]\d{2})'
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text, re.I)
            if match:
                amount = float(match.group(1).replace(',', '.'))
                if 0 <= amount <= 10000:
                    confidence = min(0.85 * ocr_confidence, 0.90)
                    return {
                        'value': amount,
                        'confidence': round(confidence, 4),
                        'source': 'inference'
                    }
        
        return {'value': None, 'confidence': 0, 'source': 'inference'}
    
    def _extract_tip_amount(self, text: str, ocr_confidence: float) -> Dict[str, Any]:
        """Extract tip/gratuity amount"""
        patterns = [
            r'tip[\s:]*\$?\s*(\d+[.,]\d{2})',
            r'gratuity[\s:]*\$?\s*(\d+[.,]\d{2})'
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text, re.I)
            if match:
                amount = float(match.group(1).replace(',', '.'))
                if 0 <= amount <= 10000:
                    confidence = min(0.85 * ocr_confidence, 0.90)
                    return {
                        'value': amount,
                        'confidence': round(confidence, 4),
                        'source': 'inference'
                    }
        
        return {'value': None, 'confidence': 0, 'source': 'inference'}


# Singleton instance
field_inference_engine = FieldInferenceEngine()

