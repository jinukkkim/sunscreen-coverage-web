// Client-side recognition adapter. The UI only knows `recognizeLabel`; swapping the backend
// (another model, on-device OCR) means writing another adapter with the same shape.

import { emptyProfile } from './product.js';

export class LabelRecognitionError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/**
 * @param {{ fetch?: typeof fetch, endpoint?: string, timeoutMs?: number }} options
 * @returns {(images: { mimeType: string, data: string }[], signal?: AbortSignal) => Promise<object>}
 */
export function createVisionAdapter({ fetch = globalThis.fetch, endpoint = '/api/recognize', timeoutMs = 45_000 } = {}) {
  return async function recognize(images, signal) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ images }),
        signal: controller.signal,
      });
      let body = null;
      try { body = await response.json(); } catch { body = null; }
      if (!response.ok || !body?.ok) {
        throw new LabelRecognitionError(body?.code ?? `http-${response.status}`, body?.message ?? '분석 서버에 연결하지 못했습니다.');
      }
      return body.result;
    } catch (error) {
      if (error instanceof LabelRecognitionError) throw error;
      if (error.name === 'AbortError') {
        throw new LabelRecognitionError(signal?.aborted ? 'cancelled' : 'timeout', signal?.aborted ? '분석을 취소했습니다.' : '분석 시간이 초과됐습니다.');
      }
      throw new LabelRecognitionError('network', '분석 서버에 연결하지 못했습니다. 직접 입력해 주세요.');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  };
}

export async function recognizeLabel(images, { adapter, signal } = {}) {
  if (!adapter) throw new LabelRecognitionError('no-adapter', '인식 어댑터가 설정되지 않았습니다.');
  return adapter(images, signal);
}

// Turn a server result into an editable profile draft. Nothing here is saved; the user confirms.
export function draftFromRecognition(result) {
  const draft = emptyProfile();
  const brand = result.brand ?? '';
  const productName = result.productName ?? '';
  draft.name = [brand, productName].filter(Boolean).join(' ').trim().slice(0, 60);
  draft.brand = brand;
  draft.sellerName = result.sellerName ?? '';
  draft.spf = Number.isInteger(result.spf) ? result.spf : null;
  draft.spfPlus = Boolean(result.spfPlus);
  draft.paGrade = [1, 2, 3, 4].includes(result.paGrade) ? result.paGrade : null;
  draft.form = result.form ?? 'unknown';
  draft.waterResistance = result.waterResistance ?? 'unknown';
  draft.ingredients = Array.isArray(result.ingredients) ? result.ingredients : [];
  draft.source = 'photo-ai';
  draft.confidence = { ...(result.confidence ?? {}) };
  return draft;
}

export const LOW_CONFIDENCE = 0.6;

export function needsReview(draft, field) {
  const value = draft.confidence?.[field];
  return value === undefined || value < LOW_CONFIDENCE;
}
