import { readFile, writeFile, mkdir, readdir, copyFile, rename, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export async function prepareVisionAssets({
  root = fileURLToPath(new URL('../', import.meta.url)),
  manifest, fetchImpl = fetch,
} = {}) {
  manifest ??= JSON.parse(await readFile(new URL('./vision-assets.json', import.meta.url), 'utf8'));
  const sdkRoot = join(root, 'node_modules/@mediapipe/tasks-vision');
  const sdk = JSON.parse(await readFile(join(sdkRoot, 'package.json'), 'utf8'));
  if (sdk.version !== manifest.packageVersion) throw new Error('MediaPipe package version does not match vision-assets.json');
  const target = join(root, 'public/vision');
  await mkdir(join(target, 'wasm'), { recursive: true });
  for (const model of manifest.models) {
    const destination = join(target, model.name);
    let cached;
    try { cached = await readFile(destination); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (cached && hash(cached) === model.sha256) continue;
    await rm(destination, { force: true });
    const response = await fetchImpl(model.url, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`Model download failed: HTTP ${response.status} (${model.name})`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (hash(bytes) !== model.sha256) throw new Error(`Model checksum mismatch: ${model.name}`);
    const temporary = destination + '.download-' + process.pid + '-' + Math.random().toString(16).slice(2);
    try { await writeFile(temporary, bytes); await rename(temporary, destination); }
    finally { await rm(temporary, { force: true }); }
  }
  await copyFile(join(root, 'third_party/mediapipe/LICENSE'), join(target, 'LICENSE'));
  await copyFile(join(root, 'THIRD_PARTY_NOTICES.md'), join(target, 'NOTICE.md'));
  for (const name of await readdir(join(sdkRoot, 'wasm'))) {
    if (name.endsWith('.js') || name.endsWith('.wasm')) await copyFile(join(sdkRoot, 'wasm', name), join(target, 'wasm', name));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await prepareVisionAssets(); console.log('얼굴·손 인식 자산 준비 완료 (같은 출처에서 제공)'); }
  catch (error) { console.error('인식 자산 준비 실패:', error.message); process.exitCode = 1; }
}
