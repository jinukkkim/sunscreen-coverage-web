import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { prepareVisionAssets } from '../scripts/prepare-vision.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'sunguard-assets-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const pkg = join(root, 'node_modules/@mediapipe/tasks-vision');
  await mkdir(join(pkg, 'wasm'), { recursive: true });
  await writeFile(join(pkg, 'package.json'), JSON.stringify({ version: '1.2.3' }));
  await writeFile(join(pkg, 'wasm/vision_wasm_internal.wasm'), 'wasm from pinned package');
  await writeFile(join(pkg, 'wasm/vision_wasm_internal.js'), 'runtime from pinned package');
  await mkdir(join(root, 'third_party/mediapipe'), { recursive: true });
  await writeFile(join(root, 'third_party/mediapipe/LICENSE'), 'Apache License 2.0');
  await writeFile(join(root, 'THIRD_PARTY_NOTICES.md'), 'MediaPipe Authors attribution');
  const bytes = Buffer.from('test model');
  const manifest = { packageVersion: '1.2.3', models: [
    { name: 'face_landmarker.task', url: 'https://example.test/model', sha256: createHash('sha256').update(bytes).digest('hex') },
  ] };
  return { root, pkg, bytes, manifest };
}

test('prepares verified local model and matching WASM and reuses the cache offline', async t => {
  const f = await fixture(t);
  await prepareVisionAssets({ ...f, fetchImpl: async () => new Response(f.bytes) });
  assert.deepEqual(await readFile(join(f.root, 'public/vision/face_landmarker.task')), f.bytes);
  assert.equal(await readFile(join(f.root, 'public/vision/LICENSE'), 'utf8'), 'Apache License 2.0');
  assert.equal(await readFile(join(f.root, 'public/vision/wasm/vision_wasm_internal.wasm'), 'utf8'), 'wasm from pinned package');
  await prepareVisionAssets({ ...f, fetchImpl: async () => { throw new Error('network should not be needed'); } });
});

test('checksum mismatch never creates a completed model', async t => {
  const f = await fixture(t);
  await assert.rejects(prepareVisionAssets({ ...f, fetchImpl: async () => new Response('corrupted') }), /checksum/i);
  await assert.rejects(readFile(join(f.root, 'public/vision/face_landmarker.task')), { code: 'ENOENT' });
  assert.deepEqual((await readdir(join(f.root, 'public/vision'))).filter(name => name.includes('download')), []);
});

test('download failure cannot be treated as a successful cached model', async t => {
  const f = await fixture(t);
  await assert.rejects(prepareVisionAssets({ ...f, fetchImpl: async () => new Response('no', { status: 503 }) }), /503/);
  await assert.rejects(readFile(join(f.root, 'public/vision/face_landmarker.task')), { code: 'ENOENT' });
});

test('a corrupt cache is revalidated rather than trusted by filename', async t => {
  const f = await fixture(t);
  await mkdir(join(f.root, 'public/vision'), { recursive: true });
  await writeFile(join(f.root, 'public/vision/face_landmarker.task'), 'bad cache');
  await prepareVisionAssets({ ...f, fetchImpl: async () => new Response(f.bytes) });
  assert.deepEqual(await readFile(join(f.root, 'public/vision/face_landmarker.task')), f.bytes);
});

test('rejects a mismatched installed SDK version', async t => {
  const f = await fixture(t);
  await writeFile(join(f.pkg, 'package.json'), JSON.stringify({ version: 'wrong' }));
  await assert.rejects(prepareVisionAssets({ ...f, fetchImpl: async () => new Response(f.bytes) }), /version/i);
});
