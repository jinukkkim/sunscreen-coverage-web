// Match the persistent preview's 4:3 cover crop; product capture uses its visible guide.
export function captureVideoFrame(video, { product = false } = {}) {
  if (!video?.srcObject || !video.videoWidth || !video.videoHeight) throw new Error('카메라를 켜고 영상이 준비되면 촬영해 주세요.');
  const ratio = 4 / 3;
  let width = Math.min(video.videoWidth, video.videoHeight * ratio);
  let height = width / ratio;
  let x = (video.videoWidth - width) / 2, y = (video.videoHeight - height) / 2;
  if (product) { x += width * .25; y += height * .1; width *= .5; height *= .8; }
  const scale = Math.min(1, (product ? 1280 : 2048) / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext('2d').drawImage(video, x, y, width, height, 0, 0, canvas.width, canvas.height);
  return canvas;
}
