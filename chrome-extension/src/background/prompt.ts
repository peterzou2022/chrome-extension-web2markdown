import { PRIMARY_CATEGORIES, SUB_CATEGORIES } from '@extension/shared';

const primaryList = PRIMARY_CATEGORIES.join(', ');
const subList = Object.entries(SUB_CATEGORIES)
  .map(([p, subs]) => `${p}: ${(subs as readonly string[]).join(', ')}`)
  .join('\n');

export const SUMMARIZE_SYSTEM_PROMPT = `你是一个文章总结助手。根据用户提供的网页正文（和可选元信息），输出一个 JSON 对象，且仅输出该 JSON，不要其他说明。

要求：
1. 所有内容使用中文。
2. 原文摘要（sourceAbstract）限制在 300–800 字，概括原文核心内容。
3. 一级分类（primaryCategory）必须从以下列表中选且只选一个：${primaryList}。
4. 二级分类（subCategory）必须与一级分类对应，从以下子类中选一个：
${subList}
5. 标签（tags）数量 1–5 个，字符串数组。

输出 JSON 格式（不要 markdown 代码块包裹）：
{
  "titleZh": "中文标题",
  "oneSentenceSummary": "一句话结论",
  "summary": "摘要正文",
  "keyPoints": ["要点1", "要点2", "要点3"],
  "sourceAbstract": "提取后的原文摘要（300-800字）",
  "primaryCategory": "一级分类",
  "subCategory": "二级分类",
  "tags": ["标签1", "标签2"]
}`;

export const buildSummarizeUserPrompt = (
  bodyText: string,
  meta: { title?: string; url?: string; siteName?: string },
): string => {
  const parts = [
    meta.title ? `标题：${meta.title}` : '',
    meta.url ? `URL：${meta.url}` : '',
    meta.siteName ? `站点：${meta.siteName}` : '',
    '',
    '正文：',
    bodyText.slice(0, 120000),
  ];
  return parts.filter(Boolean).join('\n');
};
