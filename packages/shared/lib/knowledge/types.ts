/**
 * One image reference from the article body.
 */
export interface ExtractedImage {
  src: string;
  alt: string;
}

/**
 * Result of extracting article content from the current page.
 */
export interface ExtractedPageInfo {
  title: string;
  url: string;
  siteName: string;
  author: string;
  publishedAt: string;
  bodyText: string;
  selectedText: string | null;
  images: ExtractedImage[];
}

/**
 * Metadata for the generated Markdown document (YAML front matter).
 */
export interface MarkdownFrontMatter {
  title: string;
  source_title: string;
  source_url: string;
  site_name: string;
  author: string;
  published_at: string;
  saved_at: string;
  primary_category: string;
  sub_category: string;
  knowledge_path: string;
  tags: string[];
  model: {
    provider: string;
    name: string;
  };
  content_hash: string;
  save_full_text: boolean;
}

/**
 * Full document payload used to generate the final .md file.
 */
export interface MarkdownDocumentPayload {
  frontMatter: MarkdownFrontMatter;
  oneSentenceSummary: string;
  summary: string;
  keyPoints: string[];
  sourceAbstract: string;
  sourceInfo: {
    title: string;
    url: string;
    site: string;
    author: string;
    publishedAt: string;
  };
  fullText?: string;
}
