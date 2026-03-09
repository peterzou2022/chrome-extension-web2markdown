import { extractFromDocument } from '@extension/shared';
import { sampleFunction } from '@src/sample-function';

console.log('[CEB] All content script loaded');

void sampleFunction();

chrome.runtime.onMessage.addListener(
  (msg: { kind?: string }, _sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) => {
    if (msg.kind !== 'extract') return false;
    try {
      const selectedText =
        typeof window.getSelection?.()?.toString === 'function'
          ? window.getSelection()!.toString().trim() || null
          : null;
      const result = extractFromDocument(document, selectedText);
      sendResponse({ ok: true, data: result });
    } catch (err) {
      sendResponse({ ok: false, error: (err as Error).message });
    }
    return true;
  },
);
