// Label recognition handler. Pure logic lives here so it can be tested with fixtures;
// the HTTP wiring is in server/index.js. Images are forwarded to the model and never stored.

import { PRODUCT_FORMS, WATER_RESISTANCE, normalizeIngredient } from '../src/lib/product.js';

export const MAX_IMAGES = 2;
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // after client-side downscale
export const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const RECOGNITION_FIELDS = ['brand', 'productName', 'sellerName', 'spf', 'spfPlus', 'paGrade', 'form', 'waterResistance', 'ingredients'];
export const CANDIDATE_FIELDS = ['brand', 'productName', 'sellerName', 'spf', 'spfPlus', 'paGrade', 'form', 'waterResistance'];
export const MAX_CANDIDATES = 3;

const READING_PROPERTIES = {
  brand: { type: 'STRING', nullable: true },
  productName: { type: 'STRING', nullable: true },
  sellerName: { type: 'STRING', nullable: true, description: '화장품책임판매업자 as printed' },
  spf: { type: 'INTEGER', nullable: true },
  spfPlus: { type: 'BOOLEAN' },
  paGrade: { type: 'INTEGER', nullable: true, description: 'number of + after PA, 1-4' },
  form: { type: 'STRING', enum: PRODUCT_FORMS },
  waterResistance: { type: 'STRING', enum: WATER_RESISTANCE },
};

// Gemini responseSchema (OpenAPI subset). Nullable fields let the model say "not visible".
// `candidates` holds up to 3 ranked readings of the product identity; the top-level fields
// repeat the best one so older clients keep working.
export const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    ...READING_PROPERTIES,
    ingredients: { type: 'ARRAY', items: { type: 'STRING' } },
    confidence: {
      type: 'OBJECT',
      properties: Object.fromEntries(RECOGNITION_FIELDS.map(f => [f, { type: 'NUMBER' }])),
    },
    notVisible: { type: 'ARRAY', items: { type: 'STRING' } },
    candidates: {
      type: 'ARRAY',
      description: 'Up to 3 alternative readings of the product identity, best first',
      items: {
        type: 'OBJECT',
        properties: {
          ...READING_PROPERTIES,
          label: { type: 'STRING', description: 'short Korean note on how this reading differs' },
          score: { type: 'NUMBER', description: '0-1 likelihood that this reading is correct' },
        },
        required: ['spfPlus', 'form', 'waterResistance', 'score'],
      },
    },
  },
  required: ['spfPlus', 'form', 'waterResistance', 'ingredients', 'confidence', 'notVisible', 'candidates'],
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
    '- candidates: 1 to 3 readings of the product identity (brand, productName, sellerName, spf, spfPlus, paGrade, form, waterResistance), best first, each with a score 0-1 and a short Korean label saying how it differs (e.g. "영문 표기", "라인명을 제품명으로", "SPF 30 표기 기준"). Give more than one only when the label genuinely allows different readings: Korean vs English name, brand vs product line, two SPF/PA figures, several products in one photo. The first candidate must equal the top-level fields.',
    'Do not add fields. Do not translate ingredient names. Do not fill a value because it is typical for sunscreens. Never invent a product that is not in the photos.',
  ].join('\n');
}

export class RecognitionError extends Error {
  constructor(code, message, status = 400, providerStatus = undefined) {
    super(message);
    this.code = code;
    this.status = status;
    this.providerStatus = providerStatus;
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

  const best = coerceReading(raw, confidence);
  const ingredients = Array.isArray(raw.ingredients)
    ? raw.ingredients.map(normalizeIngredient).filter(Boolean).slice(0, 200) : [];
  const notVisible = Array.isArray(raw.notVisible) ? raw.notVisible.filter(v => RECOGNITION_FIELDS.includes(v)) : [];

  const candidates = [];
  const seen = new Set();
  const push = (reading, label, score) => {
    const key = [reading.brand, reading.productName, reading.spf, reading.spfPlus, reading.paGrade, reading.form, reading.waterResistance].join('|').toLowerCase();
    if (seen.has(key) || candidates.length >= MAX_CANDIDATES) return;
    seen.add(key);
    candidates.push({ ...reading, label, score });
  };
  const rawCandidates = Array.isArray(raw.candidates) ? raw.candidates : [];
  for (const item of rawCandidates) {
    if (!item || typeof item !== 'object') continue;
    const score = Number(item.score);
    push(coerceReading(item, {}), typeof item.label === 'string' ? item.label.trim().slice(0, 40) : '', Number.isFinite(score) ? Math.min(1, Math.max(0, score)) : 0);
  }
  // The best reading is always offered, first, even if the model omitted candidates.
  if (!candidates.length || !sameReading(candidates[0], best)) {
    candidates.unshift({ ...best, label: '', score: averageConfidence(confidence) });
    if (candidates.length > MAX_CANDIDATES) candidates.length = MAX_CANDIDATES;
  }

  return { ...best, ingredients, confidence, notVisible, candidates };
}

function coerceReading(raw, confidence) {
  const str = v => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 120) : null);
  let spf = Number.isInteger(raw.spf) ? raw.spf : null;
  if (spf !== null && (spf < 15 || spf > 100)) { spf = null; confidence.spf = 0; }
  let paGrade = Number.isInteger(raw.paGrade) ? raw.paGrade : null;
  if (paGrade !== null && (paGrade < 1 || paGrade > 4)) { paGrade = null; confidence.paGrade = 0; }
  const form = PRODUCT_FORMS.includes(raw.form) ? raw.form : 'unknown';
  if (form === 'unknown' && confidence.form !== undefined) confidence.form = Math.min(confidence.form, 0.5);
  const waterResistance = WATER_RESISTANCE.includes(raw.waterResistance) ? raw.waterResistance : 'unknown';
  return {
    brand: str(raw.brand),
    productName: str(raw.productName),
    sellerName: str(raw.sellerName),
    spf,
    spfPlus: Boolean(raw.spfPlus) && spf !== null,
    paGrade,
    form,
    waterResistance,
  };
}

