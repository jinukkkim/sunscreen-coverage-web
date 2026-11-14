import React, { useEffect, useRef, useState } from 'react';
import { getDisplayPoint, getMeshSegments } from '../lib/face-regions.js';
// Same lazy chunk vision-session already loads; only the connection constants are read here.
let meshConnections = null;
const loadMeshConnections = () => meshConnections ??= import('@mediapipe/tasks-vision')
  .then(({ FaceLandmarker }) => FaceLandmarker.FACE_LANDMARKS_TESSELATION);

export default function FaceOverlay({ analysis, video }) {
  const canvas = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [connections, setConnections] = useState(null);
  useEffect(() => {
    let alive = true;
    if (analysis.geometry && !connections) loadMeshConnections().then(next => alive && setConnections(next), () => {});
    return () => { alive = false; };
  }, [analysis.geometry, connections]);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(canvas.current.parentElement);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const element = canvas.current, source = video.current;
    const ratio = window.devicePixelRatio || 1;
    element.width = size.width * ratio; element.height = size.height * ratio;
    const context = element.getContext('2d');
    context.scale(ratio, ratio);
    if (!analysis.geometry || !source?.videoWidth || !size.width) return;
    const display = point => getDisplayPoint(point, {
      videoWidth: source.videoWidth, videoHeight: source.videoHeight,
      stageWidth: size.width, stageHeight: size.height, mirrored: true,
    });
    // Retain partial progress between observations. Fill the mesh upward within
    // each observed region, keeping eyes and lips outside the painted area.
    for (const region of analysis.geometry.regions) {
      const progress = Math.max(0, Math.min(100, analysis.regions.find(item => item.id === region.id)?.progress || 0)) / 100;
      if (!progress) continue;
      const points = region.polygon.map(display);
      const xs = points.map(p => p.x), ys = points.map(p => p.y);
      const left = Math.min(...xs), top = Math.min(...ys), width = Math.max(...xs) - left, bottom = Math.max(...ys);
      context.save();
      context.beginPath();
      points.forEach((p, i) => i ? context.lineTo(p.x, p.y) : context.moveTo(p.x, p.y));
      context.closePath(); context.clip();
      context.beginPath(); context.rect(0, 0, size.width, size.height);
      for (const hole of analysis.geometry.exclusions) {
        hole.map(display).forEach((p, i) => i ? context.lineTo(p.x, p.y) : context.moveTo(p.x, p.y));
        context.closePath();
      }
      context.clip('evenodd');
      const height = (bottom - top) * progress;
      context.globalAlpha = .2 + .35 * progress;
      context.fillStyle = '#7cf2a2';
      context.fillRect(left, bottom - height, width, height);
      context.restore();
    }
    if (connections) {
      context.save();
      context.beginPath();
      for (const [a, b] of getMeshSegments(analysis.geometry.landmarks, connections)) {
        const p = display(a), q = display(b); context.moveTo(p.x, p.y); context.lineTo(q.x, q.y);
      }
      context.globalAlpha = .7; context.lineWidth = .7; context.lineCap = 'round';
      context.strokeStyle = '#eef8f2'; context.shadowColor = '#eef8f2'; context.shadowBlur = 4;
      context.stroke();
      context.restore();
    }
    const outline = analysis.geometry.outline.map(display);
    const xs = outline.map(p => p.x), ys = outline.map(p => p.y);
    const x0 = Math.min(...xs) - 12, x1 = Math.max(...xs) + 12, y0 = Math.min(...ys) - 12, y1 = Math.max(...ys) + 12;
    const arm = Math.min(x1 - x0, y1 - y0) * .18;
    context.beginPath();
    for (const [x, y, dx, dy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
      context.moveTo(x, y + dy * arm); context.lineTo(x, y); context.lineTo(x + dx * arm, y);
    }
    context.strokeStyle = '#7cf2a2'; context.lineWidth = 2.5; context.stroke();
    for (const hand of analysis.hands) for (const index of [8, 12, 16]) {
      const point = hand[index];
      if (!point || !Number.isFinite(point.x + point.y)) continue;
      const p = display(point); context.beginPath(); context.arc(p.x, p.y, 4, 0, 2 * Math.PI);
      context.fillStyle = '#ffca5c'; context.fill();
    }
  }, [analysis, size, video, connections]);
  return <canvas ref={canvas} aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />;
}

