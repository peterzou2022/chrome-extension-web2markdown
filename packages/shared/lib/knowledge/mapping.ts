import { SUB_CATEGORIES, INBOX_PATH } from './categories.js';
import type { PrimaryCategory } from './categories.js';

/**
 * Default mapping from primary category to knowledge root folder name.
 * Used when user has not customized the directory structure via options.
 */
export const DEFAULT_PRIMARY_TO_DIR: Record<PrimaryCategory, string> = {
  SEO: '01-SEO',
  WEB_PROJECTS: '02-Web-Projects',
  AI: '03-AI',
  INVESTING: '04-Investing',
  READING: '05-Reading',
  SELF_MEDIA: '06-SelfMedia',
  OTHERS: '07-Others',
};

/**
 * Returns knowledge path segment for the given category pair using default mapping only.
 * e.g. "03-AI/AI-News". Returns "Inbox" when invalid or unmapped.
 *
 * This function preserves the original behaviour and is used in unit tests.
 */
export const getKnowledgePath = (primary: PrimaryCategory, subCategory: string): string => {
  const subs = SUB_CATEGORIES[primary];
  if (!subs || !subs.includes(subCategory)) {
    return INBOX_PATH;
  }
  const root = DEFAULT_PRIMARY_TO_DIR[primary];
  return `${root}/${subCategory}`;
};

/**
 * Checks if the given primary + subCategory pair is valid.
 */
export const isValidCategory = (primary: PrimaryCategory, subCategory: string): boolean => {
  const subs = SUB_CATEGORIES[primary];
  return Boolean(subs?.includes(subCategory));
};
