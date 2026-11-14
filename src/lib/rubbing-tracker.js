import { REGIONS, locateRegion } from './face-regions.js';

// Initial heuristic values in eye-distance units; real-device calibration remains required.
const REQUIRED_MS = 2000, MAX_GAP_MS = 500, STILL_RESET_MS = 300;
const MIN_SPEED = .03, MAX_SPEED = 3, MIN_RANGE = .08, MIN_PATH = .45, MATCH_DISTANCE = .25;
const fingerIndices = [6, 8, 10, 12, 14, 16];
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function createRubbingTracker() {
  let detected = new Set(), tracks = [], lastTimestamp = null;
  function snapshot() {
    return { regions: REGIONS.map(({ id }) => ({
      id, status: detected.has(id) ? 'detected' : tracks.some(t => t.region === id && t.activeMs > 0) ? 'observing' : 'pending',
    })), detectedCount: detected.size };
  }
  function reset() { detected = new Set(); tracks = []; lastTimestamp = null; }
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
      const positions = inside.map(geometry.toFacePoint);
      return [{ region, position: {
        x: positions.reduce((sum, p) => sum + p.x, 0) / positions.length,
        y: positions.reduce((sum, p) => sum + p.y, 0) / positions.length,
      } }];
    });
    const candidates = observations.map(o => tracks.filter(t => t.region === o.region && distance(t.position, o.position) < MATCH_DISTANCE));
    const next = observations.map((o, index) => {
      const candidate = candidates[index].length === 1 ? candidates[index][0] : null;
      const unique = candidate && candidates.filter(list => list.includes(candidate)).length === 1;
      const previous = unique ? candidate : null;
      const step = previous ? distance(previous.position, o.position) : 0;
      const speed = dt ? step / (dt / 1000) : 0;
      const moving = previous && speed >= MIN_SPEED && speed <= MAX_SPEED;
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
      return track;
    });
    tracks = next;
    return snapshot();
  }
  return { update, reset, snapshot };
}
