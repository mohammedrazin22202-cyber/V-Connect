/**
 * ScoreBar — color-coded horizontal bar for 0-100 scores.
 * Red (0) -> Yellow (50) -> Green (100)
 *
 * Sizes: sm, md, lg, mini (mini = compact dot+number for table cells)
 */
export default function ScoreBar({ score, label, size = 'md' }) {
  const value = Math.max(0, Math.min(100, score || 0));

  // HSL interpolation: 0 = red (0°), 50 = yellow (50°), 100 = green (120°)
  const hue = (value / 100) * 120;
  const color = `hsl(${hue}, 75%, 45%)`;
  const bgColor = `hsl(${hue}, 30%, 15%)`;

  if (size === 'mini') {
    return (
      <div className="score-bar-wrapper score-bar--mini">
        <div className="score-bar-container" style={{ height: 4, background: bgColor }}>
          <div
            className="score-bar-fill"
            style={{
              width: `${value}%`,
              height: '100%',
              background: color,
              borderRadius: 2,
              transition: 'width 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            }}
          />
        </div>
        <span className="score-bar-value" style={{ color }}>{value.toFixed(1)}</span>
      </div>
    );
  }

  const heightMap = { sm: 6, md: 8, lg: 12 };
  const barHeight = heightMap[size] || 8;

  return (
    <div className="score-bar-wrapper">
      {label && <span className="score-bar-label">{label}</span>}
      <div className="score-bar-container" style={{ height: barHeight, background: bgColor }}>
        <div
          className="score-bar-fill"
          style={{
            width: `${value}%`,
            height: '100%',
            background: `linear-gradient(90deg, hsl(${Math.max(0, hue - 15)}, 75%, 40%), ${color})`,
            borderRadius: barHeight / 2,
            transition: 'width 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          }}
        />
      </div>
      <span className="score-bar-value" style={{ color }}>{value.toFixed(1)}</span>
    </div>
  );
}
