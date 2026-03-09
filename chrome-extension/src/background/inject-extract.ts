/**
 * Inline extraction logic for scripting.executeScript.
 * Must be self-contained (no imports) - function is serialized and injected.
 */
export const getExtractFunction = (): (() => {
  title: string;
  url: string;
  siteName: string;
  author: string;
  publishedAt: string;
  bodyText: string;
  selectedText: string | null;
}) =>
  function extract() {
    const doc = document;
    const loc = doc.defaultView?.location;

    const getMeta = (names: string[]): string => {
      const sel = names.map(n => `meta[name="${n}"], meta[property="${n}"]`).join(', ');
      const el = doc.querySelector(sel);
      return (el?.getAttribute('content') ?? '').trim();
    };

    const NOISE_SELS: string[] = [
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

    const cleanText = (el: HTMLElement): string => {
      const clone = el.cloneNode(true) as HTMLElement;
      for (const s of NOISE_SELS) {
        clone.querySelectorAll(s).forEach(n => n.remove());
      }
      return clone.innerText?.trim() ?? '';
    };

    const getText = (selectors: string[]): string => {
      for (const sel of selectors) {
        const el = doc.querySelector(sel) as HTMLElement | null;
        if (el) {
          const t = cleanText(el);
          if (t.length > 100) return t;
        }
      }
      return '';
    };

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
    let bodyText = getText(candidates);
    if (!bodyText && doc.body) {
      const main = (doc.body.querySelector('main') ?? doc.body.querySelector('article') ?? doc.body) as HTMLElement;
      bodyText = cleanText(main) || doc.body.innerText?.trim() || '';
    }
    bodyText = (bodyText || '').slice(0, 200000);

    const selectedText =
      typeof doc.getSelection?.()?.toString === 'function' ? doc.getSelection()!.toString().trim() || null : null;
    if (selectedText && selectedText.length > 50) bodyText = selectedText;

    const title =
      getMeta(['og:title', 'twitter:title']) || doc.querySelector('h1')?.textContent?.trim() || doc.title || '';
    const url = loc?.href ?? '';
    const hostname = loc?.hostname ?? '';
    const siteName = getMeta(['og:site_name']) || hostname || '';
    const author =
      getMeta(['author', 'article:author', 'twitter:creator']) ||
      doc.querySelector('[rel="author"]')?.textContent?.trim() ||
      '';
    const publishedAt =
      getMeta(['article:published_time', 'datePublished', 'published_time']) ||
      doc.querySelector('time[datetime]')?.getAttribute('datetime') ||
      '';

    return {
      title,
      url,
      siteName,
      author,
      publishedAt,
      bodyText,
      selectedText,
    };
  };
