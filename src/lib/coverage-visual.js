const START = [34, 47, 40];
const CREAM = [255, 250, 240];

export function getCoverageVisual(progress) {
  const value = Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : 0;
  const fillFraction = value / 100;
  return {
    progress: value,
    fillFraction,
    color: START.map((channel, index) => Math.round(channel + (CREAM[index] - channel) * fillFraction)),
    opacity: .26 + .58 * fillFraction,
  };
}

export function getTriangleCoverage(triangles, regions) {
  const totals = new Map(), ranks = new Map();
  const progress = new Map(regions.map(region => [region.id, getCoverageVisual(region.progress).fillFraction]));
  triangles.forEach(tile => totals.set(tile.regionId, (totals.get(tile.regionId) ?? 0) + 1));
  return triangles.map(tile => {
    const rank = ranks.get(tile.regionId) ?? 0;
    ranks.set(tile.regionId, rank + 1);
    const amount = (progress.get(tile.regionId) ?? 0) * totals.get(tile.regionId) - rank;
    return { ...tile, visual: getCoverageVisual(amount * 100) };
  });
}