function sameReading(a, b) {
  return CANDIDATE_FIELDS.every(f => (a[f] ?? null) === (b[f] ?? null));
}

function averageConfidence(confidence) {
  const values = CANDIDATE_FIELDS.map(f => confidence[f] ?? 0);
  return Math.round(values.reduce((x, y) => x + y, 0) / values.length * 100) / 100;
}

// Gemini REST call. Kept tiny and dependency-free; swap this function to use another provider.
// Budget: primary model gets one attempt of `timeoutMs`; on a transient failure (503 high demand,
// 429, timeout) the fallback model gets one attempt of `fallbackTimeoutMs`. The sum stays under the
// client's 100 s so the user sees a result or an error, never a silent stall.
export function createGeminiCaller({
  apiKey, model = 'gemini-3.8-flash', fallbackModel = 'gemini-3.5-flash-lite', fetch = globalThis.fetch,
  timeoutMs = 35_000, fallbackTimeoutMs = 45_000, thinkingLevel = 'low', retryDelayMs = 1000,
  log = console.error, sleep = ms => new Promise(r => setTimeout(r, ms)),
}) {
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

  async function attempt(targetModel, { prompt, images }, budgetMs) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent`;
    const controller = new AbortController();
    const started = Date.now();
    const timer = setTimeout(() => controller.abort(), budgetMs);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }, ...images.map(i => ({ inline_data: { mime_type: i.mimeType, data: i.data } }))] }],
          generationConfig: {
            temperature: 0,
            response_mime_type: 'application/json',
            response_schema: RESPONSE_SCHEMA,
            // Label transcription does not need deep reasoning; low keeps latency down.
            ...(thinkingLevel ? { thinking_config: { thinking_level: thinkingLevel } } : {}),
          },
        }),
      });
      if (!response.ok) {
        let detail = '';
        try { detail = (await response.text()).replace(/\s+/g, ' ').slice(0, 300); } catch { /* ignore */ }
        // Logged for the operator; never includes the image or the key.
        log(`[recognize] provider responded ${response.status} for model ${targetModel}: ${detail}`);
        const hint = response.status === 404 ? ' (모델 이름을 확인하세요: GEMINI_MODEL)'
          : [400, 401, 403].includes(response.status) ? ' (API 키를 확인하세요)'
            : [429, 503].includes(response.status) ? ' 모델이 혼잡합니다. 잠시 후 다시 시도해 주세요.' : '';
        const status = response.status === 429 ? 429 : 502;
        throw new RecognitionError('model-unavailable', `분석 서비스를 사용할 수 없습니다.${hint} 직접 입력해 주세요.`, status, response.status);
      }
      const body = await response.json();
      const text = body?.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('') ?? '';
      if (!text) throw new RecognitionError('bad-model-output', '분석 결과가 비어 있습니다.', 502);
      return text;
    } catch (error) {
      if (error instanceof RecognitionError) throw error;
      if (error.name === 'AbortError') {
        log(`[recognize] ${targetModel} timed out after ${Date.now() - started} ms`);
        throw new RecognitionError('timeout', '분석 시간이 초과됐습니다. 잠시 후 다시 시도해 주세요.', 504);
      }
      throw new RecognitionError('model-unavailable', '분석 서비스에 연결하지 못했습니다.', 502);
    } finally {
      clearTimeout(timer);
    }
  }

  const transient = error => error instanceof RecognitionError && ([429, 503].includes(error.providerStatus) || error.code === 'timeout');

  return async function callModel(request) {
    try {
      return await attempt(model, request, timeoutMs);
    } catch (first) {
      if (!transient(first) || !fallbackModel || fallbackModel === model) throw first;
      await sleep(retryDelayMs);
      log(`[recognize] falling back to ${fallbackModel}`);
      return attempt(fallbackModel, request, fallbackTimeoutMs);
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
        const body = { ok: false, code: error.code, message: error.message };
        if (error.providerStatus) body.providerStatus = error.providerStatus;
        return { status: error.status, body };
      }
      return { status: 500, body: { ok: false, code: 'internal', message: '분석 중 오류가 발생했습니다.' } };
    }
  };
}
