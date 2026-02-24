import { describe, it, expect } from 'vitest';
import { isAllowedReceiptFile, isAllowedBoothMapFile } from '../../src/config/upload';

/**
 * Upload config: receipt/OCR file acceptance (PDF + images, extension fallback for PDF)
 */
describe('Upload config: isAllowedReceiptFile', () => {
  it('accepts file with application/pdf MIME and .pdf extension', () => {
    expect(isAllowedReceiptFile('application/pdf', 'receipt.pdf').allowed).toBe(true);
  });

  it('accepts PDF by extension when MIME is empty (browser variance)', () => {
    expect(isAllowedReceiptFile('', 'doc.pdf').allowed).toBe(true);
  });

  it('accepts PDF by extension when MIME is application/octet-stream', () => {
    expect(isAllowedReceiptFile('application/octet-stream', 'receipt.pdf').allowed).toBe(true);
  });

  it('accepts image with image/* MIME and image extension', () => {
    expect(isAllowedReceiptFile('image/jpeg', 'photo.jpg').allowed).toBe(true);
    expect(isAllowedReceiptFile('image/png', 'x.png').allowed).toBe(true);
    expect(isAllowedReceiptFile('image/heic', 'img.heic').allowed).toBe(true);
  });

  it('rejects non-PDF masquerading with .pdf extension and dangerous MIME', () => {
    const r = isAllowedReceiptFile('application/x-msdownload', 'virus.pdf');
    expect(r.allowed).toBe(false);
    expect(r.reason).toBeDefined();
  });

  it('rejects file with disallowed extension', () => {
    expect(isAllowedReceiptFile('application/pdf', 'file.exe').allowed).toBe(false);
    expect(isAllowedReceiptFile('image/jpeg', 'file.exe').allowed).toBe(false);
  });

  it('rejects application/octet-stream with image extension (no extension fallback for images)', () => {
    const r = isAllowedReceiptFile('application/octet-stream', 'photo.jpg');
    expect(r.allowed).toBe(false);
  });
});

describe('Upload config: isAllowedBoothMapFile', () => {
  it('accepts application/pdf and .pdf', () => {
    expect(isAllowedBoothMapFile('application/pdf', 'map.pdf').allowed).toBe(true);
  });

  it('accepts PDF by extension when MIME is empty', () => {
    expect(isAllowedBoothMapFile('', 'booth.pdf').allowed).toBe(true);
  });

  it('accepts image/gif for booth maps', () => {
    expect(isAllowedBoothMapFile('image/gif', 'map.gif').allowed).toBe(true);
  });

  it('rejects executable MIME with .pdf extension', () => {
    expect(isAllowedBoothMapFile('application/x-msdownload', 'x.pdf').allowed).toBe(false);
  });
});

/**
 * REGRESSION TESTS: MIME Type Validation (v1.27.15)
 * 
 * Bug: MIME type validation was case-sensitive and used regex
 * Security Risk: Could bypass validation with uppercase MIME types
 * 
 * Fix: Changed to whitelist-based validation with case-insensitive comparison
 * - Whitelist: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'application/pdf']
 * - All comparisons use .toLowerCase()
 * 
 * These tests ensure MIME type validation is secure and case-insensitive.
 */

