// Browser-only helpers. Downscale a product photo before it leaves the device so uploads are
// small and the server can enforce a strict size cap.

export const MAX_INPUT_BYTES = 6 * 1024 * 1024;
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function checkImageFile(file) {
  if (!file) return '사진을 선택해 주세요.';
  if (!ACCEPTED_TYPES.includes(file.type)) return 'JPG, PNG, WebP 사진만 지원합니다. HEIC는 JPG로 다시 촬영해 주세요.';
  if (file.size > MAX_INPUT_BYTES) return '사진은 6MB 이하여야 합니다.';
  return '';
}

async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file); } catch { /* fall through to <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** @returns {Promise<{ mimeType: string, data: string, width: number, height: number }>} base64 JPEG */
export async function downscaleImage(file, { maxEdge = 1280, quality = 0.85 } = {}) {
  const source = await decode(file);
  const width = source.width ?? source.naturalWidth;
  const height = source.height ?? source.naturalHeight;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(source, 0, 0, w, h);
  source.close?.();
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  const data = dataUrl.slice(dataUrl.indexOf(',') + 1);
  if (!data) throw new Error('이미지를 변환하지 못했습니다.');
  return { mimeType: 'image/jpeg', data, width: w, height: h };
}
