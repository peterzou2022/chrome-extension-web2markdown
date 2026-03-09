/**
 * Extract article metadata and body from the page document.
 * Intended to run in a content script (has DOM access).
 * Does not send full HTML; only extracted text and meta.
 */

import type { ExtractedPageInfo } from './types.js';

const getMetaContent = (doc: Document, names: string[]): string => {
  const meta = doc.querySelector(names.map(n => `meta[name="${n}"], meta[property="${n}"]`).join(', '));
  return (meta?.getAttribute('content') ?? '').trim();
};

const NOISE_SELECTORS = [
  'script',
  'style',
  'noscript',
  'iframe',
  'nav',
  'aside',
  'header',
  'footer',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '.sidebar',
  '#sidebar',
  '.side-bar',
  '.nav',
  '.navigation',
  '.menu',
  '.toc',
  '.table-of-contents',
  '.breadcrumb',
  '.breadcrumbs',
  '.comments',
  '#comments',
  '.comment-list',
  '.related-posts',
  '.related-articles',
  '.share',
  '.social-share',
  '.ad',
  '.ads',
  '.advertisement',
];

const getCleanInnerText = (el: HTMLElement): string => {
  const clone = el.cloneNode(true) as HTMLElement;
  for (const sel of NOISE_SELECTORS) {
    clone.querySelectorAll(sel).forEach(n => n.remove());
  }
  return clone.innerText?.trim() ?? '';
};

const getTextFromSelector = (doc: Document, selectors: string[]): string => {
  for (const sel of selectors) {
    const el = doc.querySelector(sel) as HTMLElement | null;
    if (el) {
      const text = getCleanInnerText(el);
      if (text.length > 100) return text;
    }
  }
  return '';
};

const getMainText = (doc: Document): string => {
  const candidates = [
    '[itemprop="articleBody"]',
    '.post-content',
    '.article-body',
    '.entry-content',
    '.markdown-body',
    'article',
    '[role="main"]',
    'main',
    '.content',
  ];
  const best = getTextFromSelector(doc, candidates);
  if (best) return best;
  const body = doc.body;
  if (!body) return '';
  const main = (body.querySelector('main') ?? body.querySelector('article') ?? body) as HTMLElement;
  const text = getCleanInnerText(main) || body.innerText?.trim() || '';
  return text.slice(0, 50000);
};

export const extractFromDocument = (doc: Document, selectedText: string | null): ExtractedPageInfo => {
  const url = doc.defaultView?.location?.href ?? '';
  const hostname = doc.defaultView?.location?.hostname ?? '';

  const title =
    getMetaContent(doc, ['og:title', 'twitter:title']) ||
    doc.querySelector('h1')?.textContent?.trim() ||
    doc.title ||
    '';

  const siteName = getMetaContent(doc, ['og:site_name']) || hostname || '';

  const author =
    getMetaContent(doc, ['author', 'article:author', 'twitter:creator']) ||
    doc.querySelector('[rel="author"]')?.textContent?.trim() ||
    '';

  const publishedAt =
    getMetaContent(doc, ['article:published_time', 'datePublished', 'published_time']) ||
    doc.querySelector('time[datetime]')?.getAttribute('datetime') ||
    '';

  const bodyText = selectedText && selectedText.length > 50 ? selectedText : getMainText(doc);

  return {
    title,
    url,
    siteName,
    author,
    publishedAt,
    bodyText: bodyText.slice(0, 200000),
    selectedText: selectedText || null,
  };
};
