export default function StatCard({ label, value, foot, icon: Icon, tone = 'navy' }) {
  const tones = {
    navy: ['var(--brand-soft)', 'var(--brand)'],
    green: ['var(--green-soft)', 'var(--green)'],
    orange: ['var(--orange-soft)', 'var(--orange)'],
    red: ['var(--red-soft)', 'var(--red)'],
    blue: ['var(--blue-soft)', 'var(--blue)'],
    violet: ['var(--violet-soft)', 'var(--violet)'],
  };
  const [bg, fg] = tones[tone];
  return (
    <div className="card kpi">
      <div className="kpi-top">
        <span className="kpi-label">{label}</span>
        <span className="kpi-icon" style={{ background: bg, color: fg }}>
          <Icon size={16} />
        </span>
      </div>
      <div className="kpi-value mono" style={tone === 'red' && value > 0 ? { color: 'var(--red)' } : undefined}>{value}</div>
      {foot && <div className="kpi-foot">{foot}</div>}
    </div>
  );
}
