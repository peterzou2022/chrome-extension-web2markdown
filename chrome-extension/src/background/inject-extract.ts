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

    const cleanText = (el: HTMLElement): string => {
      const clone = el.cloneNode(true) as HTMLElement;
      for (const s of NOISE_SELS) {
        clone.querySelectorAll(s).forEach(n => n.remove());
      }
      removeCommentSections(clone);
      removeContentBeforeTitle(clone);
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
      const mainContainer = (doc.body.querySelector('main') ??
        doc.body.querySelector('article') ??
        doc.body) as HTMLElement;
      bodyText = cleanText(mainContainer) || doc.body.innerText?.trim() || '';
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
    const author =
      getMeta(['author', 'article:author', 'twitter:creator']) ||
      doc.querySelector('[rel="author"]')?.textContent?.trim() ||
      '';
    const publishedAt =
      getMeta(['article:published_time', 'datePublished', 'published_time']) ||
      doc.querySelector('time[datetime]')?.getAttribute('datetime') ||
      '';

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
