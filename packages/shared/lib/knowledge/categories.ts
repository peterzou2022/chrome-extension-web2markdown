/**
 * Primary categories (top-level knowledge directory names).
 * V1: fixed in code; UI only allows selecting from these.
 */
export const PRIMARY_CATEGORIES = [
  'SEO',
  'WEB_PROJECTS',
  'AI',
  'INVESTING',
  'READING',
  'SELF_MEDIA',
  'OTHERS',
] as const;

export type PrimaryCategory = (typeof PRIMARY_CATEGORIES)[number];

/**
 * Sub-categories per primary category.
 * Maps to second-level folder names under each primary.
 */
export const SUB_CATEGORIES: Record<PrimaryCategory, readonly string[]> = {
  SEO: [
    'SEO-Basics',
    'Keyword-Research',
    'Content-SEO',
    'Technical-SEO',
    'Link-Building',
    'SEO-Case-Studies',
    'SEO-Tools',
  ],
  WEB_PROJECTS: ['Active-Projects', 'Project-Ideas', 'Product-Research', 'Tech-Stack', 'Growth', 'Postmortems'],
  AI: ['AI-News', 'AI-Tools', 'AI-Products', 'AI-Prompts', 'AI-Agents', 'AI-Workflows', 'AI-Ideas'],
  INVESTING: ['Macro', 'Stocks', 'Crypto', 'Investment-Strategies', 'Investment-Ideas', 'Investment-Journal'],
  READING: ['Reading-List', 'Book-Notes', 'Quotes'],
  SELF_MEDIA: ['Content-Ideas', 'Content-Research', 'Drafts', 'Published', 'Growth'],
  OTHERS: ['Productivity', 'Learning', 'Life', 'Random'],
};

export type SubCategoryMap = {
  [K in PrimaryCategory]: (typeof SUB_CATEGORIES)[K][number];
};

/** Inbox is the fallback when category does not match. */
export const INBOX_PATH = 'Inbox';
