import type { MarkdownDocumentPayload } from './types.js';

const escapeYamlValue = (s: string): string => {
  if (s.includes('\n') || s.includes(':') || s.includes('"') || s.includes("'")) {
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
  }
  return s;
};

const yamlBlock = (obj: Record<string, unknown>): string => {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      lines.push(`${k}:`);
      for (const item of v) lines.push(`  - ${escapeYamlValue(String(item))}`);
    } else if (typeof v === 'object' && !Array.isArray(v)) {
      lines.push(`${k}:`);
      for (const [k2, v2] of Object.entries(v as Record<string, unknown>))
        lines.push(`  ${k2}: ${escapeYamlValue(String(v2))}`);
    } else {
      lines.push(`${k}: ${escapeYamlValue(String(v))}`);
    }
  }
  return lines.join('\n');
};

/**
 * Build full Markdown document with YAML front matter and body.
 */
export const buildMarkdown = (payload: MarkdownDocumentPayload): string => {
  const { frontMatter, oneSentenceSummary, summary, keyPoints, sourceAbstract, sourceInfo, fullText } = payload;

  const fm = yamlBlock({
    title: frontMatter.title,
    source_title: frontMatter.source_title,
    source_url: frontMatter.source_url,
    site_name: frontMatter.site_name,
    author: frontMatter.author,
    published_at: frontMatter.published_at,
    saved_at: frontMatter.saved_at,
    primary_category: frontMatter.primary_category,
    sub_category: frontMatter.sub_category,
    knowledge_path: frontMatter.knowledge_path,
    tags: frontMatter.tags,
    model: frontMatter.model,
    content_hash: frontMatter.content_hash,
    save_full_text: frontMatter.save_full_text,
  });

  const body = [
    '---',
    fm,
    '---',
    '',
    '# 一句话结论',
    '',
    oneSentenceSummary,
    '',
    '## 摘要',
    '',
    summary,
    '',
    '## 关键观点',
    '',
    ...keyPoints.map(p => `- ${p}`),
    '',
    '## 原文摘要',
    '',
    sourceAbstract,
    '',
    '## 来源信息',
    '',
    `- 原始标题：${sourceInfo.title}`,
    `- 原文链接：${sourceInfo.url}`,
    `- 站点：${sourceInfo.site}`,
    `- 作者：${sourceInfo.author}`,
    `- 发布时间：${sourceInfo.publishedAt}`,
  ];

  if (fullText && payload.frontMatter.save_full_text) {
    body.push('', '## 原文全文', '', fullText);
  }

  return body.join('\n');
};
