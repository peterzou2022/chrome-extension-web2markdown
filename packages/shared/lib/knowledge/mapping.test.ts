import { getKnowledgePath, isValidCategory } from './mapping.js';
import { describe, it, expect } from 'vitest';

describe('getKnowledgePath', () => {
  it('returns correct path for AI + AI-News', () => {
    expect(getKnowledgePath('AI', 'AI-News')).toBe('03-AI/AI-News');
  });

  it('returns correct path for SEO + Technical-SEO', () => {
    expect(getKnowledgePath('SEO', 'Technical-SEO')).toBe('01-SEO/Technical-SEO');
  });

  it('returns Inbox for invalid subCategory', () => {
    expect(getKnowledgePath('AI', 'InvalidSub')).toBe('Inbox');
  });

  it('returns Inbox for subCategory not in primary', () => {
    expect(getKnowledgePath('AI', 'SEO-Basics')).toBe('Inbox');
  });
});

describe('isValidCategory', () => {
  it('returns true for valid pair', () => {
    expect(isValidCategory('AI', 'AI-News')).toBe(true);
    expect(isValidCategory('SEO', 'SEO-Tools')).toBe(true);
  });

  it('returns false for invalid sub', () => {
    expect(isValidCategory('AI', 'SEO-Basics')).toBe(false);
  });
});
