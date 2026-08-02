export default function StatsCards({ stats }) {
  if (!stats) return null;

  const cards = [
    { label: 'Total Villages', value: stats.totalVillages?.toLocaleString(), accent: '#6366f1', icon: '🏘' },
    { label: 'States/UTs', value: stats.totalStates, accent: '#06b6d4', icon: '🗺️' },
    { label: 'Districts', value: stats.totalDistricts, accent: '#f59e0b', icon: '📍' },
    { label: 'Avg Score', value: stats.avgScores?.overall, accent: '#10b981', icon: '⭐' },
  ];

  return (
    <div className="stats-grid">
      {cards.map((card, i) => (
        <div key={i} className="stat-card" style={{ '--accent': card.accent }}>
          <span className="stat-card-icon">{card.icon}</span>
          <div className="stat-card-value">{card.value ?? '—'}</div>
          <div className="stat-card-label">{card.label}</div>
          <div className="stat-card-glow" style={{ background: card.accent }} />
        </div>
      ))}
    </div>
  );
}
