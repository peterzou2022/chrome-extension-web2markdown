import { sanitizeFilename, formatKnowledgeFilename } from './filename.js';
import { describe, it, expect } from 'vitest';

describe('sanitizeFilename', () => {
  it('replaces invalid chars with dash', () => {
    expect(sanitizeFilename('a/b\\c:d')).toBe('a-b-c-d');
  });

  it('collapses spaces', () => {
    expect(sanitizeFilename('a   b')).toBe('a b');
  });

  it('returns untitled for empty or whitespace-only input', () => {
    expect(sanitizeFilename('')).toBe('untitled');
    expect(sanitizeFilename('   ')).toBe('untitled');
  });

  it('truncates to 200 chars', () => {
    const long = 'a'.repeat(300);
    expect(sanitizeFilename(long).length).toBe(200);
  });
});

describe('formatKnowledgeFilename', () => {
  it('formats with date and title', () => {
    const d = new Date('2026-03-09T12:00:00Z');
    expect(formatKnowledgeFilename('测试标题', d)).toBe('2026-03-09-测试标题.md');
  });

  it('appends conflict suffix when provided', () => {
    const d = new Date('2026-03-09T12:00:00Z');
    expect(formatKnowledgeFilename('标题', d, '153045')).toBe('2026-03-09-标题-153045.md');
  });
});
