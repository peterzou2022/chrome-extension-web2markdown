import '@src/SidePanel.css';
import {
  useStorage,
  withErrorBoundary,
  withSuspense,
  formatKnowledgeFilename,
  buildMarkdown,
  PRIMARY_CATEGORIES,
  SUB_CATEGORIES,
  DEFAULT_PRIMARY_TO_DIR,
} from '@extension/shared';
import { exampleThemeStorage, knowledgeOptionsStorage } from '@extension/storage';
import { cn, ErrorDisplay, LoadingSpinner, ToggleButton } from '@extension/ui';
import { useCallback, useEffect, useState } from 'react';
import type {
  AiSummaryOutput,
  ExtractedPageInfo,
  LogicalPrimaryCategoryConfig,
  LogicalSubCategoryConfig,
  MarkdownDocumentPayload,
  PrimaryCategory,
} from '@extension/shared';

const simpleHash = (s: string): string => {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(36);
};

const buildDefaultCategoriesConfig = (): LogicalPrimaryCategoryConfig[] =>
  PRIMARY_CATEGORIES.map(primary => ({
    id: primary,
    label: primary,
    dirName: DEFAULT_PRIMARY_TO_DIR[primary],
    subCategories: (SUB_CATEGORIES[primary] ?? []).map(
      (sub): LogicalSubCategoryConfig => ({
        id: sub,
        label: sub,
        dirName: sub,
      }),
    ),
  }));

