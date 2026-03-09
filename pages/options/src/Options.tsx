import '@src/Options.css';
import {
  PROJECT_URL_OBJECT,
  useStorage,
  withErrorBoundary,
  withSuspense,
  getKnowledgeDirectoryHandle,
  removeKnowledgeDirectoryHandle,
  setKnowledgeDirectoryHandle,
} from '@extension/shared';
import {
  exampleThemeStorage,
  knowledgeOptionsStorage,
  sessionApiKeysStorage,
  createDefaultModelConfig,
} from '@extension/storage';
import { cn, ErrorDisplay, LoadingSpinner, ToggleButton } from '@extension/ui';
import { useCallback, useEffect, useState } from 'react';
import type { ApiKeyStorageStrategy, ModelConfig } from '@extension/shared';

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
