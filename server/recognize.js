// Label recognition handler. Pure logic lives here so it can be tested with fixtures;
// the HTTP wiring is in server/index.js. Images are forwarded to the model and never stored.

import { PRODUCT_FORMS, WATER_RESISTANCE, normalizeIngredient } from '../src/lib/product.js';

export const MAX_IMAGES = 2;
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // after client-side downscale
export const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const RECOGNITION_FIELDS = ['brand', 'productName', 'sellerName', 'spf', 'spfPlus', 'paGrade', 'form', 'waterResistance', 'ingredients'];

// Gemini responseSchema (OpenAPI subset). Nullable fields let the model say "not visible".
export const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    brand: { type: 'STRING', nullable: true },
    productName: { type: 'STRING', nullable: true },
    sellerName: { type: 'STRING', nullable: true, description: '화장품책임판매업자 as printed' },
    spf: { type: 'INTEGER', nullable: true },
    spfPlus: { type: 'BOOLEAN' },
    paGrade: { type: 'INTEGER', nullable: true, description: 'number of + after PA, 1-4' },
    form: { type: 'STRING', enum: PRODUCT_FORMS },
    waterResistance: { type: 'STRING', enum: WATER_RESISTANCE },
    ingredients: { type: 'ARRAY', items: { type: 'STRING' } },
    confidence: {
      type: 'OBJECT',
      properties: Object.fromEntries(RECOGNITION_FIELDS.map(f => [f, { type: 'NUMBER' }])),
    },
    notVisible: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['spfPlus', 'form', 'waterResistance', 'ingredients', 'confidence', 'notVisible'],
};

export function buildPrompt() {
  return [
    'You read sunscreen packaging photos and transcribe ONLY what is printed. Never guess or infer.',
    'Photos may be the front, back or side of a Korean or imported sunscreen. Text may be Korean and/or English.',
    'Return JSON matching the schema:',
    '- brand: brand name as printed, else null.',
    '- productName: product name as printed (without SPF/PA tokens), else null.',
    '- sellerName: the company after "화장품책임판매업자" or "책임판매업자" if printed, else null.',
    '- spf: integer after "SPF" if printed, else null. If printed as "50+", spf=50 and spfPlus=true.',
    '- paGrade: count of "+" after "PA" (PA+ =1, PA++++ =4), else null.',
    `- form: one of ${PRODUCT_FORMS.join(', ')} based on the product type words (크림/cream, 로션/밀크/lotion, 젤/gel, 스틱/stick, 스프레이/미스트/spray). Use unknown when not printed.`,
    `- waterResistance: one of ${WATER_RESISTANCE.join(', ')}. 40min/80min only when a minutes figure is printed next to water resistant/워터프루프/내수성. none only when the label says it is not water resistant. Otherwise unknown.`,
    '- ingredients: the full ingredient list in printed order, one entry per ingredient, exactly as printed (Korean or INCI). Empty array if no ingredient list is visible.',
    '- confidence: 0 to 1 per field for how legible the printed value was.',
    '- notVisible: names of fields you could not read from the photos.',
    'Do not add fields. Do not translate ingredient names. Do not fill a value because it is typical for sunscreens.',
  ].join('\n');
}

export class RecognitionError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function validateImages(images) {
  if (!Array.isArray(images) || images.length === 0) throw new RecognitionError('no-images', '사진이 없습니다.');
  if (images.length > MAX_IMAGES) throw new RecognitionError('too-many-images', `사진은 최대 ${MAX_IMAGES}장까지 보낼 수 있습니다.`);
  return images.map(image => {
    if (!image || typeof image !== 'object') throw new RecognitionError('bad-image', '사진 형식이 올바르지 않습니다.');
    const { mimeType, data } = image;
    if (!ALLOWED_MIME.has(mimeType)) throw new RecognitionError('bad-mime', 'JPG, PNG, WebP 사진만 지원합니다.');
    if (typeof data !== 'string' || !/^[A-Za-z0-9+/]+=*$/.test(data)) throw new RecognitionError('bad-image', '사진 데이터가 올바르지 않습니다.');
    const bytes = Math.floor(data.length * 3 / 4) - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0);
    if (bytes > MAX_IMAGE_BYTES) throw new RecognitionError('image-too-large', '사진이 너무 큽니다. 다시 촬영해 주세요.', 413);
    return { mimeType, data };
  });
}

