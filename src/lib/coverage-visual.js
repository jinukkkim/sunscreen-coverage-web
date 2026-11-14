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