const SidePanel = () => {
  const { isLight } = useStorage(exampleThemeStorage);
  const options = useStorage(knowledgeOptionsStorage);

  const [tabId, setTabId] = useState<number | null>(null);
  const [pageInfo, setPageInfo] = useState<ExtractedPageInfo | null>(null);
  const [summary, setSummary] = useState<AiSummaryOutput | null>(null);
  const [extractLoading, setExtractLoading] = useState(false);
  const [summarizeLoading, setSummarizeLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const isLightTheme = isLight ?? true;

  const toggleOptionsPage = useCallback(async () => {
    const optionsUrl = chrome.runtime.getURL('options/index.html');
    const tabs = await chrome.tabs.query({ url: optionsUrl });
    if (tabs.length > 0) {
      await chrome.tabs.remove(tabs.map(t => t.id!).filter(Boolean));
    } else {
      await chrome.runtime.openOptionsPage();
    }
  }, []);

  const getActiveTabId = useCallback(async (): Promise<number | null> => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const id = tab?.id ?? null;
    setTabId(id);
    return id;
  }, []);

  useEffect(() => {
    void getActiveTabId();
  }, [getActiveTabId]);

  const sendMessage = useCallback(
    <T,>(request: { kind: string; [k: string]: unknown }): Promise<T> =>
      new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(request, (response: unknown) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          const r = response as { ok?: boolean; error?: string; data?: T };
          if (r?.ok === false) reject(new Error(r.error ?? '请求失败'));
          else resolve((r?.data ?? r) as T);
        });
      }),
    [],
  );

  const handleExtract = useCallback(async () => {
    const currentTabId = await getActiveTabId();
    if (currentTabId == null) {
      setError('无法获取当前标签页');
      return;
    }
    setError(null);
    setExtractLoading(true);
    try {
      const res = await sendMessage<ExtractedPageInfo>({ kind: 'extract', tabId: currentTabId });
      setPageInfo(res);
      setSummary(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExtractLoading(false);
    }
  }, [getActiveTabId, sendMessage]);

  const handleExtractAndSummarize = useCallback(async () => {
    const currentTabId = await getActiveTabId();
    if (currentTabId == null) {
      setError('无法获取当前标签页');
      return;
    }
    setError(null);
    setExtractLoading(true);
    setSummarizeLoading(true);
    try {
      const extracted = await sendMessage<ExtractedPageInfo>({ kind: 'extract', tabId: currentTabId });
      setPageInfo(extracted);
      const bodyText =
        extracted.selectedText && extracted.selectedText.length > 50 ? extracted.selectedText : extracted.bodyText;
      if (!bodyText?.trim()) {
        setError('无正文可总结');
        setSummarizeLoading(false);
        setExtractLoading(false);
        return;
      }
      const data = await sendMessage<AiSummaryOutput>({
        kind: 'summarize',
        tabId: currentTabId,
        pageInfo: extracted,
        selectedTextOnly: Boolean(extracted.selectedText && extracted.selectedText.length > 50),
      });
      setSummary(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExtractLoading(false);
      setSummarizeLoading(false);
    }
  }, [getActiveTabId, sendMessage]);

  const handleResummarize = useCallback(async () => {
    const currentTabId = await getActiveTabId();
    if (currentTabId == null || !pageInfo) return;
    setError(null);
    setSummarizeLoading(true);
    try {
      const data = await sendMessage<AiSummaryOutput>({
        kind: 'summarize',
        tabId: currentTabId,
        pageInfo,
        selectedTextOnly: false,
      });
      setSummary(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSummarizeLoading(false);
    }
  }, [getActiveTabId, pageInfo, sendMessage]);

  const categories: LogicalPrimaryCategoryConfig[] =
    options.categoriesConfig && options.categoriesConfig.length > 0
      ? options.categoriesConfig
      : buildDefaultCategoriesConfig();

  const knowledgePath = (() => {
    if (!summary) return 'Inbox';
    const primaryCfg = categories.find(c => c.id === summary.primaryCategory);
    if (!primaryCfg) return 'Inbox';
    const subCfg = primaryCfg.subCategories.find(s => s.id === summary.subCategory);
    if (!subCfg) return 'Inbox';
    const fallbackRoot = DEFAULT_PRIMARY_TO_DIR[primaryCfg.id as PrimaryCategory] ?? String(primaryCfg.id);
    const root = primaryCfg.dirName?.trim() || fallbackRoot;
    const subDir = subCfg.dirName?.trim() || subCfg.id;
    return `${root}/${subDir}`;
  })();
  const filename = summary ? formatKnowledgeFilename(summary.titleZh || 'untitled') : '';

  const handleSave = useCallback(async () => {
    if (!summary || !pageInfo) {
      setError('请先提取并总结');
      return;
    }
    setError(null);
    setSaveLoading(true);
    setSaveSuccess(false);
    try {
      const opts = await knowledgeOptionsStorage.get();
      const defaultModel = opts.models.find(m => m.id === opts.defaultModelId) ?? opts.models[0];
      const savedAt = new Date().toISOString();
      const contentHash = simpleHash(`${pageInfo.url}_${pageInfo.title}_${savedAt}`);

      const categoriesAtSave =
        opts.categoriesConfig && opts.categoriesConfig.length > 0
          ? opts.categoriesConfig
          : buildDefaultCategoriesConfig();
      const primaryCfgAtSave = categoriesAtSave.find(c => c.id === summary.primaryCategory);
      const subCfgAtSave = primaryCfgAtSave?.subCategories.find(s => s.id === summary.subCategory);
      const primaryCategoryLabel = primaryCfgAtSave?.dirName?.trim() || summary.primaryCategory;
      const subCategoryLabel = subCfgAtSave?.dirName?.trim() || summary.subCategory;

      const payload: MarkdownDocumentPayload = {
        frontMatter: {
          title: summary.titleZh,
          source_title: pageInfo.title,
          source_url: pageInfo.url,
          site_name: pageInfo.siteName,
          author: pageInfo.author,
          published_at: pageInfo.publishedAt,
          saved_at: savedAt,
          primary_category: primaryCategoryLabel,
          sub_category: subCategoryLabel,
          knowledge_path: knowledgePath,
          tags: summary.tags,
          model: {
            provider: defaultModel?.provider ?? 'openai-compatible',
            name: defaultModel?.model ?? '',
          },
          content_hash: contentHash,
          save_full_text: opts.saveFullText ?? false,
        },
        oneSentenceSummary: summary.oneSentenceSummary,
        summary: summary.summary,
        keyPoints: summary.keyPoints,
        sourceAbstract: summary.sourceAbstract,
        sourceInfo: {
          title: pageInfo.title,
          url: pageInfo.url,
          site: pageInfo.siteName,
          author: pageInfo.author,
          publishedAt: pageInfo.publishedAt,
        },
      };
      if (opts.saveFullText && pageInfo.bodyText) payload.fullText = pageInfo.bodyText;

      const content = buildMarkdown(payload);

      await chrome.storage.session.set({
        pendingSave: {
          content,
          knowledgePath,
          filename,
          images: pageInfo?.images ?? [],
        },
        saveResult: null,
      });

      await chrome.windows.create({
        url: chrome.runtime.getURL('save-helper.html'),
        type: 'popup',
        width: 420,
        height: 240,
        focused: true,
      });

      const result = await new Promise<{ ok: boolean; error?: string; filename?: string }>(resolve => {
        const CHECK_INTERVAL = 500;
        const MAX_WAIT = 60_000;
        let elapsed = 0;
        const timer = setInterval(async () => {
          elapsed += CHECK_INTERVAL;
          const stored = await chrome.storage.session.get('saveResult');
          if (stored?.saveResult) {
            clearInterval(timer);
            resolve(stored.saveResult as { ok: boolean; error?: string; filename?: string });
          } else if (elapsed >= MAX_WAIT) {
            clearInterval(timer);
            resolve({ ok: false, error: '保存超时，请重试' });
          }
        }, CHECK_INTERVAL);
      });

      await chrome.storage.session.remove(['pendingSave', 'saveResult']);

      if (result.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
      } else {
        setError(result.error ?? '保存失败');
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaveLoading(false);
    }
  }, [summary, pageInfo, knowledgePath, filename]);

  const updateSummary = useCallback((patch: Partial<AiSummaryOutput>) => {
    setSummary(prev => (prev ? { ...prev, ...patch } : null));
  }, []);

  const subs: LogicalSubCategoryConfig[] = (() => {
    if (!summary) return [];
    const cfg = categories.find(c => c.id === summary.primaryCategory);
    return cfg?.subCategories ?? [];
  })();

  return (
    <div
      className={cn(
        'min-h-screen p-4 text-sm',
        isLightTheme ? 'bg-slate-50 text-gray-900' : 'bg-gray-800 text-gray-100',
      )}>
      <div className="space-y-4">
        <header className="flex items-center justify-between border-b pb-2">
          <span className="font-semibold">文章总结</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className={cn(
                'rounded px-2 py-0.5 text-xs',
                isLightTheme ? 'text-gray-600 hover:bg-gray-200' : 'text-gray-300 hover:bg-gray-600',
              )}
              onClick={toggleOptionsPage}>
              配置模型
            </button>
            <ToggleButton onClick={exampleThemeStorage.toggle}>主题</ToggleButton>
          </div>
        </header>

        {error && (
          <div
            className={cn('rounded bg-red-100 px-2 py-1 text-red-800', !isLightTheme && 'bg-red-900/30 text-red-200')}>
            {error}
          </div>
        )}
        {saveSuccess && (
          <div
            className={cn(
              'rounded bg-green-100 px-2 py-1 text-green-800',
              !isLightTheme && 'bg-green-900/30 text-green-200',
            )}>
            已保存到知识库
          </div>
        )}

        <section>
          <h3 className="mb-1 font-medium">页面信息</h3>
          {pageInfo ? (
            <div className={cn('rounded border p-2 text-xs', isLightTheme ? 'border-gray-200' : 'border-gray-600')}>
              <div>标题：{pageInfo.title || '—'}</div>
              <div className="truncate">URL：{pageInfo.url || '—'}</div>
              <div>站点：{pageInfo.siteName || '—'}</div>
              {pageInfo.bodyText && (
                <div className="mt-1 max-h-20 overflow-y-auto">正文预览：{pageInfo.bodyText.slice(0, 300)}…</div>
              )}
            </div>
          ) : (
            <p className="text-xs opacity-70">未提取</p>
          )}
        </section>

        <section>
          <h3 className="mb-1 font-medium">操作</h3>
          {(!options.models || options.models.length === 0) && (
            <p className="mb-2 text-xs text-amber-600">请先配置 AI 模型，点击右上角「配置模型」进行设置。</p>
          )}
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              className={cn('rounded px-2 py-1 text-xs', isLightTheme ? 'bg-gray-200' : 'bg-gray-600')}
              onClick={handleExtract}
              disabled={extractLoading || tabId == null}>
              {extractLoading ? '提取中…' : '提取正文'}
            </button>
            <button
              type="button"
              className={cn('rounded px-2 py-1 text-xs', isLightTheme ? 'bg-blue-200' : 'bg-blue-700')}
              onClick={handleExtractAndSummarize}
              disabled={extractLoading || summarizeLoading || tabId == null}>
              {summarizeLoading ? '总结中…' : '提取并总结'}
            </button>
            {summary && (
              <button
                type="button"
                className={cn('rounded px-2 py-1 text-xs', isLightTheme ? 'bg-gray-200' : 'bg-gray-600')}
                onClick={handleResummarize}
                disabled={summarizeLoading}>
                重新总结
              </button>
            )}
            {summary && pageInfo && (
              <button
                type="button"
                className={cn(
                  'rounded px-2 py-1 text-xs',
                  isLightTheme ? 'bg-green-600 text-white' : 'bg-green-700 text-white',
                )}
                onClick={handleSave}
                disabled={saveLoading}>
                {saveLoading ? '保存中…' : '保存到知识库'}
              </button>
            )}
          </div>
        </section>

        {summary && (
          <>
            <section>
              <h3 className="mb-1 font-medium">编辑结果</h3>
              <div className={cn('space-y-2 rounded border p-2', isLightTheme ? 'border-gray-200' : 'border-gray-600')}>
                <div>
                  <label className="block text-xs opacity-70" htmlFor="summary-titleZh">
                    中文标题
                  </label>
                  <input
                    id="summary-titleZh"
                    type="text"
                    value={summary.titleZh}
                    onChange={e => updateSummary({ titleZh: e.target.value })}
                    className={cn(
                      'w-full rounded border px-1 py-0.5 text-xs',
                      isLightTheme ? 'border-gray-300 bg-white' : 'border-gray-500 bg-gray-800',
                    )}
                  />
                </div>
                <div>
                  <label className="block text-xs opacity-70" htmlFor="summary-primary-category">
                    一级分类
                  </label>
                  <select
                    id="summary-primary-category"
                    value={summary.primaryCategory}
                    onChange={e => {
                      const nextId = e.target.value;
                      const cfg = categories.find(c => c.id === nextId);
                      const firstSub = cfg?.subCategories[0]?.id ?? '';
                      updateSummary({
                        primaryCategory: nextId,
                        subCategory: firstSub,
                      });
                    }}
                    className={cn(
                      'w-full rounded border px-1 py-0.5 text-xs',
                      isLightTheme ? 'border-gray-300 bg-white' : 'border-gray-500 bg-gray-800',
                    )}>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.dirName || c.label || c.id}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs opacity-70" htmlFor="summary-sub-category">
                    二级分类
                  </label>
                  <select
                    id="summary-sub-category"
                    value={summary.subCategory}
                    onChange={e => updateSummary({ subCategory: e.target.value })}
                    className={cn(
                      'w-full rounded border px-1 py-0.5 text-xs',
                      isLightTheme ? 'border-gray-300 bg-white' : 'border-gray-500 bg-gray-800',
                    )}>
                    {subs.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.dirName || s.label || s.id}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs opacity-70" htmlFor="summary-one-sentence">
                    一句话结论
                  </label>
                  <input
                    id="summary-one-sentence"
                    type="text"
                    value={summary.oneSentenceSummary}
                    onChange={e => updateSummary({ oneSentenceSummary: e.target.value })}
                    className={cn(
                      'w-full rounded border px-1 py-0.5 text-xs',
                      isLightTheme ? 'border-gray-300 bg-white' : 'border-gray-500 bg-gray-800',
                    )}
                  />
                </div>
                <div>
                  <label className="block text-xs opacity-70" htmlFor="summary-summary">
                    摘要
                  </label>
                  <textarea
                    id="summary-summary"
                    value={summary.summary}
                    onChange={e => updateSummary({ summary: e.target.value })}
                    rows={3}
                    className={cn(
                      'w-full rounded border px-1 py-0.5 text-xs',
                      isLightTheme ? 'border-gray-300 bg-white' : 'border-gray-500 bg-gray-800',
                    )}
                  />
                </div>
                <div>
                  <label className="block text-xs opacity-70" htmlFor="summary-keypoints">
                    关键观点（每行一条）
                  </label>
                  <textarea
                    id="summary-keypoints"
                    value={summary.keyPoints.join('\n')}
                    onChange={e => updateSummary({ keyPoints: e.target.value.split('\n').filter(Boolean) })}
                    rows={2}
                    className={cn(
                      'w-full rounded border px-1 py-0.5 text-xs',
                      isLightTheme ? 'border-gray-300 bg-white' : 'border-gray-500 bg-gray-800',
                    )}
                  />
                </div>
                <div>
                  <label className="block text-xs opacity-70" htmlFor="summary-source-abstract">
                    原文摘要
                  </label>
                  <textarea
                    id="summary-source-abstract"
                    value={summary.sourceAbstract}
                    onChange={e => updateSummary({ sourceAbstract: e.target.value })}
                    rows={2}
                    className={cn(
                      'w-full rounded border px-1 py-0.5 text-xs',
                      isLightTheme ? 'border-gray-300 bg-white' : 'border-gray-500 bg-gray-800',
                    )}
                  />
                </div>
                <div>
                  <label className="block text-xs opacity-70" htmlFor="summary-tags">
                    标签（逗号分隔，1-5 个）
                  </label>
                  <input
                    id="summary-tags"
                    type="text"
                    value={summary.tags.join(', ')}
                    onChange={e =>
                      updateSummary({
                        tags: e.target.value
                          .split(/[,，]/)
                          .map(t => t.trim())
                          .filter(Boolean)
                          .slice(0, 5),
                      })
                    }
                    className={cn(
                      'w-full rounded border px-1 py-0.5 text-xs',
                      isLightTheme ? 'border-gray-300 bg-white' : 'border-gray-500 bg-gray-800',
                    )}
                  />
                </div>
              </div>
            </section>

            <section>
              <h3 className="mb-1 font-medium">保存路径预览</h3>
              <div className={cn('rounded border p-2 text-xs', isLightTheme ? 'border-gray-200' : 'border-gray-600')}>
                <div>目录：{knowledgePath}</div>
                <div>文件名：{filename}</div>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
};

export default withErrorBoundary(withSuspense(SidePanel, <LoadingSpinner />), ErrorDisplay);
