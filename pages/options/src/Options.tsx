import '@src/Options.css';
import {
  PROJECT_URL_OBJECT,
  useStorage,
  withErrorBoundary,
  withSuspense,
  getKnowledgeDirectoryHandle,
  removeKnowledgeDirectoryHandle,
  setKnowledgeDirectoryHandle,
  PRIMARY_CATEGORIES,
  SUB_CATEGORIES,
  DEFAULT_PRIMARY_TO_DIR,
} from '@extension/shared';
import {
  exampleThemeStorage,
  knowledgeOptionsStorage,
  sessionApiKeysStorage,
  createDefaultModelConfig,
} from '@extension/storage';
import { cn, ErrorDisplay, LoadingSpinner, ToggleButton } from '@extension/ui';
import { useCallback, useEffect, useState } from 'react';
import type {
  ApiKeyStorageStrategy,
  LogicalPrimaryCategoryConfig,
  LogicalSubCategoryConfig,
  ModelConfig,
} from '@extension/shared';

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

// SVG Icons components
const TrashIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    className="size-4">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
    />
  </svg>
);

const PlusIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    className="size-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
  </svg>
);

const XMarkIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    className="size-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
  </svg>
);

const Options = () => {
  const { isLight } = useStorage(exampleThemeStorage);
  const options = useStorage(knowledgeOptionsStorage);

  const [directoryName, setDirectoryName] = useState<string | null>(null);
  const [dirLoading, setDirLoading] = useState(true);
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; message: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const isLightTheme = isLight ?? true;

  useEffect(() => {
    let cancelled = false;
    getKnowledgeDirectoryHandle()
      .then(handle => {
        if (!cancelled && handle) setDirectoryName(handle.name);
      })
      .catch(() => {
        if (!cancelled) setDirectoryName(null);
      })
      .finally(() => {
        if (!cancelled) setDirLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelectDirectory = useCallback(async () => {
    try {
      const handle = await window.showDirectoryPicker();
      await setKnowledgeDirectoryHandle(handle);
      setDirectoryName(handle.name);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') console.error(err);
    }
  }, []);

  const handleClearDirectory = useCallback(async () => {
    await removeKnowledgeDirectoryHandle();
    setDirectoryName(null);
  }, []);

  const handleAddModel = useCallback(() => {
    const next = createDefaultModelConfig({
      isDefault: options.models.length === 0,
    });
    knowledgeOptionsStorage.set(prev => ({
      ...prev,
      models: [...prev.models, next],
      defaultModelId: prev.models.length === 0 ? next.id : prev.defaultModelId,
    }));
  }, [options.models.length]);

  const handleDeleteModel = useCallback((id: string) => {
    knowledgeOptionsStorage.set(prev => ({
      ...prev,
      models: prev.models.filter(m => m.id !== id),
      defaultModelId: prev.defaultModelId === id ? '' : prev.defaultModelId,
    }));
    sessionApiKeysStorage.set(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const handleSetDefault = useCallback((id: string) => {
    knowledgeOptionsStorage.set(prev => ({ ...prev, defaultModelId: id }));
  }, []);

  const handleUpdateModel = useCallback(
    (updated: ModelConfig) => {
      if (options.apiKeyStorageStrategy === 'session' && updated.apiKey) {
        sessionApiKeysStorage.set(prev => ({ ...prev, [updated.id]: updated.apiKey }));
      }
      const toStore = options.apiKeyStorageStrategy === 'session' ? { ...updated, apiKey: '' } : updated;
      knowledgeOptionsStorage.set(prev => ({
        ...prev,
        models: prev.models.map(m => (m.id === toStore.id ? toStore : m)),
      }));
      setEditingId(null);
    },
    [options.apiKeyStorageStrategy],
  );

  const handleTestModel = useCallback(
    async (model: ModelConfig) => {
      const apiKey =
        options.apiKeyStorageStrategy === 'session'
          ? ((await sessionApiKeysStorage.get())[model.id] ?? model.apiKey)
          : model.apiKey;
      if (!apiKey?.trim()) {
        setTestResult({ id: model.id, ok: false, message: '请先填写 API Key' });
        return;
      }
      const url = `${model.baseUrl.replace(/\/$/, '')}/chat/completions`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), model.timeoutMs);
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: model.model,
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens: 5,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (res.ok) {
          setTestResult({ id: model.id, ok: true, message: '连接成功' });
        } else {
          const text = await res.text();
          setTestResult({ id: model.id, ok: false, message: `${res.status}: ${text.slice(0, 80)}` });
        }
      } catch (e) {
        clearTimeout(timeout);
        setTestResult({
          id: model.id,
          ok: false,
          message: (e as Error).message || '请求失败',
        });
      }
      setTimeout(() => setTestResult(null), 3000);
    },
    [options.apiKeyStorageStrategy],
  );

  const goGithubSite = () => chrome.tabs.create(PROJECT_URL_OBJECT);

  return (
    <div className={cn('min-h-screen p-6', isLightTheme ? 'bg-slate-50 text-gray-900' : 'bg-gray-800 text-gray-100')}>
      <div className="mx-auto max-w-2xl space-y-8">
        <header className="flex items-center justify-between border-b pb-4">
          <button onClick={goGithubSite} className="flex items-center gap-2">
            <img
              src={chrome.runtime.getURL(
                isLightTheme ? 'options/logo_horizontal.svg' : 'options/logo_horizontal_dark.svg',
              )}
              className="h-8"
              alt="logo"
            />
          </button>
          <ToggleButton onClick={exampleThemeStorage.toggle}>主题</ToggleButton>
        </header>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">AI 模型</h2>
          <p className="text-sm opacity-80">配置多个模型，选择默认模型用于总结。</p>
          <div className="space-y-2">
            {(options.models ?? []).map(m => (
              <div
                key={m.id}
                className={cn(
                  'rounded-lg border p-3',
                  isLightTheme ? 'border-gray-200 bg-white' : 'border-gray-600 bg-gray-700',
                )}>
                {editingId === m.id ? (
                  <ModelForm
                    model={m}
                    onSave={updated => handleUpdateModel(updated)}
                    onCancel={() => setEditingId(null)}
                    isLight={isLightTheme}
                    apiKeyStrategy={options.apiKeyStorageStrategy}
                  />
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="font-medium">{m.name || m.model}</span>
                      {options.defaultModelId === m.id && <span className="ml-2 text-xs text-blue-600">默认</span>}
                    </div>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        className="rounded px-2 py-1 text-sm hover:bg-black/10"
                        onClick={() => handleTestModel(m)}>
                        测试
                      </button>
                      {testResult?.id === m.id && (
                        <span className={cn('text-sm', testResult.ok ? 'text-green-600' : 'text-red-600')}>
                          {testResult.message}
                        </span>
                      )}
                      <button
                        type="button"
                        className="rounded px-2 py-1 text-sm hover:bg-black/10"
                        onClick={() => handleSetDefault(m.id)}>
                        设为默认
                      </button>
                      <button
                        type="button"
                        className="rounded px-2 py-1 text-sm hover:bg-black/10"
                        onClick={() => setEditingId(m.id)}>
                        编辑
                      </button>
                      <button
                        type="button"
                        className="rounded px-2 py-1 text-sm text-red-600 hover:bg-red-500/20"
                        onClick={() => handleDeleteModel(m.id)}>
                        删除
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            className="rounded border border-dashed px-4 py-2 text-sm hover:bg-black/5"
            onClick={handleAddModel}>
            添加模型
          </button>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">API Key 存储</h2>
          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="apiKeyStrategy"
                checked={options.apiKeyStorageStrategy === 'local'}
                onChange={() =>
                  knowledgeOptionsStorage.set(prev => ({
                    ...prev,
                    apiKeyStorageStrategy: 'local' as ApiKeyStorageStrategy,
                  }))
                }
              />
              保存在本地扩展
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="apiKeyStrategy"
                checked={options.apiKeyStorageStrategy === 'session'}
                onChange={() =>
                  knowledgeOptionsStorage.set(prev => ({
                    ...prev,
                    apiKeyStorageStrategy: 'session' as ApiKeyStorageStrategy,
                  }))
                }
              />
              仅本次会话
            </label>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">知识库目录</h2>
          <p className="text-sm opacity-80">选择本地知识库根目录，总结将保存到对应子目录。</p>
          {dirLoading ? (
            <p className="text-sm opacity-70">加载中…</p>
          ) : (
            <div className="flex items-center gap-2">
              <span className="rounded bg-black/10 px-2 py-1 text-sm">{directoryName ?? '未选择'}</span>
              <button
                type="button"
                className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
                onClick={handleSelectDirectory}>
                选择目录
              </button>
              {directoryName && (
                <button
                  type="button"
                  className="rounded px-3 py-1 text-sm hover:bg-black/10"
                  onClick={handleClearDirectory}>
                  清除
                </button>
              )}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <header>
            <h2 className="text-lg font-semibold tracking-tight">分类目录结构</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              配置保存到本地知识库时使用的一级目录名和二级目录名。
            </p>
          </header>

          {(() => {
            const categories: LogicalPrimaryCategoryConfig[] =
              options.categoriesConfig && options.categoriesConfig.length > 0
                ? options.categoriesConfig
                : buildDefaultCategoriesConfig();
            return (
              <div className="space-y-6">
                <div className="grid gap-6">
                  {categories.map(primaryCfg => (
                    <div
                      key={primaryCfg.id}
                      className={cn(
                        'group overflow-hidden rounded-xl border shadow-sm transition-all hover:shadow-md',
                        isLightTheme
                          ? 'border-gray-200 bg-white shadow-gray-200/50'
                          : 'border-gray-700 bg-gray-800 shadow-none',
                      )}>
                      {/* Primary Header */}
                      <div
                        className={cn(
                          'flex items-center gap-4 border-b p-4',
                          isLightTheme ? 'border-gray-100 bg-gray-50/50' : 'border-gray-700 bg-gray-800',
                        )}>
                        <div className="flex-1 space-y-1">
                          <label
                            htmlFor={`primary-dir-${primaryCfg.id}`}
                            className="text-xs font-medium uppercase tracking-wider text-gray-500">
                            一级目录名
                          </label>
                          <input
                            id={`primary-dir-${primaryCfg.id}`}
                            type="text"
                            value={primaryCfg.dirName}
                            onChange={e => {
                              const value = e.target.value;
                              knowledgeOptionsStorage.set(prev => {
                                const prevCategories =
                                  prev.categoriesConfig && prev.categoriesConfig.length > 0
                                    ? prev.categoriesConfig
                                    : buildDefaultCategoriesConfig();
                                return {
                                  ...prev,
                                  categoriesConfig: prevCategories.map(c =>
                                    c.id === primaryCfg.id ? { ...c, dirName: value } : c,
                                  ),
                                };
                              });
                            }}
                            placeholder={
                              DEFAULT_PRIMARY_TO_DIR[primaryCfg.id as keyof typeof DEFAULT_PRIMARY_TO_DIR] ??
                              String(primaryCfg.id)
                            }
                            className={cn(
                              'w-full rounded-md border px-3 py-2 text-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20',
                              isLightTheme
                                ? 'border-gray-200 bg-white placeholder-gray-400'
                                : 'border-gray-600 bg-gray-900 placeholder-gray-500',
                            )}
                          />
                        </div>
                        <button
                          type="button"
                          className={cn(
                            'flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
                            'text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20',
                          )}
                          title="删除一级目录"
                          onClick={() =>
                            knowledgeOptionsStorage.set(prev => {
                              const prevCategories =
                                prev.categoriesConfig && prev.categoriesConfig.length > 0
                                  ? prev.categoriesConfig
                                  : buildDefaultCategoriesConfig();
                              return {
                                ...prev,
                                categoriesConfig: prevCategories.filter(c => c.id !== primaryCfg.id),
                              };
                            })
                          }>
                          <TrashIcon />
                        </button>
                      </div>

                      {/* Subcategories Body */}
                      <div className="space-y-3 p-4">
                        <span className="text-xs font-medium uppercase tracking-wider text-gray-500">二级目录映射</span>
                        {primaryCfg.subCategories.length > 0 ? (
                          <div className="grid gap-3 sm:grid-cols-2">
                            {primaryCfg.subCategories.map(sub => (
                              <div
                                key={sub.id}
                                className={cn(
                                  'flex items-center gap-2 rounded-lg border p-2 pl-3',
                                  isLightTheme ? 'border-gray-100 bg-gray-50' : 'border-gray-700 bg-gray-900',
                                )}>
                                <div className="min-w-0 flex-1">
                                  <div className="mb-0.5 truncate text-[10px] font-medium uppercase tracking-wide text-gray-400">
                                    {sub.id}
                                  </div>
                                  <input
                                    type="text"
                                    value={sub.dirName}
                                    onChange={e => {
                                      const value = e.target.value;
                                      knowledgeOptionsStorage.set(prev => {
                                        const prevCategories =
                                          prev.categoriesConfig && prev.categoriesConfig.length > 0
                                            ? prev.categoriesConfig
                                            : buildDefaultCategoriesConfig();
                                        return {
                                          ...prev,
                                          categoriesConfig: prevCategories.map(c =>
                                            c.id === primaryCfg.id
                                              ? {
                                                  ...c,
                                                  subCategories: c.subCategories.map(s =>
                                                    s.id === sub.id ? { ...s, dirName: value } : s,
                                                  ),
                                                }
                                              : c,
                                          ),
                                        };
                                      });
                                    }}
                                    placeholder={sub.id}
                                    className={cn(
                                      'w-full border-0 bg-transparent p-0 text-sm placeholder-gray-400/50 focus:ring-0',
                                      isLightTheme ? 'text-gray-900' : 'text-gray-100',
                                    )}
                                  />
                                </div>
                                <button
                                  type="button"
                                  className={cn(
                                    'flex h-8 w-8 items-center justify-center rounded-md transition-colors',
                                    'text-gray-400 hover:bg-white hover:text-red-600 dark:hover:bg-gray-800',
                                  )}
                                  onClick={() =>
                                    knowledgeOptionsStorage.set(prev => {
                                      const prevCategories =
                                        prev.categoriesConfig && prev.categoriesConfig.length > 0
                                          ? prev.categoriesConfig
                                          : buildDefaultCategoriesConfig();
                                      return {
                                        ...prev,
                                        categoriesConfig: prevCategories.map(c =>
                                          c.id === primaryCfg.id
                                            ? {
                                                ...c,
                                                subCategories: c.subCategories.filter(s => s.id !== sub.id),
                                              }
                                            : c,
                                        ),
                                      };
                                    })
                                  }>
                                  <XMarkIcon />
                                </button>
                              </div>
                            ))}
                            {/* Add Sub Button */}
                            <button
                              type="button"
                              className={cn(
                                'flex h-[62px] w-full items-center justify-center gap-2 rounded-lg border border-dashed transition-all',
                                'text-sm font-medium text-gray-500 hover:border-blue-400 hover:bg-blue-50/50 hover:text-blue-600',
                                isLightTheme ? 'border-gray-200' : 'border-gray-700 hover:bg-blue-900/20',
                              )}
                              onClick={() =>
                                knowledgeOptionsStorage.set(prev => {
                                  const prevCategories =
                                    prev.categoriesConfig && prev.categoriesConfig.length > 0
                                      ? prev.categoriesConfig
                                      : buildDefaultCategoriesConfig();
                                  const nextCategories = prevCategories.map(c =>
                                    c.id === primaryCfg.id
                                      ? {
                                          ...c,
                                          subCategories: [
                                            ...c.subCategories,
                                            {
                                              id: `Sub-${Date.now()}`,
                                              label: `Sub-${Date.now()}`,
                                              dirName: '',
                                            },
                                          ],
                                        }
                                      : c,
                                  );
                                  return {
                                    ...prev,
                                    categoriesConfig: nextCategories,
                                  };
                                })
                              }>
                              <PlusIcon />
                              <span>添加二级</span>
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-200 py-8 text-center dark:border-gray-700">
                            <p className="mb-3 text-sm text-gray-500">暂无二级目录</p>
                            <button
                              type="button"
                              className="flex items-center gap-2 rounded-md bg-blue-50 px-4 py-2 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30"
                              onClick={() =>
                                knowledgeOptionsStorage.set(prev => {
                                  const prevCategories =
                                    prev.categoriesConfig && prev.categoriesConfig.length > 0
                                      ? prev.categoriesConfig
                                      : buildDefaultCategoriesConfig();
                                  const nextCategories = prevCategories.map(c =>
                                    c.id === primaryCfg.id
                                      ? {
                                          ...c,
                                          subCategories: [
                                            ...c.subCategories,
                                            {
                                              id: `Sub-${Date.now()}`,
                                              label: `Sub-${Date.now()}`,
                                              dirName: '',
                                            },
                                          ],
                                        }
                                      : c,
                                  );
                                  return {
                                    ...prev,
                                    categoriesConfig: nextCategories,
                                  };
                                })
                              }>
                              <PlusIcon />
                              <span>添加第一个二级目录</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  className={cn(
                    'flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed transition-all',
                    'text-sm font-medium text-gray-500 hover:border-blue-400 hover:bg-blue-50/50 hover:text-blue-600',
                    isLightTheme ? 'border-gray-300' : 'border-gray-600 hover:bg-blue-900/20',
                  )}
                  onClick={() =>
                    knowledgeOptionsStorage.set(prev => {
                      const prevCategories =
                        prev.categoriesConfig && prev.categoriesConfig.length > 0
                          ? prev.categoriesConfig
                          : buildDefaultCategoriesConfig();
                      const id = `Primary-${Date.now()}`;
                      const next: LogicalPrimaryCategoryConfig = {
                        id,
                        label: id,
                        dirName: '',
                        subCategories: [],
                      };
                      return {
                        ...prev,
                        categoriesConfig: [...prevCategories, next],
                      };
                    })
                  }>
                  <PlusIcon />
                  <span>添加一级分类目录</span>
                </button>
              </div>
            );
          })()}
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">保存选项</h2>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={options.saveFullText ?? false}
              onChange={e =>
                knowledgeOptionsStorage.set(prev => ({
                  ...prev,
                  saveFullText: e.target.checked,
                }))
              }
            />
            保存原文全文（默认仅保存摘要与原文摘要）
          </label>
        </section>
      </div>
    </div>
  );
};

const ModelForm = ({
  model,
  onSave,
  onCancel,
  isLight,
  apiKeyStrategy,
}: {
  model: ModelConfig;
  onSave: (m: ModelConfig) => void;
  onCancel: () => void;
  isLight: boolean;
  apiKeyStrategy: ApiKeyStorageStrategy;
}): JSX.Element => {
  const [name, setName] = useState(model.name);
  const [baseUrl, setBaseUrl] = useState(model.baseUrl);
  const [modelId, setModelId] = useState(model.model);
  const [apiKey, setApiKey] = useState(model.apiKey);
  const [timeoutMs, setTimeoutMs] = useState(model.timeoutMs);

  useEffect(() => {
    if (apiKeyStrategy === 'session') {
      sessionApiKeysStorage.get().then(keys => setApiKey(keys[model.id] ?? model.apiKey));
    }
  }, [apiKeyStrategy, model.id, model.apiKey]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...model,
      name,
      baseUrl: baseUrl.trim(),
      model: modelId.trim(),
      apiKey: apiKey.trim(),
      timeoutMs,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div>
        <label className="block text-xs opacity-70" htmlFor="model-name">
          名称
        </label>
        <input
          id="model-name"
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          className={cn(
            'w-full rounded border px-2 py-1 text-sm',
            isLight ? 'border-gray-300 bg-white' : 'border-gray-500 bg-gray-800',
          )}
          placeholder="例如：OpenAI"
        />
      </div>
      <div>
        <label className="block text-xs opacity-70" htmlFor="model-base-url">
          Base URL
        </label>
        <input
          id="model-base-url"
          type="url"
          value={baseUrl}
          onChange={e => setBaseUrl(e.target.value)}
          className={cn(
            'w-full rounded border px-2 py-1 text-sm',
            isLight ? 'border-gray-300 bg-white' : 'border-gray-500 bg-gray-800',
          )}
        />
      </div>
      <div>
        <label className="block text-xs opacity-70" htmlFor="model-id">
          模型名
        </label>
        <input
          id="model-id"
          type="text"
          value={modelId}
          onChange={e => setModelId(e.target.value)}
          className={cn(
            'w-full rounded border px-2 py-1 text-sm',
            isLight ? 'border-gray-300 bg-white' : 'border-gray-500 bg-gray-800',
          )}
          placeholder="gpt-4o-mini"
        />
      </div>
      <div>
        <label className="block text-xs opacity-70" htmlFor="model-api-key">
          API Key {apiKeyStrategy === 'session' && '(仅本次会话)'}
        </label>
        <input
          id="model-api-key"
          type="password"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          className={cn(
            'w-full rounded border px-2 py-1 text-sm',
            isLight ? 'border-gray-300 bg-white' : 'border-gray-500 bg-gray-800',
          )}
        />
      </div>
      <div>
        <label className="block text-xs opacity-70" htmlFor="model-timeout">
          超时(ms)
        </label>
        <input
          id="model-timeout"
          type="number"
          value={timeoutMs}
          onChange={e => setTimeoutMs(Number(e.target.value))}
          className={cn(
            'w-full rounded border px-2 py-1 text-sm',
            isLight ? 'border-gray-300 bg-white' : 'border-gray-500 bg-gray-800',
          )}
        />
      </div>
      <div className="flex gap-2">
        <button type="submit" className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700">
          保存
        </button>
        <button type="button" className="rounded px-3 py-1 text-sm hover:bg-black/10" onClick={onCancel}>
          取消
        </button>
      </div>
    </form>
  );
};

export default withErrorBoundary(withSuspense(Options, <LoadingSpinner />), ErrorDisplay);
