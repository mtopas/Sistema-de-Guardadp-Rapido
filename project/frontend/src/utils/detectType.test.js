import { describe, it, expect } from 'vitest';
import { detectType } from './detectType.js';

describe('detectType', () => {
  describe('URLs válidas http/https', () => {
    it('should detect http URL as link', () => {
      expect(detectType('http://example.com')).toBe('link');
    });

    it('should detect https URL as link', () => {
      expect(detectType('https://example.com')).toBe('link');
    });

    it('should detect https URL with path as link', () => {
      expect(detectType('https://example.com/path/to/page')).toBe('link');
    });

    it('should detect https URL with query params as link', () => {
      expect(detectType('https://example.com?foo=bar&baz=qux')).toBe('link');
    });

    it('should detect https URL with fragment as link', () => {
      expect(detectType('https://example.com#section')).toBe('link');
    });

    it('should detect https URL with port as link', () => {
      expect(detectType('https://example.com:8080/path')).toBe('link');
    });
  });

  describe('URLs con otros protocolos', () => {
    it('should detect ftp URL as texto', () => {
      expect(detectType('ftp://example.com')).toBe('texto');
    });

    it('should detect mailto URL as texto', () => {
      expect(detectType('mailto:test@example.com')).toBe('texto');
    });

    it('should detect file URL as texto', () => {
      expect(detectType('file:///path/to/file')).toBe('texto');
    });
  });

  describe('Texto plano', () => {
    it('should detect plain text as texto', () => {
      expect(detectType('plain text')).toBe('texto');
    });

    it('should detect text with special characters as texto', () => {
      expect(detectType('hello! @#$% world')).toBe('texto');
    });

    it('should detect text with numbers as texto', () => {
      expect(detectType('12345')).toBe('texto');
    });

    it('should detect empty string as texto', () => {
      expect(detectType('')).toBe('texto');
    });

    it('should detect single word as texto', () => {
      expect(detectType('word')).toBe('texto');
    });
  });

  describe('Espacios alrededor (trim)', () => {
    it('should trim spaces before detecting http URL', () => {
      expect(detectType('  http://example.com  ')).toBe('link');
    });

    it('should trim spaces before detecting https URL', () => {
      expect(detectType('\t\thttps://example.com\n\n')).toBe('link');
    });

    it('should trim spaces before detecting plain text', () => {
      expect(detectType('   plain text   ')).toBe('texto');
    });

    it('should handle only spaces as texto', () => {
      expect(detectType('    ')).toBe('texto');
    });
  });

  describe('URLs mal formadas', () => {
    it('should detect malformed URL as texto', () => {
      expect(detectType('https://')).toBe('texto');
    });

    it('should detect URL-like text without protocol as texto', () => {
      expect(detectType('example.com')).toBe('texto');
    });

    it('should detect www prefix without protocol as texto', () => {
      expect(detectType('www.example.com')).toBe('texto');
    });

    it('should detect URL with single slash as link (valid in JavaScript URL API)', () => {
      // JavaScript URL constructor accepts http:/host as a valid URL
      expect(detectType('http:/example.com')).toBe('link');
    });

    it('should detect empty protocol as texto', () => {
      expect(detectType('://example.com')).toBe('texto');
    });
  });
});
