import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { createServer as createHttpServer } from 'node:http';
import { createApp } from './app.js';

const app = createApp();
const httpServer = createHttpServer(app);
if (process.argv.includes('--production')) {
  app.use(express.static(fileURLToPath(new URL('../dist', import.meta.url))));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true, hmr: { server: httpServer } }, appType: 'spa' });
  app.use(vite.middlewares);
}
const port = Number(process.env.PORT) || 5173;
httpServer.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`SunGuard: http://localhost:${port}`));
