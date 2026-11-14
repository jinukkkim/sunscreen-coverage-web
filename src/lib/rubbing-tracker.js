import { REGIONS, locateRegion } from './face-regions.js';

// Initial heuristic values in eye-distance units; real-device calibration remains required.
const REQUIRED_MS = 2000, MAX_GAP_MS = 500, STILL_RESET_MS = 300;
const MIN_SPEED = .03, MAX_SPEED = 3, MIN_RANGE = .08, MIN_PATH = .45, MATCH_DISTANCE = .25;
const fingerIndices = [6, 8, 10, 12, 14, 16];
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function createRubbingTracker() {
  let detected = new Set(), progress = new Map(), tracks = [], lastTimestamp = null;
  function snapshot() {
    const regions = REGIONS.map(({ id }) => ({
      id, status: detected.has(id) ? 'detected' : tracks.some(t => t.region === id && t.activeMs > 0) ? 'observing' : 'pending',
      progress: detected.has(id) ? 100 : progress.get(id) || 0,
    }));
    return { regions, detectedCount: detected.size, progress: Math.floor(regions.reduce((sum, region) => sum + region.progress, 0) / REGIONS.length) };
  }
  function reset() { detected = new Set(); progress = new Map(); tracks = []; lastTimestamp = null; }
  function update({ geometry, hands = [], timestampMs }) {
    if (!Number.isFinite(timestampMs) || (lastTimestamp !== null && timestampMs <= lastTimestamp)) return snapshot();
    const dt = lastTimestamp === null ? 0 : timestampMs - lastTimestamp;
    lastTimestamp = timestampMs;
    if (!geometry?.quality.ready || dt > MAX_GAP_MS) tracks = [];
    if (!geometry?.quality.ready) return snapshot();
    const observations = hands.flatMap(landmarks => {
      const points = fingerIndices.map(i => landmarks?.[i]);
      if (points.some(p => !p || !Number.isFinite(p.x + p.y))) return [];
      const region = locateRegion(geometry, points);
      const inside = points.filter(p => locateRegion(geometry, [p]) === region);
      if (!region || inside.length < 2) return [];
      const imagePosition = {
        x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
        y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
      };
      return [{ region, imagePosition, position: geometry.toFacePoint(imagePosition) }];
    });
    const candidates = observations.map(o => tracks.filter(t => t.region === o.region && distance(t.position, o.position) < MATCH_DISTANCE));
    const next = observations.map((o, index) => {
      const candidate = candidates[index].length === 1 ? candidates[index][0] : null;
      const unique = candidate && candidates.filter(list => list.includes(candidate)).length === 1;
      const previous = unique ? candidate : null;
      const step = previous ? distance(previous.position, o.position) : 0;
      const speed = dt ? step / (dt / 1000) : 0;
      // Both screen-space and face-relative movement are needed to reject head-only motion.
      const imageStep = previous ? distance(geometry.toFacePoint(previous.imagePosition), o.position) : 0;
      const imageSpeed = dt ? imageStep / (dt / 1000) : 0;
      const moving = previous && speed >= MIN_SPEED && speed <= MAX_SPEED && imageSpeed >= MIN_SPEED && imageSpeed <= MAX_SPEED;
      const continuing = previous && timestampMs - previous.lastMove <= STILL_RESET_MS && speed <= MAX_SPEED;
      const track = continuing ? { ...previous, ...o } : {
        ...o, activeMs: 0, path: 0, minX: o.position.x, maxX: o.position.x,
        minY: o.position.y, maxY: o.position.y, lastMove: timestampMs,
      };
      if (moving) {
        track.activeMs += dt; track.path += step; track.lastMove = timestampMs;
        track.minX = Math.min(track.minX, o.position.x); track.maxX = Math.max(track.maxX, o.position.x);
        track.minY = Math.min(track.minY, o.position.y); track.maxY = Math.max(track.maxY, o.position.y);
      }
      if (track.activeMs >= REQUIRED_MS && track.path >= MIN_PATH &&
        Math.hypot(track.maxX - track.minX, track.maxY - track.minY) >= MIN_RANGE) detected.add(o.region);
      // Show the strongest valid continuous observation, never a measured dose.
      // Interrupted tracks cannot add their time together to reach completion.
      const fraction = Math.min(track.activeMs / REQUIRED_MS, track.path / MIN_PATH,
        Math.hypot(track.maxX - track.minX, track.maxY - track.minY) / MIN_RANGE);
      progress.set(o.region, Math.max(progress.get(o.region) || 0, Math.min(99, Math.floor(fraction * 100))));
      return track;
    });
    tracks = next;
    return snapshot();
  }
  return { update, reset, snapshot };
}
