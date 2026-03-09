import 'webextension-polyfill';
import { getExtractFunction } from './inject-extract.js';
import { buildSummarizeUserPrompt, SUMMARIZE_SYSTEM_PROMPT } from './prompt.js';
import {
  getKnowledgeDirectoryHandle,
  writeFileToKnowledgeDir,
  ensureUniqueFilename,
  buildMarkdown,
} from '@extension/shared';
import { exampleThemeStorage, knowledgeOptionsStorage, sessionApiKeysStorage } from '@extension/storage';
import type { ExtractedPageInfo, AiSummaryOutput, MessageRequest, MessageResponse } from '@extension/shared';

exampleThemeStorage.get().then(theme => {
  console.log('theme', theme);
});

console.log('Background loaded');

const getEffectiveApiKey = async (modelId: string): Promise<string> => {
  const options = await knowledgeOptionsStorage.get();
  const model = options.models.find(m => m.id === modelId);
  if (!model) return '';
  if (options.apiKeyStorageStrategy === 'session') {
    const keys = await sessionApiKeysStorage.get();
    return keys[modelId] ?? model.apiKey ?? '';
  }
  return model.apiKey ?? '';
};

const callSummarizeApi = async (
  modelId: string,
  bodyText: string,
  meta: { title?: string; url?: string; siteName?: string },
): Promise<AiSummaryOutput> => {
  const options = await knowledgeOptionsStorage.get();
  const model = options.models.find(m => m.id === modelId);
  if (!model || !model.enabled) throw new Error('模型未配置或已禁用');
  const apiKey = await getEffectiveApiKey(modelId);
  if (!apiKey?.trim()) throw new Error('请先配置 API Key');

  const url = `${model.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), model.timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: model.model,
        messages: [
          { role: 'system', content: SUMMARIZE_SYSTEM_PROMPT },
          { role: 'user', content: buildSummarizeUserPrompt(bodyText, meta) },
        ],
        max_tokens: 4000,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${res.status}: ${text.slice(0, 200)}`);
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error('API 返回内容为空');

    let parsed: unknown;
    try {
      const cleaned = content
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error('无法解析 AI 返回的 JSON');
    }

    const o = parsed as Record<string, unknown>;
    return {
      titleZh: String(o.titleZh ?? ''),
      oneSentenceSummary: String(o.oneSentenceSummary ?? ''),
      summary: String(o.summary ?? ''),
      keyPoints: Array.isArray(o.keyPoints) ? o.keyPoints.map(String) : [],
      sourceAbstract: String(o.sourceAbstract ?? ''),
      primaryCategory: String(o.primaryCategory ?? ''),
      subCategory: String(o.subCategory ?? ''),
      tags: Array.isArray(o.tags) ? o.tags.map(String).slice(0, 5) : [],
    };
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw new Error('请求超时');
    throw err;
  }
};

chrome.runtime.onMessage.addListener(
  (
    request: MessageRequest,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void,
  ) => {
    void (async () => {
      try {
        if (request.kind === 'extract') {
          const tabId = request.tabId;
          let data: ExtractedPageInfo | null = null;
          let error: string | null = null;

          try {
            const results = await chrome.scripting.executeScript({
              target: { tabId },
              func: getExtractFunction(),
            });
            const first = results?.[0];
            const injErr = first && 'error' in first ? (first as { error?: { message?: string } }).error : null;
            if (injErr) {
              error = (typeof injErr === 'object' && injErr?.message) || String(injErr) || '注入执行失败';
            } else if (first?.result && typeof first.result === 'object' && 'bodyText' in first.result) {
              data = first.result as ExtractedPageInfo;
            } else {
              error = '注入提取失败';
            }
          } catch (scriptErr) {
            const msg = (scriptErr as Error).message ?? '';
            error =
              msg.includes('Cannot access') || msg.includes('restricted') || msg.includes('Cannot inject')
                ? '当前页面无法提取，请切换到普通网页后重试'
                : `提取失败: ${msg}`;
          }

          if (data) {
            sendResponse({ kind: 'extract', ok: true, data });
          } else {
            sendResponse({ kind: 'extract', ok: false, error: error ?? '提取失败' });
          }
          return;
        }

        if (request.kind === 'summarize') {
          const { pageInfo, selectedTextOnly } = request;
          const bodyText = selectedTextOnly && pageInfo.selectedText ? pageInfo.selectedText : pageInfo.bodyText;
          if (!bodyText?.trim()) {
            sendResponse({ kind: 'summarize', ok: false, error: '无正文可总结' });
            return;
          }
          const options = await knowledgeOptionsStorage.get();
          const modelId = options.defaultModelId || options.models.find(m => m.isDefault)?.id || options.models[0]?.id;
          if (!modelId) {
            sendResponse({ kind: 'summarize', ok: false, error: '请先在选项中配置并选择默认模型' });
            return;
          }
          const data = await callSummarizeApi(modelId, bodyText, {
            title: pageInfo.title,
            url: pageInfo.url,
            siteName: pageInfo.siteName,
          });
          sendResponse({ kind: 'summarize', ok: true, data });
          return;
        }

        if (request.kind === 'testModel') {
          sendResponse({ kind: 'testModel', ok: true });
          return;
        }

        if (request.kind === 'saveDocument') {
          const { payload, knowledgePath, filename } = request;
          const handle = await getKnowledgeDirectoryHandle();
          if (!handle) {
            sendResponse({ kind: 'saveDocument', ok: false, error: '未选择知识库目录' });
            return;
          }
          const finalFilename = await ensureUniqueFilename(handle, knowledgePath, filename);
          const content = buildMarkdown(payload);
          await writeFileToKnowledgeDir(handle, knowledgePath, finalFilename, content);
          sendResponse({ kind: 'saveDocument', ok: true });
          return;
        }

        if (request.kind === 'getOptions') {
          const data = await knowledgeOptionsStorage.get();
          sendResponse({ kind: 'getOptions', ok: true, data });
          return;
        }

        sendResponse({ kind: 'extract', ok: false, error: '未知请求类型' });
      } catch (err) {
        const message = (err as Error).message ?? '未知错误';
        if (request.kind === 'extract') sendResponse({ kind: 'extract', ok: false, error: message });
        else if (request.kind === 'summarize') sendResponse({ kind: 'summarize', ok: false, error: message });
        else if (request.kind === 'saveDocument') sendResponse({ kind: 'saveDocument', ok: false, error: message });
        else sendResponse({ kind: 'extract', ok: false, error: message });
      }
    })();
    return true;
  },
);
