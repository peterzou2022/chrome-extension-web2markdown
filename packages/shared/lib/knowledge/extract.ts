/**
 * Extract article metadata and body from the page document.
 * Intended to run in a content script (has DOM access).
 * Does not send full HTML; only extracted text and meta.
 */

import type { ExtractedPageInfo, ExtractedImage } from './types.js';

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
  '.divide-y.divide-gray-200',
  '.related-posts',
  '.related-articles',
  '.share',
  '.social-share',
  '.ad',
  '.ads',
  '.advertisement',
  '.post-meta',
  '.entry-meta',
  '.article-meta',
  '.byline',
  '[class*="post-meta"]',
  '[class*="entry-meta"]',
  '[class*="article-meta"]',
];

const removeCommentSections = (root: HTMLElement): void => {
  const commentMarkers = Array.from(root.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6, div, span, p')).filter(
    el => {
      const text = el.innerText?.trim();
      return text === '评论区' || text === '评论';
    },
  );

  for (const marker of commentMarkers) {
    const removableParent = marker.closest('.divide-y.divide-gray-200') ?? marker.parentElement;

    if (removableParent?.parentElement) {
      let next = removableParent.nextElementSibling;
      while (next) {
        const current = next;
        next = next.nextElementSibling;
        current.remove();
      }
      removableParent.remove();
    } else {
      marker.remove();
    }
  }
};

/** Remove all nodes that appear before the first title (h1 or h2) in document order. */
const removeContentBeforeTitle = (root: HTMLElement): void => {
  const titleEl = root.querySelector(
    'h1, h2, [role="heading"], .post-title, .article-title, [class*="post-title"], [class*="article-title"]',
  ) as HTMLElement | null;
  if (!titleEl) return;
  const toRemove: Node[] = [];
  const walk = (node: Node): void => {
    if (node !== titleEl && node.compareDocumentPosition(titleEl) === Node.DOCUMENT_POSITION_FOLLOWING) {
      toRemove.push(node);
    }
    node.childNodes.forEach(walk);
  };
  walk(root);
  toRemove.sort((a, b) => (a.compareDocumentPosition(b) === Node.DOCUMENT_POSITION_FOLLOWING ? 1 : -1));
  toRemove.forEach(n => n.parentNode?.removeChild(n));
};

const getCleanInnerText = (el: HTMLElement): string => {
  const clone = el.cloneNode(true) as HTMLElement;
  for (const sel of NOISE_SELECTORS) {
    clone.querySelectorAll(sel).forEach(n => n.remove());
  }
  removeCommentSections(clone);
  removeContentBeforeTitle(clone);
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

const CANDIDATE_SELECTORS = [
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

const getMainContainer = (doc: Document): HTMLElement | null => {
  for (const sel of CANDIDATE_SELECTORS) {
    const el = doc.querySelector(sel) as HTMLElement | null;
    if (el && getCleanInnerText(el).length > 100) return el;
  }
  const body = doc.body;
  if (!body) return null;
  return (body.querySelector('main') ?? body.querySelector('article') ?? body) as HTMLElement;
};

const getMainText = (doc: Document): string => {
  const best = getTextFromSelector(doc, CANDIDATE_SELECTORS);
  if (best) return best;
  const body = doc.body;
  if (!body) return '';
  const main = (body.querySelector('main') ?? body.querySelector('article') ?? body) as HTMLElement;
  const text = getCleanInnerText(main) || body.innerText?.trim() || '';
  return text.slice(0, 50000);
};

const MIN_IMAGE_DIMENSION = 80;

const IMAGE_NOISE_SELECTORS = [...NOISE_SELECTORS, '.avatar', '.user-avatar', '.comment-avatar', '[class*="avatar"]'];

const isInsideNoiseContainer = (el: Element): boolean => IMAGE_NOISE_SELECTORS.some(sel => Boolean(el.closest(sel)));

const isAfterNode = (reference: Node, target: Node): boolean =>
  Boolean(reference.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING);

const getCommentBoundary = (container: HTMLElement): HTMLElement | null => {
  const candidates = Array.from(container.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6, div, span, p'));
  return (
    candidates.find(el => {
      const text = el.innerText?.trim();
      return text === '评论区' || text === '评论';
    }) ?? null
  );
};

const getImagesFromContainer = (
  container: HTMLElement | null,
  baseHref: string,
  titleElement: HTMLElement | null,
): ExtractedImage[] => {
  if (!container) return [];
  const commentBoundary = getCommentBoundary(container);
  const imgs = Array.from(container.querySelectorAll<HTMLImageElement>('img'));
  const seen = new Set<string>();
  const out: ExtractedImage[] = [];
  for (const img of imgs) {
    if (isInsideNoiseContainer(img)) continue;
    if (titleElement && !isAfterNode(titleElement, img)) continue;
    if (commentBoundary && isAfterNode(commentBoundary, img)) continue;
    const rawSrc = img.currentSrc || img.getAttribute('src') || img.getAttribute('data-src') || '';
    if (!rawSrc || rawSrc.startsWith('data:')) continue;
    let absUrl: string;
    try {
      absUrl = new URL(rawSrc, baseHref).href;
    } catch {
      continue;
    }
    if (seen.has(absUrl)) continue;
    seen.add(absUrl);
    const w = img.naturalWidth || img.width || parseInt(img.getAttribute('width') || '0', 10);
    const h = img.naturalHeight || img.height || parseInt(img.getAttribute('height') || '0', 10);
    if (w > 0 && h > 0 && (w < MIN_IMAGE_DIMENSION || h < MIN_IMAGE_DIMENSION)) continue;
    out.push({ src: absUrl, alt: (img.getAttribute('alt') || '').trim().slice(0, 200) });
  }
  return out.slice(0, 50);
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
  const mainContainer = getMainContainer(doc);
  const titleElement = doc.querySelector('h1') as HTMLElement | null;
  const images = getImagesFromContainer(mainContainer, url, titleElement);

  return {
    title,
    url,
    siteName,
    author,
    publishedAt,
    bodyText: bodyText.slice(0, 200000),
    selectedText: selectedText || null,
    images,
  };
};
