import express from 'express';
import { createUvService } from './uv.js';

export function createApp({ getUv = createUvService({ key: process.env.KMA_SERVICE_KEY }) } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.get('/api/health', (_req, res) => res.json({ ok: true, uvConfigured: Boolean(process.env.KMA_SERVICE_KEY) }));
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
  app.use('/api', (_req, res) => res.status(404).json({ error: '지원하지 않는 API입니다.' }));
  return app;
}