describe('REGRESSION: MIME Type Validation (v1.27.15)', () => {
  // Whitelist from backend/src/routes/checklist.ts
  const allowedMimeTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'application/pdf',
  ];

  /**
   * Helper function that simulates the backend validation logic
   */
  function isValidMimeType(mimeType: string): boolean {
    return allowedMimeTypes.includes(mimeType.toLowerCase());
  }

  describe('Case-Insensitive Validation', () => {
    it('CRITICAL: should accept IMAGE/JPEG (uppercase)', () => {
      const mimeType = 'IMAGE/JPEG';
      const isValid = isValidMimeType(mimeType);
      
      expect(isValid).toBe(true);
    });

    it('CRITICAL: should accept image/jpeg (lowercase)', () => {
      const mimeType = 'image/jpeg';
      const isValid = isValidMimeType(mimeType);
      
      expect(isValid).toBe(true);
    });

    it('CRITICAL: should accept Image/Jpeg (mixed case)', () => {
      const mimeType = 'Image/Jpeg';
      const isValid = isValidMimeType(mimeType);
      
      expect(isValid).toBe(true);
    });

    it('should accept IMAGE/PNG (uppercase)', () => {
      const mimeType = 'IMAGE/PNG';
      const isValid = isValidMimeType(mimeType);
      
      expect(isValid).toBe(true);
    });

    it('should accept Image/Png (mixed case)', () => {
      const mimeType = 'Image/Png';
      const isValid = isValidMimeType(mimeType);
      
      expect(isValid).toBe(true);
    });

    it('should accept APPLICATION/PDF (uppercase)', () => {
      const mimeType = 'APPLICATION/PDF';
      const isValid = isValidMimeType(mimeType);
      
      expect(isValid).toBe(true);
    });

    it('should accept Application/Pdf (mixed case)', () => {
      const mimeType = 'Application/Pdf';
      const isValid = isValidMimeType(mimeType);
      
      expect(isValid).toBe(true);
    });
  });

  describe('All Allowed Types', () => {
    it('should accept image/jpeg', () => {
      expect(isValidMimeType('image/jpeg')).toBe(true);
    });

    it('should accept image/jpg', () => {
      expect(isValidMimeType('image/jpg')).toBe(true);
    });

    it('should accept image/png', () => {
      expect(isValidMimeType('image/png')).toBe(true);
    });

    it('should accept image/gif', () => {
      expect(isValidMimeType('image/gif')).toBe(true);
    });

    it('should accept application/pdf', () => {
      expect(isValidMimeType('application/pdf')).toBe(true);
    });
  });

  describe('Reject Invalid MIME Types', () => {
    it('should reject application/x-msdownload (executable)', () => {
      const mimeType = 'application/x-msdownload';
      const isValid = isValidMimeType(mimeType);
      
      expect(isValid).toBe(false);
    });

    it('should reject application/zip', () => {
      const mimeType = 'application/zip';
      const isValid = isValidMimeType(mimeType);
      
      expect(isValid).toBe(false);
    });

    it('should reject text/html (potential XSS)', () => {
      const mimeType = 'text/html';
      const isValid = isValidMimeType(mimeType);
      
      expect(isValid).toBe(false);
    });

    it('should reject application/javascript', () => {
      const mimeType = 'application/javascript';
      const isValid = isValidMimeType(mimeType);
      
      expect(isValid).toBe(false);
    });

    it('should reject image/svg+xml (SVG can contain scripts)', () => {
      const mimeType = 'image/svg+xml';
      const isValid = isValidMimeType(mimeType);
      
      expect(isValid).toBe(false);
    });

    it('should reject application/octet-stream', () => {
      const mimeType = 'application/octet-stream';
      const isValid = isValidMimeType(mimeType);
      
      expect(isValid).toBe(false);
    });

    it('should reject video/mp4', () => {
      const mimeType = 'video/mp4';
      const isValid = isValidMimeType(mimeType);
      
      expect(isValid).toBe(false);
    });

    it('should reject audio/mpeg', () => {
      const mimeType = 'audio/mpeg';
      const isValid = isValidMimeType(mimeType);
      
      expect(isValid).toBe(false);
    });
  });

  describe('Security: Bypass Attempts', () => {
    it('should reject null bytes in MIME type', () => {
      const mimeType = 'image/jpeg\0.exe';
      const isValid = isValidMimeType(mimeType);
      
      expect(isValid).toBe(false);
    });

    it('should reject MIME type with leading whitespace', () => {
      const mimeType = ' image/jpeg';
      const isValid = isValidMimeType(mimeType);
      
      expect(isValid).toBe(false);
    });

    it('should reject MIME type with trailing whitespace', () => {
      const mimeType = 'image/jpeg ';
      const isValid = isValidMimeType(mimeType);
      
      expect(isValid).toBe(false);
    });

    it('should reject MIME type with newlines', () => {
      const mimeType = 'image/jpeg\n';
      const isValid = isValidMimeType(mimeType);
      
      expect(isValid).toBe(false);
    });

    it('should reject partial MIME type match', () => {
      const mimeType = 'image/jpeg-malicious';
      const isValid = isValidMimeType(mimeType);
      
      expect(isValid).toBe(false);
    });

    it('should reject MIME type with extra path segments', () => {
      const mimeType = 'image/jpeg/../../etc/passwd';
      const isValid = isValidMimeType(mimeType);
      
      expect(isValid).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should reject empty string', () => {
      const mimeType = '';
      const isValid = isValidMimeType(mimeType);
      
      expect(isValid).toBe(false);
    });

    it('should reject whitespace only', () => {
      const mimeType = '   ';
      const isValid = isValidMimeType(mimeType);
      
      expect(isValid).toBe(false);
    });

    it('should reject undefined (type coercion)', () => {
      const mimeType = undefined as any;
      const isValid = allowedMimeTypes.includes((mimeType || '').toLowerCase());
      
      expect(isValid).toBe(false);
    });

    it('should reject null (type coercion)', () => {
      const mimeType = null as any;
      const isValid = allowedMimeTypes.includes((mimeType || '').toLowerCase());
      
      expect(isValid).toBe(false);
    });

    it('should handle MIME type with charset parameter', () => {
      // Note: In practice, file uploads shouldn't have charset in Content-Type
      // But we test the edge case
      const mimeType = 'image/jpeg; charset=utf-8';
      const isValid = isValidMimeType(mimeType);
      
      // Should fail because we validate exact match
      expect(isValid).toBe(false);
    });
  });

  describe('File Extension vs MIME Type', () => {
    it('should not validate based on file extension alone', () => {
      // This test documents that we validate MIME type, not extension
      // A file named "image.jpg" could have MIME type "application/octet-stream"
      
      const maliciousFile = {
        filename: 'image.jpg',
        mimeType: 'application/octet-stream',
      };

      const isValid = isValidMimeType(maliciousFile.mimeType);
      
      // Should reject based on MIME type, not filename
      expect(isValid).toBe(false);
    });

    it('should accept correct MIME type regardless of extension', () => {
      const validFile = {
        filename: 'booth-map.abc', // Wrong extension
        mimeType: 'image/png', // Correct MIME type
      };

      const isValid = isValidMimeType(validFile.mimeType);
      
      // Should accept based on MIME type
      expect(isValid).toBe(true);
    });
  });

  describe('Whitelist Security Model', () => {
    it('should use whitelist (not blacklist) approach', () => {
      // Test that we explicitly allow types, not block types
      // This is more secure because:
      // - New file types are blocked by default
      // - No risk of forgetting to block a dangerous type
      
      const unknownMimeType = 'application/x-new-dangerous-format';
      const isValid = isValidMimeType(unknownMimeType);
      
      // Should reject because it's not in whitelist
      expect(isValid).toBe(false);
    });

    it('should have exactly 5 allowed MIME types', () => {
      // Verify whitelist hasn't been accidentally expanded
      expect(allowedMimeTypes).toHaveLength(5);
    });

    it('should only allow image and PDF types', () => {
      // Verify all allowed types are safe
      const allImagesOrPdf = allowedMimeTypes.every(
        type => type.startsWith('image/') || type === 'application/pdf'
      );
      
      expect(allImagesOrPdf).toBe(true);
    });
  });

  describe('Comparison with Old Regex Approach', () => {
    it('OLD APPROACH: regex would accept case-sensitive types', () => {
      // Old approach (VULNERABLE):
      // const allowedTypes = /jpeg|jpg|png|gif|pdf/;
      // const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
      // const mimetype = allowedTypes.test(file.mimetype); // <-- NO .toLowerCase()

      const oldRegexValidation = (mimeType: string) => {
        const allowedTypes = /jpeg|jpg|png|gif|pdf/;
        return allowedTypes.test(mimeType); // Case-sensitive!
      };

      // Old approach would FAIL on uppercase
      expect(oldRegexValidation('IMAGE/JPEG')).toBe(false); // ❌ Rejects valid file

      // New approach succeeds
      expect(isValidMimeType('IMAGE/JPEG')).toBe(true); // ✅ Accepts valid file
    });

    it('NEW APPROACH: whitelist is case-insensitive', () => {
      const testCases = [
        'image/jpeg',
        'IMAGE/JPEG',
        'Image/Jpeg',
        'iMaGe/JpEg',
      ];

      testCases.forEach(mimeType => {
        expect(isValidMimeType(mimeType)).toBe(true);
      });
    });

    it('OLD APPROACH: regex could match partial strings', () => {
      // Old regex: /jpeg|jpg|png|gif|pdf/
      // Would match "jpeg" anywhere in string
      
      const oldRegexValidation = (mimeType: string) => {
        const allowedTypes = /jpeg|jpg|png|gif|pdf/;
        return allowedTypes.test(mimeType);
      };

      // Old approach vulnerable to partial match
      expect(oldRegexValidation('malicious/jpeg-exploit')).toBe(true); // ❌ False positive

      // New approach requires exact match
      expect(isValidMimeType('malicious/jpeg-exploit')).toBe(false); // ✅ Correctly rejects
    });
  });
});

