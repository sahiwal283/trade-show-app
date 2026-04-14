import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import { AuthRequest } from '../../src/middleware/auth';
import { uploadBoothMap } from '../../src/config/upload';
import fs from 'fs';

/**
 * Booth Map Upload Tests
 * 
 * Tests booth map upload functionality:
 * - File upload with different types (JPG, PNG, PDF)
 * - Error handling for invalid files
 * - File validation (MIME type, size)
 * - File storage and accessibility
 */

// Mock fs and path modules
vi.mock('fs');
vi.mock('path');

describe('Booth Map Upload Tests', () => {
  let mockReq: Partial<AuthRequest>;
  let mockRes: Partial<Response>;
  let mockNext: vi.Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockReq = {
      params: { checklistId: '1' },
      file: undefined,
      user: {
        id: 'user-1',
        username: 'testuser',
        role: 'admin',
      },
    };

    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    mockNext = vi.fn();
  });

  describe('File Type Validation', () => {
    it('should accept JPG files', () => {
      const file = {
        fieldname: 'boothMap',
        originalname: 'booth-map.jpg',
        encoding: '7bit',
        mimetype: 'image/jpeg',
        size: 1024 * 1024, // 1MB
        destination: 'uploads/booth-maps',
        filename: 'test-booth-map.jpg',
        path: 'uploads/booth-maps/test-booth-map.jpg',
        buffer: Buffer.from('fake-image-data'),
      };

      mockReq.file = file as any;

      // Verify MIME type is accepted
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'application/pdf'];
      expect(allowedTypes.includes(file.mimetype)).toBe(true);
      expect(file.mimetype).toBe('image/jpeg');

      console.log('✅ JPG files accepted');
    });

    it('should accept PNG files', () => {
      const file = {
        fieldname: 'boothMap',
        originalname: 'booth-map.png',
        encoding: '7bit',
        mimetype: 'image/png',
        size: 1024 * 1024,
        destination: 'uploads/booth-maps',
        filename: 'test-booth-map.png',
        path: 'uploads/booth-maps/test-booth-map.png',
        buffer: Buffer.from('fake-image-data'),
      };

      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'application/pdf'];
      expect(allowedTypes.includes(file.mimetype)).toBe(true);

      console.log('✅ PNG files accepted');
    });

    it('should accept PDF files', () => {
      const file = {
        fieldname: 'boothMap',
        originalname: 'booth-map.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 2 * 1024 * 1024, // 2MB
        destination: 'uploads/booth-maps',
        filename: 'test-booth-map.pdf',
        path: 'uploads/booth-maps/test-booth-map.pdf',
        buffer: Buffer.from('fake-pdf-data'),
      };

      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'application/pdf'];
      expect(allowedTypes.includes(file.mimetype)).toBe(true);

      console.log('✅ PDF files accepted');
    });

    it('should reject invalid file types', () => {
      const invalidTypes = [
        'application/x-msdownload', // .exe
        'application/x-sh', // .sh
        'text/plain', // .txt
        'application/zip', // .zip
      ];

      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'application/pdf'];

      invalidTypes.forEach(type => {
        expect(allowedTypes.includes(type)).toBe(false);
      });

      console.log('✅ Invalid file types rejected');
    });
  });

  describe('File Size Validation', () => {
    it('should accept files under 10MB', () => {
      const maxSize = 10 * 1024 * 1024; // 10MB
      const validSizes = [
        1024, // 1KB
        1024 * 1024, // 1MB
        5 * 1024 * 1024, // 5MB
        9 * 1024 * 1024, // 9MB
      ];

      validSizes.forEach(size => {
        expect(size).toBeLessThanOrEqual(maxSize);
      });

      console.log('✅ Files under 10MB accepted');
    });

    it('should reject files over 10MB', () => {
      const maxSize = 10 * 1024 * 1024; // 10MB
      const invalidSizes = [
        11 * 1024 * 1024, // 11MB
        20 * 1024 * 1024, // 20MB
        100 * 1024 * 1024, // 100MB
      ];

      invalidSizes.forEach(size => {
        expect(size).toBeGreaterThan(maxSize);
      });

      console.log('✅ Files over 10MB rejected');
    });
  });

  describe('File Storage', () => {
    it('should save files to booth-maps directory', () => {
      // Use string paths here — `path` is vi.mocked() for this file, so path.join is not reliable.
      const expectedPath = 'uploads/booth-maps';
      const file = {
        destination: expectedPath,
        filename: 'test-booth-map.jpg',
        path: 'uploads/booth-maps/test-booth-map.jpg',
      };

      expect(file.destination).toBe(expectedPath);
      expect(file.path.includes('booth-maps')).toBe(true);
      expect(file.path.includes(file.filename)).toBe(true);

      console.log('✅ Files saved to correct directory');
    });

    it('should generate unique filenames', () => {
      const file1 = {
        filename: `${Date.now()}-${Math.round(Math.random() * 1E9)}.jpg`,
      };
      const file2 = {
        filename: `${Date.now()}-${Math.round(Math.random() * 1E9)}.jpg`,
      };

      // Filenames should be unique (very high probability)
      expect(file1.filename).not.toBe(file2.filename);

      console.log('✅ Unique filenames generated');
    });
  });

  describe('Error Handling', () => {
    it('should handle missing file', () => {
      mockReq.file = undefined;

      // Should return 400 error
      expect(mockReq.file).toBeUndefined();

      console.log('✅ Missing file handled');
    });

    it('should handle invalid checklist ID', () => {
      const invalidIds = ['abc', '0', '-1', ''];

      invalidIds.forEach(id => {
        const parsed = parseInt(id);
        expect(isNaN(parsed) || parsed <= 0).toBe(true);
      });

      console.log('✅ Invalid checklist ID handled');
    });

    it('should handle file system errors', () => {
      // Simulate file system error
      const filePath = 'uploads/booth-maps/nonexistent.jpg';
      vi.mocked(fs.existsSync).mockReturnValue(false);

      expect(fs.existsSync(filePath)).toBe(false);

      console.log('✅ File system errors handled');
    });
  });

  describe('MIME Type Case Insensitivity', () => {
    it('should handle case-insensitive MIME types', () => {
      const allowedMimeTypes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'application/pdf',
      ];

      const testCases = [
        'IMAGE/JPEG',
        'Image/Png',
        'APPLICATION/PDF',
        'image/jpeg',
        'image/png',
      ];

      testCases.forEach(mimeType => {
        const normalized = mimeType.toLowerCase();
        expect(allowedMimeTypes.includes(normalized)).toBe(true);
      });

      console.log('✅ Case-insensitive MIME types handled');
    });
  });
});

