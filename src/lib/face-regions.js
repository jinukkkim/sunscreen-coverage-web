export const REGIONS = [
  { id: 'forehead', label: '이마' }, { id: 'nose', label: '코' },
  { id: 'leftCheek', label: '왼쪽 볼' }, { id: 'rightCheek', label: '오른쪽 볼' },
  { id: 'chin', label: '턱' },
];

// MediaPipe canonical topology: left/right are the person's, before mirroring.
const polygons = {
  forehead: [54, 103, 67, 109, 10, 338, 297, 332, 284, 300, 293, 334, 296, 336, 9, 107, 66, 105, 63, 70],
  nose: [168, 129, 98, 2, 327, 358],
  leftCheek: [345, 348, 423, 436, 432, 364, 376],
  rightCheek: [116, 119, 203, 216, 212, 135, 147],
  chin: [202, 18, 422, 400, 152, 176],
};
const outline = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
const exclusions = [
  [33, 160, 158, 133, 153, 144], [362, 385, 387, 263, 373, 380],
  [61, 40, 37, 0, 267, 270, 291, 321, 314, 17, 84, 91],
];
const required = [...new Set([1, 33, 263, ...outline, ...Object.values(polygons).flat(), ...exclusions.flat()])];
const finitePoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);

function contains(polygon, point) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) &&
      point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function getFaceGeometry(landmarks, { width, height }) {
  if (!(width > 0 && height > 0) || !Number.isFinite(width + height) ||
      !Array.isArray(landmarks) || required.some(i => !finitePoint(landmarks[i]))) return null;
  const a = landmarks[33], b = landmarks[263];
  const dx = (b.x - a.x) * width, dy = (b.y - a.y) * height;
  const scale = Math.hypot(dx, dy);
  if (scale < 1) return null;
  const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const ux = dx / scale, uy = dy / scale;
  function toFacePoint(p) {
    const x = (p.x - center.x) * width, y = (p.y - center.y) * height;
    return { x: (x * ux + y * uy) / scale, y: (-x * uy + y * ux) / scale };
  }
  const faceOutline = outline.map(i => landmarks[i]);
  const nose = toFacePoint(landmarks[1]);
  const clipped = faceOutline.some(p => p.x < .02 || p.x > .98 || p.y < .02 || p.y > .98);
  // Initial conservative capture gates; calibrate on real devices before accuracy claims.
  const reason = clipped ? '얼굴 전체가 화면 안에 들어오게 해 주세요.'
    : scale / width < .12 ? '카메라에 조금 더 가까이 와 주세요.'
    : Math.abs(Math.atan2(dy, dx)) > .26 || Math.abs(nose.x) > .25
      ? '고개를 정면으로 맞춰 주세요.' : '';
  return {
    regions: REGIONS.map(region => ({ ...region, polygon: polygons[region.id].map(i => landmarks[i]) })),
    outline: faceOutline, exclusions: exclusions.map(ids => ids.map(i => landmarks[i])),
    landmarks, toFacePoint, center: toFacePoint(landmarks[1]), quality: { ready: !reason, reason },
  };
}

export function locateRegion(geometry, points) {
  if (!geometry || !Array.isArray(points)) return null;
  const votes = new Map();
  for (const p of points) {
    if (!finitePoint(p) || !contains(geometry.outline, p) || geometry.exclusions.some(poly => contains(poly, p))) continue;
    const region = geometry.regions.find(region => contains(region.polygon, p));
    if (region) votes.set(region.id, (votes.get(region.id) ?? 0) + 1);
  }
  const ranked = [...votes].sort((a, b) => b[1] - a[1]);
  return ranked.length && (ranked.length === 1 || ranked[0][1] > ranked[1][1]) ? ranked[0][0] : null;
}

export function getDisplayPoint(point, { videoWidth, videoHeight, stageWidth, stageHeight, mirrored }) {
  const scale = Math.max(stageWidth / videoWidth, stageHeight / videoHeight);
  const x = point.x * videoWidth * scale - (videoWidth * scale - stageWidth) / 2;
  return { x: mirrored ? stageWidth - x : x, y: point.y * videoHeight * scale - (videoHeight * scale - stageHeight) / 2 };
}

// Overlay only: eyes and lips get no sunscreen, so the mesh leaves them empty.
// Eye margin covers the lids; tune it on real faces if it looks too wide or narrow.
const eyeMeshMargin = 1.8;
const outerLips = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];
const grow = (polygon, factor) => {
  const cx = polygon.reduce((sum, p) => sum + p.x, 0) / polygon.length;
  const cy = polygon.reduce((sum, p) => sum + p.y, 0) / polygon.length;
  return polygon.map(p => ({ x: cx + (p.x - cx) * factor, y: cy + (p.y - cy) * factor }));
};

export function getMeshSegments(landmarks, connections) {
  const ready = ids => ids.every(i => finitePoint(landmarks[i]));
  const eyes = exclusions.slice(0, 2).filter(ready).map(ids => grow(ids.map(i => landmarks[i]), eyeMeshMargin));
  // Shrunk a hair so lines along the lip edge stay as the hole's outline.
  const lips = ready(outerLips) ? grow(outerLips.map(i => landmarks[i]), .98) : null;
  return connections.flatMap(({ start, end }) => {
    const a = landmarks[start], b = landmarks[end];
    if (!finitePoint(a) || !finitePoint(b)) return [];
    const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const hidden = eyes.some(eye => [a, middle, b].some(p => contains(eye, p))) || (lips && contains(lips, middle));
    return hidden ? [] : [[a, b]];
  });
}

// The pinned MediaPipe tessellation lists each face as three consecutive edges.
// Use the same visible edges as the wireframe so eye and lip holes stay empty.
export function getMeshTriangles(geometry, connections) {
  const { landmarks } = geometry;
  const indices = new Map(landmarks.map((point, index) => [point, index]));
  const edgeKey = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;
  const visible = new Set(getMeshSegments(landmarks, connections)
    .map(([a, b]) => edgeKey(indices.get(a), indices.get(b))));
  const seen = new Set(), triangles = [];
  for (let i = 0; i + 2 < connections.length; i += 3) {
    const edges = connections.slice(i, i + 3);
    const ids = [...new Set(edges.flatMap(edge => [edge.start, edge.end]))].sort((a, b) => a - b);
    if (ids.length !== 3 || new Set(edges.map(edge => edgeKey(edge.start, edge.end))).size !== 3 ||
        edges.some(edge => edge.start === edge.end || !visible.has(edgeKey(edge.start, edge.end)))) continue;
    const id = ids.join(':'), points = ids.map(index => landmarks[index]);
    if (seen.has(id) || points.some(point => !finitePoint(point))) continue;
    const [a, b, c] = points;
    if (Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) < 1e-10) continue;
    const center = { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 };
    const regionId = locateRegion(geometry, [center]);
    if (!regionId) continue;
    seen.add(id);
    triangles.push({ id, regionId, points, orderY: geometry.toFacePoint(center).y });
  }
  return triangles.sort((a, b) => b.orderY - a.orderY || a.id.localeCompare(b.id));
}
