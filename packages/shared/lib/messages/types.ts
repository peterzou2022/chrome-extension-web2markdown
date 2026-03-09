import type { AiSummaryOutput } from '../ai/types.js';
import type { ExtractedPageInfo, MarkdownDocumentPayload } from '../knowledge/types.js';

/** Message kinds for extension internal messaging (background <-> pages). */
export type MessageKind = 'extract' | 'summarize' | 'testModel' | 'saveDocument' | 'getOptions';

// ---- Request types ----

export interface ExtractRequest {
  kind: 'extract';
  tabId: number;
}

export interface SummarizeRequest {
  kind: 'summarize';
  tabId: number;
  pageInfo: ExtractedPageInfo;
  selectedTextOnly?: boolean;
}

export interface TestModelRequest {
  kind: 'testModel';
  modelId: string;
}

export interface SaveDocumentRequest {
  kind: 'saveDocument';
  payload: MarkdownDocumentPayload;
  knowledgePath: string;
  filename: string;
}

export interface GetOptionsRequest {
  kind: 'getOptions';
}

export type MessageRequest =
  | ExtractRequest
  | SummarizeRequest
  | TestModelRequest
  | SaveDocumentRequest
  | GetOptionsRequest;

// ---- Response types ----

export interface ExtractResponse {
  kind: 'extract';
  ok: true;
  data: ExtractedPageInfo;
}

export interface ExtractErrorResponse {
  kind: 'extract';
  ok: false;
  error: string;
}

export interface SummarizeResponse {
  kind: 'summarize';
  ok: true;
  data: AiSummaryOutput;
}

export interface SummarizeErrorResponse {
  kind: 'summarize';
  ok: false;
  error: string;
}

export interface TestModelResponse {
  kind: 'testModel';
  ok: true;
}

export interface TestModelErrorResponse {
  kind: 'testModel';
  ok: false;
  error: string;
}

export interface SaveDocumentResponse {
  kind: 'saveDocument';
  ok: true;
}

export interface SaveDocumentErrorResponse {
  kind: 'saveDocument';
  ok: false;
  error: string;
}

export interface GetOptionsResponse {
  kind: 'getOptions';
  ok: true;
  data: unknown;
}

export type MessageResponse =
  | ExtractResponse
  | ExtractErrorResponse
  | SummarizeResponse
  | SummarizeErrorResponse
  | TestModelResponse
  | TestModelErrorResponse
  | SaveDocumentResponse
  | SaveDocumentErrorResponse
  | GetOptionsResponse;
