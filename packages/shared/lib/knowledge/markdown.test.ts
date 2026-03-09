import { buildMarkdown } from './markdown.js';
import { describe, it, expect } from 'vitest';
import type { MarkdownDocumentPayload } from './types.js';

describe('buildMarkdown', () => {
  it('produces YAML front matter and body', () => {
    const payload: MarkdownDocumentPayload = {
      frontMatter: {
        title: '测试标题',
        source_title: 'Original',
        source_url: 'https://example.com',
        site_name: 'Example',
        author: 'Author',
        published_at: '2026-03-09',
        saved_at: '2026-03-09T12:00:00Z',
        primary_category: 'AI',
        sub_category: 'AI-News',
        knowledge_path: '03-AI/AI-News',
        tags: ['tag1'],
        model: { provider: 'openai', name: 'gpt-4' },
        content_hash: 'abc',
        save_full_text: false,
      },
      oneSentenceSummary: '一句话',
      summary: '摘要',
      keyPoints: ['要点1'],
      sourceAbstract: '原文摘要',
      sourceInfo: {
        title: 'Original',
        url: 'https://example.com',
        site: 'Example',
        author: 'Author',
        publishedAt: '2026-03-09',
      },
    };
    const md = buildMarkdown(payload);
    expect(md).toContain('---');
    expect(md).toContain('title:');
    expect(md).toContain('测试标题');
    expect(md).toContain('# 一句话结论');
    expect(md).toContain('一句话');
    expect(md).toContain('## 摘要');
    expect(md).toContain('摘要');
    expect(md).not.toContain('## 原文全文');
  });

  it('includes full text section when save_full_text is true', () => {
    const payload: MarkdownDocumentPayload = {
      frontMatter: {
        title: 'T',
        source_title: 'S',
        source_url: 'u',
        site_name: 's',
        author: 'a',
        published_at: 'p',
        saved_at: 'd',
        primary_category: 'AI',
        sub_category: 'AI-News',
        knowledge_path: '03-AI/AI-News',
        tags: [],
        model: { provider: 'o', name: 'n' },
        content_hash: 'h',
        save_full_text: true,
      },
      oneSentenceSummary: 'x',
      summary: 'y',
      keyPoints: [],
      sourceAbstract: 'z',
      sourceInfo: { title: 'S', url: 'u', site: 's', author: 'a', publishedAt: 'p' },
      fullText: '完整正文',
    };
    const md = buildMarkdown(payload);
    expect(md).toContain('## 原文全文');
    expect(md).toContain('完整正文');
  });
});
