import React, { useEffect, useRef, useState } from 'react';
import { getDisplayPoint, getMeshSegments, getMeshTriangles } from '../lib/face-regions.js';
import { getTriangleCoverage } from '../lib/coverage-visual.js';
// Same lazy chunk vision-session already loads; only the connection constants are read here.
let meshConnections = null;
const loadMeshConnections = () => meshConnections ??= import('@mediapipe/tasks-vision')
  .then(({ FaceLandmarker }) => FaceLandmarker.FACE_LANDMARKS_TESSELATION);

function tracePolygon(context, points) {
  context.beginPath();
  points.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
  context.closePath();
}

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
    context.clearRect(0, 0, size.width, size.height);
    if (!analysis.geometry || !source?.videoWidth || !size.width) return;
    const display = point => getDisplayPoint(point, {
      videoWidth: source.videoWidth, videoHeight: source.videoHeight,
      stageWidth: size.width, stageHeight: size.height, mirrored: true,
    });
    if (connections) {
      for (const tile of getTriangleCoverage(getMeshTriangles(analysis.geometry, connections), analysis.regions)) {
        tracePolygon(context, tile.points.map(display));
        context.fillStyle = `rgba(${tile.visual.color.join(', ')}, ${tile.visual.opacity})`;
        context.fill();
      }
      context.save();
      context.beginPath();
      for (const [a, b] of getMeshSegments(analysis.geometry.landmarks, connections)) {
        const p = display(a), q = display(b); context.moveTo(p.x, p.y); context.lineTo(q.x, q.y);
      }
      // Fine contrast edges keep the tessellation visible on dark and cream tiles.
      context.lineWidth = 1.2; context.lineCap = 'round';
      context.strokeStyle = 'rgba(34, 47, 40, 0.32)';
      context.stroke();
      context.globalAlpha = .5; context.lineWidth = .45;
      context.strokeStyle = '#eef8f2';
      context.stroke();
      context.restore();
    }
    for (const hand of analysis.hands) for (const index of [8, 12, 16]) {
      const point = hand[index];
      if (!point || !Number.isFinite(point.x + point.y)) continue;
      const p = display(point); context.beginPath(); context.arc(p.x, p.y, 4, 0, 2 * Math.PI);
      context.fillStyle = '#ffca5c'; context.fill();
    }
  }, [analysis, size, video, connections]);
  return <canvas ref={canvas} aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />;
}

