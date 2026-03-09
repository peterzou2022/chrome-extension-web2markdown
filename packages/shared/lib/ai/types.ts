/**
 * V1: single provider; fixed as openai-compatible.
 */
export const AI_PROVIDER_OPENAI_COMPATIBLE = 'openai-compatible';

/** Default request timeout in ms. */
export const DEFAULT_MODEL_TIMEOUT_MS = 60_000;

/**
 * Model configuration stored in extension and used for API calls.
 */
export interface ModelConfig {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  enabled: boolean;
  isDefault: boolean;
  timeoutMs: number;
}

/**
 * Fixed AI output schema returned by the summarization prompt.
 */
export interface AiSummaryOutput {
  titleZh: string;
  oneSentenceSummary: string;
  summary: string;
  keyPoints: string[];
  sourceAbstract: string;
  primaryCategory: string;
  subCategory: string;
  tags: string[];
}

/**
 * Validation: tags 1-5, categories must be from allowed sets.
 */
export const MAX_TAGS = 5;
export const MIN_TAGS = 1;

/** How API key is persisted. */
export type ApiKeyStorageStrategy = 'session' | 'local';

/** Persisted options for the knowledge extension. */
export interface KnowledgeOptionsState {
  models: ModelConfig[];
  defaultModelId: string;
  apiKeyStorageStrategy: ApiKeyStorageStrategy;
  saveFullText: boolean;
}
