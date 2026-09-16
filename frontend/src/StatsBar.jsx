import { IconLayers, IconTrend, IconTimer, IconCheck } from './icons'

export function relativeTime(dateString) {
  const date = new Date(dateString)
  const diffMs = Date.now() - date.getTime()
  const diffMin = Math.round(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.round(diffHr / 24)
  return `${diffDay}d ago`
}

function StatsBar({ runs }) {
  const totalRuns = runs.length
  const totalTests = runs.reduce((sum, r) => sum + (r.total || 0), 0)
  const totalPassed = runs.reduce((sum, r) => sum + (r.passed || 0), 0)
  const passRate = totalTests > 0 ? Math.round((totalPassed / totalTests) * 100) : null
  const latest = runs[0]

  const trendRuns = runs.slice(0, 8).slice().reverse()

  return (
    <div className="stats-bar">
      <div className="stat-card">
        <div className="stat-icon"><IconLayers /></div>
        <div className="stat-body">
          <span className="stat-value mono">{totalRuns}</span>
          <span className="stat-label">Total runs</span>
        </div>
      </div>

      <div className="stat-card">
        <div className="stat-icon"><IconCheck /></div>
        <div className="stat-body">
          <span className="stat-value mono">{passRate !== null ? `${passRate}%` : '--'}</span>
          <span className="stat-label">Pass rate</span>
        </div>
      </div>

      <div className="stat-card">
        <div className="stat-icon"><IconTimer /></div>
        <div className="stat-body">
          <span className="stat-value mono">{totalTests}</span>
          <span className="stat-label">Tests executed</span>
        </div>
      </div>

      <div className="stat-card stat-card-trend">
        <div className="stat-body-trend">
          <span className="stat-label trend-label">
            <IconTrend size={14} className="trend-icon" />
            Last {trendRuns.length} runs
            {latest && <span className="stat-sublabel"> - latest {relativeTime(latest.started_at)}</span>}
          </span>
          <div className="trend-bars">
            {trendRuns.map((r) => {
              const rate = r.total > 0 ? r.passed / r.total : 0
              const heightPct = Math.max(rate * 100, 6)
              return (
                <div
                  key={r.id}
                  className={`trend-bar ${r.failed > 0 ? 'trend-bar-fail' : 'trend-bar-pass'}`}
                  style={{ height: `${heightPct}%` }}
                  title={`${r.passed} passed, ${r.failed} failed`}
                />
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

export default StatsBar