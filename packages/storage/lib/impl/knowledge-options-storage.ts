import { createStorage, StorageEnum } from '../base/index.js';
import type { KnowledgeOptionsState, ModelConfig } from '@extension/shared';

const DEFAULT_STATE: KnowledgeOptionsState = {
  models: [],
  defaultModelId: '',
  apiKeyStorageStrategy: 'local',
  saveFullText: false,
  categoriesConfig: [],
};

const STORAGE_KEY = 'knowledge-options';

const storage = createStorage<KnowledgeOptionsState>(STORAGE_KEY, DEFAULT_STATE, {
  storageEnum: StorageEnum.Local,
  liveUpdate: true,
  serialization: {
    serialize: (v: KnowledgeOptionsState) => JSON.stringify(v),
    deserialize: (s: string | undefined | null) =>
      s == null || s === undefined ? DEFAULT_STATE : (JSON.parse(s) as KnowledgeOptionsState),
  },
});

export const knowledgeOptionsStorage = storage;

/** Helper: generate a stable id for new models. */
export const createModelId = (): string => `model_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

/** Default model config template. */
export const createDefaultModelConfig = (overrides: Partial<ModelConfig> = {}): ModelConfig => ({
  id: createModelId(),
  name: '',
  provider: 'openai-compatible',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  apiKey: '',
  enabled: true,
  isDefault: false,
  timeoutMs: 60_000,
  ...overrides,
});
