/**
 * Sanitize a string for use as a filename (no path separators or reserved chars).
 */
const INVALID_CHARS = /[/\\:*?"<>|]/g;

export const sanitizeFilename = (title: string): string =>
  title.replace(INVALID_CHARS, '-').replace(/\s+/g, ' ').trim().slice(0, 200) || 'untitled';

/**
 * Format final filename: YYYY-MM-DD-sanitized-title.md, optional suffix for conflict.
 */
export const formatKnowledgeFilename = (title: string, date: Date = new Date(), conflictSuffix?: string): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const base = `${y}-${m}-${d}-${sanitizeFilename(title)}`;
  const suffix = conflictSuffix ? `-${conflictSuffix}` : '';
  return `${base}${suffix}.md`;
};