// Coerce whatever the model returned into the documented shape. Anything off-schema becomes
// null/unknown with zero confidence so the UI asks the user instead of trusting it.
export function parseModelOutput(text) {
  let raw;
  try {
    raw = JSON.parse(typeof text === 'string' ? text.replace(/^```(?:json)?\s*|\s*```$/g, '') : text);
  } catch {
    throw new RecognitionError('bad-model-output', '분석 결과를 해석하지 못했습니다.', 502);
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new RecognitionError('bad-model-output', '분석 결과를 해석하지 못했습니다.', 502);

  const confidence = {};
  const inConf = raw.confidence && typeof raw.confidence === 'object' ? raw.confidence : {};
  for (const field of RECOGNITION_FIELDS) {
    const c = Number(inConf[field]);
    confidence[field] = Number.isFinite(c) ? Math.min(1, Math.max(0, c)) : 0;
  }

  const str = v => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 120) : null);
  let spf = Number.isInteger(raw.spf) ? raw.spf : null;
  if (spf !== null && (spf < 15 || spf > 100)) { spf = null; confidence.spf = 0; }
  let paGrade = Number.isInteger(raw.paGrade) ? raw.paGrade : null;
  if (paGrade !== null && (paGrade < 1 || paGrade > 4)) { paGrade = null; confidence.paGrade = 0; }
  const form = PRODUCT_FORMS.includes(raw.form) ? raw.form : 'unknown';
  if (form === 'unknown') confidence.form = Math.min(confidence.form, 0.5);
  const waterResistance = WATER_RESISTANCE.includes(raw.waterResistance) ? raw.waterResistance : 'unknown';
  const ingredients = Array.isArray(raw.ingredients)
    ? raw.ingredients.map(normalizeIngredient).filter(Boolean).slice(0, 200) : [];
  const notVisible = Array.isArray(raw.notVisible) ? raw.notVisible.filter(v => RECOGNITION_FIELDS.includes(v)) : [];

  return {
    brand: str(raw.brand),
    productName: str(raw.productName),
    sellerName: str(raw.sellerName),
    spf,
    spfPlus: Boolean(raw.spfPlus) && spf !== null,
    paGrade,
    form,
    waterResistance,
    ingredients,
    confidence,
    notVisible,
  };
}

// Gemini REST call. Kept tiny and dependency-free; swap this function to use another provider.
export function createGeminiCaller({ apiKey, model = 'gemini-2.5-flash', fetch = globalThis.fetch, timeoutMs = 30_000 }) {
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  return async function callModel({ prompt, images }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }, ...images.map(i => ({ inline_data: { mime_type: i.mimeType, data: i.data } }))] }],
          generationConfig: { temperature: 0, response_mime_type: 'application/json', response_schema: RESPONSE_SCHEMA },
        }),
      });
      if (!response.ok) {
        const status = response.status === 429 ? 429 : 502;
        throw new RecognitionError('model-unavailable', '분석 서비스를 사용할 수 없습니다. 직접 입력해 주세요.', status);
      }
      const body = await response.json();
      const text = body?.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('') ?? '';
      if (!text) throw new RecognitionError('bad-model-output', '분석 결과가 비어 있습니다.', 502);
      return text;
    } catch (error) {
      if (error instanceof RecognitionError) throw error;
      if (error.name === 'AbortError') throw new RecognitionError('timeout', '분석 시간이 초과됐습니다.', 504);
      throw new RecognitionError('model-unavailable', '분석 서비스에 연결하지 못했습니다.', 502);
    } finally {
      clearTimeout(timer);
    }
  };
}

// Transport-agnostic handler: body in, { status, body } out.
export function createRecognizeHandler({ callModel, prompt = buildPrompt() }) {
  return async function handle(body) {
    try {
      const images = validateImages(body?.images);
      const text = await callModel({ prompt, images });
      const result = parseModelOutput(text);
      return { status: 200, body: { ok: true, result } };
    } catch (error) {
      if (error instanceof RecognitionError) {
        return { status: error.status, body: { ok: false, code: error.code, message: error.message } };
      }
      return { status: 500, body: { ok: false, code: 'internal', message: '분석 중 오류가 발생했습니다.' } };
    }
  };
}
