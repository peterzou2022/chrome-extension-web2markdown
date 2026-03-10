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
  images: { src: string; alt: string }[];
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
      '.author-info',
      '.author-card',
      '.user-info',
      '.user-card',
      '.post-author',
      '.profile-sidebar',
      '.author-sidebar',
      '[class*="author-info"]',
      '[class*="author-card"]',
      '[class*="user-info"]',
      '[class*="user-card"]',
      '[class*="post-author"]',
      '[class*="profile-sidebar"]',
      '[class*="author-sidebar"]',
      '[class*="user-name"]',
      '[class*="author-name"]',
    ];

    const removeCommentSections = (root: HTMLElement): void => {
      const commentMarkers = Array.from(
        root.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6, div, span, p'),
      ).filter(el => {
        const text = el.innerText?.trim();
        return text === '评论区' || text === '评论';
      });

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

    const removeContentBeforeTitle = (root: HTMLElement): void => {
      const titleEl = root.querySelector(
        'h1, h2, [role="heading"], .post-title, .article-title, [class*="post-title"], [class*="article-title"]',
      );
      if (!titleEl) return;
      const toRemove: Node[] = [];
      const walk = (node: Node): void => {
        if (node !== titleEl && node.compareDocumentPosition(titleEl) === Node.DOCUMENT_POSITION_FOLLOWING)
          toRemove.push(node);
        node.childNodes.forEach(walk);
      };
      walk(root);
      toRemove.sort((a, b) => (a.compareDocumentPosition(b) === Node.DOCUMENT_POSITION_FOLLOWING ? 1 : -1));
      toRemove.forEach(n => n.parentNode?.removeChild(n));
    };

    const MAX_SIDEBAR_LEN = 400;
    const removeShortSidebarAfterTitle = (root: HTMLElement): void => {
      const titleEl = root.querySelector(
        'h1, h2, [role="heading"], .post-title, .article-title, [class*="post-title"], [class*="article-title"]',
      );
      if (!titleEl) return;
      const container = titleEl.parentElement;
      if (!container || container === root) return;
      const parent = container.parentElement;
      if (!parent) return;
      for (const child of Array.from(parent.children)) {
        if (child === container) continue;
        const el = child as HTMLElement;
        const text = el.innerText?.trim() ?? '';
        if (text.length > 0 && text.length <= MAX_SIDEBAR_LEN) el.remove();
      }
    };

    const cleanText = (el: HTMLElement): string => {
      const clone = el.cloneNode(true) as HTMLElement;
      for (const s of NOISE_SELS) {
        clone.querySelectorAll(s).forEach(n => n.remove());
      }
      removeCommentSections(clone);
      removeContentBeforeTitle(clone);
      removeShortSidebarAfterTitle(clone);
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
      '.prose',
      '.post-body',
      '.article-content',
      '.content-body',
      'article',
      '[role="main"]',
      'main',
      '.content',
    ];
    let mainContainer: HTMLElement | null = null;
    for (const sel of candidates) {
      const el = doc.querySelector(sel) as HTMLElement | null;
      if (el && cleanText(el).length > 100) {
        mainContainer = el;
        break;
      }
    }
    if (!mainContainer && doc.body) {
      mainContainer = (doc.body.querySelector('main') ?? doc.body.querySelector('article') ?? doc.body) as HTMLElement;
    }
    let bodyText = getText(candidates);
    if (!bodyText && doc.body) {
      bodyText = mainContainer
        ? cleanText(mainContainer) || doc.body.innerText?.trim() || ''
        : doc.body.innerText?.trim() || '';
    }
    if (!bodyText && doc.body) bodyText = doc.body.innerText?.trim() || '';
    bodyText = (bodyText || '').slice(0, 200000);

    const selectedText =
      typeof doc.getSelection?.()?.toString === 'function' ? doc.getSelection()!.toString().trim() || null : null;
    if (selectedText && selectedText.length > 50) bodyText = selectedText;

    const title =
      getMeta(['og:title', 'twitter:title']) || doc.querySelector('h1')?.textContent?.trim() || doc.title || '';
    const url = loc?.href ?? '';
    const hostname = loc?.hostname ?? '';
    const siteName = getMeta(['og:site_name']) || hostname || '';

    const AUTHOR_DOM_SELS = [
      '[rel="author"]',
      '[class*="author-name"]',
      '[class*="user-name"]',
      '.author-name',
      'main [class*="author"]',
      'article [class*="author"]',
      '[class*="post-author"]',
      '.byline',
    ];
    const getAuthorFromDom = (): string => {
      for (const sel of AUTHOR_DOM_SELS) {
        const el = doc.querySelector(sel) as HTMLElement | null;
        const raw = el?.textContent?.trim() ?? '';
        if (raw.length < 2 || raw.length > 200) continue;
        const firstLine = raw.split(/\n/)[0].trim();
        const withoutDate = firstLine.replace(/\s*\d{4}-\d{2}-\d{2}[\s\S]*$/, '').trim();
        const name = withoutDate || firstLine;
        if (name.length >= 1 && name.length <= 100) return name;
      }
      return '';
    };
    const DATE_TIME_RE = /\d{4}-\d{2}-\d{2}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?/;
    const getPublishedAtFromDom = (): string => {
      const timeEl = doc.querySelector('time');
      if (timeEl) {
        const dt = timeEl.getAttribute('datetime')?.trim();
        if (dt) return dt;
        const text = timeEl.textContent?.trim() ?? '';
        const m = text.match(DATE_TIME_RE);
        if (m) return m[0];
      }
      const dateLike = doc.querySelector(
        '[class*="date"], [class*="time"], [class*="published"]',
      ) as HTMLElement | null;
      const raw = dateLike?.textContent?.trim() ?? '';
      const m = raw.match(DATE_TIME_RE);
      return m ? m[0] : '';
    };
    const getAuthorAndPublishedFromBlockWithDate = (): { author: string; publishedAt: string } => {
      const root = doc.querySelector('main') ?? doc.querySelector('article') ?? doc.body;
      if (!root) return { author: '', publishedAt: '' };
      const candidates = root.querySelectorAll('div, section, aside, span, p');
      for (const el of candidates) {
        const text = (el as HTMLElement).textContent?.trim() ?? '';
        if (text.length > 500) continue;
        const dateMatch = text.match(DATE_TIME_RE);
        if (!dateMatch) continue;
        const publishedAt = dateMatch[0];
        const beforeDate = text.slice(0, dateMatch.index).trim();
        const author = beforeDate.replace(/\s+/g, ' ').slice(0, 80).trim();
        if (author.length >= 1 && author.length <= 80) return { author, publishedAt };
      }
      return { author: '', publishedAt: '' };
    };

    let author =
      getMeta(['author', 'article:author', 'twitter:creator']) ||
      doc.querySelector('[rel="author"]')?.textContent?.trim() ||
      getAuthorFromDom() ||
      '';
    let publishedAt =
      getMeta(['article:published_time', 'datePublished', 'published_time']) ||
      doc.querySelector('time[datetime]')?.getAttribute('datetime') ||
      getPublishedAtFromDom() ||
      '';
    if (!author || !publishedAt) {
      const fromBlock = getAuthorAndPublishedFromBlockWithDate();
      if (!author) author = fromBlock.author;
      if (!publishedAt) publishedAt = fromBlock.publishedAt;
    }

    const IMAGE_NOISE_SELS = [...NOISE_SELS, '.avatar', '.user-avatar', '.comment-avatar', '[class*="avatar"]'];
    const isInsideNoiseContainer = (el: Element) => IMAGE_NOISE_SELS.some(s => Boolean(el.closest(s)));
    const isAfterNode = (reference: Node, target: Node) =>
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

    const MIN_DIM = 80;
    const images: { src: string; alt: string }[] = [];
    if (mainContainer) {
      const titleElement = doc.querySelector('h1') as HTMLElement | null;
      const commentBoundary = getCommentBoundary(mainContainer);
      const seen = new Set<string>();
      const imgs = Array.from(mainContainer.querySelectorAll<HTMLImageElement>('img'));
      for (const img of imgs) {
        if (isInsideNoiseContainer(img)) continue;
        if (titleElement && !isAfterNode(titleElement, img)) continue;
        if (commentBoundary && isAfterNode(commentBoundary, img)) continue;
        const rawSrc = img.currentSrc || img.getAttribute('src') || img.getAttribute('data-src') || '';
        if (!rawSrc || rawSrc.startsWith('data:')) continue;
        let absUrl: string;
        try {
          absUrl = new URL(rawSrc, url).href;
        } catch {
          continue;
        }
        if (seen.has(absUrl)) continue;
        seen.add(absUrl);
        const w = img.naturalWidth || img.width || parseInt(img.getAttribute('width') || '0', 10);
        const h = img.naturalHeight || img.height || parseInt(img.getAttribute('height') || '0', 10);
        if (w > 0 && h > 0 && (w < MIN_DIM || h < MIN_DIM)) continue;
        images.push({ src: absUrl, alt: (img.getAttribute('alt') || '').trim().slice(0, 200) });
      }
    }
    const imagesSlice = images.slice(0, 50);

    return {
      title,
      url,
      siteName,
      author,
      publishedAt,
      bodyText,
      selectedText,
      images: imagesSlice,
    };
  };
