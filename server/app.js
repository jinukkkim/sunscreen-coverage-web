import express from 'express';
import { createUvService } from './uv.js';
import { createCurrentUvService } from './safemap-uv.js';
import { CurrentUvError } from './current-uv-common.js';
import { buildPrompt, createGeminiCaller, createRecognizeHandler } from './recognize.js';

const RECOGNIZE_BODY_LIMIT = '6mb';

export function createRecognizer({ apiKey = process.env.GEMINI_API_KEY, model = process.env.GEMINI_MODEL || undefined, fallbackModel = process.env.GEMINI_FALLBACK_MODEL || undefined, thinkingLevel = process.env.GEMINI_THINKING ?? 'low' } = {}) {
  if (!apiKey) return { configured: false, handle: async () => ({ status: 503, body: { ok: false, code: 'not-configured', message: '분석 서버에 API 키가 설정되지 않았습니다.' } }) };
  const callModel = createGeminiCaller({ apiKey, model, fallbackModel, thinkingLevel });
  return { configured: true, handle: createRecognizeHandler({ callModel, prompt: buildPrompt() }) };
}

export function createApp({ getUv = createUvService({ key: process.env.KMA_SERVICE_KEY }), recognizer = createRecognizer(), getCurrentUv = createCurrentUvService() } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.get('/api/health', (_req, res) => res.json({ ok: true, uvConfigured: Boolean(process.env.KMA_SERVICE_KEY), recognitionConfigured: recognizer.configured }));
  app.get('/api/uv', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const { latitude: lat, longitude: lon } = req.query;
    const latitude = Number(lat), longitude = Number(lon);
    if (typeof lat !== 'string' || typeof lon !== 'string' || !lat.trim() || !lon.trim() || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < 32 || latitude > 39.5 || longitude < 124 || longitude > 132) {
      return res.status(400).json({ error: '대한민국 내의 올바른 위도·경도가 필요합니다.', code: 'INVALID_LOCATION' });
    }
    try { res.json(await getUv(latitude, longitude)); }
    catch (error) { res.status(error.status || 502).json({ error: error.code ? error.message : '예보를 가져오지 못했습니다.', code: error.code || 'UPSTREAM_ERROR' }); }
  });
  app.get('/api/uv/current', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const { latitude: lat, longitude: lon } = req.query;
    const latitude = Number(lat), longitude = Number(lon);
    if (typeof lat !== 'string' || typeof lon !== 'string' || !lat.trim() || !lon.trim() || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return res.status(400).json({ error: '올바른 위도·경도가 필요합니다.', code: 'CURRENT_UV_INVALID_LOCATION' });
    }
    try { res.json(await getCurrentUv(latitude, longitude)); }
    catch (error) {
      const known = error instanceof CurrentUvError;
      res.status(known ? error.status : 502).json({ error: known ? error.message : '현재 지역 자외선지수 조회에 실패했습니다.', code: known ? error.code : 'CURRENT_UV_NETWORK_ERROR' });
    }
  });
  // Product label photos: forwarded to the model in memory, never written to disk or logged.
  app.post('/api/recognize', express.json({ limit: RECOGNIZE_BODY_LIMIT }), async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const { status, body } = await recognizer.handle(req.body);
    res.status(status).json(body);
  });
  app.use('/api/recognize', (error, _req, res, next) => {
    if (error?.type === 'entity.too.large') return res.status(413).json({ ok: false, code: 'request-too-large', message: '요청이 너무 큽니다. 사진을 다시 촬영해 주세요.' });
    if (error?.type === 'entity.parse.failed') return res.status(400).json({ ok: false, code: 'bad-request', message: '요청을 읽지 못했습니다.' });
    next(error);
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: '지원하지 않는 API입니다.' }));
  return app;
}
