import { useEffect, useState, useCallback } from 'react'
import { listRuns, getRun, listTestCases, screenshotUrl, reportUrl, deleteReport } from './api/client'
import StatsBar, { relativeTime } from './StatsBar'
import { IconCheck, IconX, IconRefresh, IconCamera, IconLayers, IconArrowLeft } from './icons'

function extractBrowserTag(testName) {
  const match = testName.match(/\[([^\]]+)\]\s*$/)
  return match ? match[1] : null
}

function computeVersions(runs) {
  // Assigns v1, v2, v3... based on chronological creation order,
  // regardless of what order `runs` is currently sorted in.
  const chronological = [...runs].sort(
    (a, b) => new Date(a.started_at) - new Date(b.started_at)
  )
  const versionById = new Map()
  chronological.forEach((run, index) => {
    versionById.set(run.id, index + 1)
  })
  return versionById
}

function BreakdownBar({ title, groups }) {
  const entries = Object.entries(groups)
  if (entries.length === 0) return null

  return (
    <div className="breakdown-block">
      <h3 className="breakdown-title">{title}</h3>
      <div className="breakdown-rows">
        {entries.map(([key, counts]) => {
          const total = counts.passed + counts.failed
          const rate = total > 0 ? Math.round((counts.passed / total) * 100) : null
          return (
            <div key={key} className="breakdown-row">
              <span className="mono breakdown-key">{key}</span>
              <span className="project-stat">
                <IconCheck size={12} className="project-stat-icon-pass" />
                {counts.passed}
              </span>
              <span className="project-stat">
                <IconX size={12} className="project-stat-icon-fail" />
                {counts.failed}
              </span>
              {rate !== null && (
                <span className={`badge ${rate === 100 ? 'badge-pass' : 'badge-fail'}`}>
                  {rate}%
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ProjectBreakdown({ project }) {
  const [testCases, setTestCases] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!project) return
    listTestCases(project).then(setTestCases).catch((err) => setError(err.message))
  }, [project])

  if (!project) return null
  if (error) return <p className="error-text">{error}</p>
  if (testCases.length === 0) return null

  const byEnvironment = {}
  const byBrowser = {}

  for (const tc of testCases) {
    if (tc.status !== 'passed' && tc.status !== 'failed') continue

    const env = tc.run_environment || 'unknown'
    byEnvironment[env] = byEnvironment[env] || { passed: 0, failed: 0 }
    byEnvironment[env][tc.status] += 1

    const browser = extractBrowserTag(tc.name)
    if (browser) {
      byBrowser[browser] = byBrowser[browser] || { passed: 0, failed: 0 }
      byBrowser[browser][tc.status] += 1
    }
  }

  return (
    <div className="breakdown-bar">
      <BreakdownBar title="By environment" groups={byEnvironment} />
      <BreakdownBar title="By browser" groups={byBrowser} />
    </div>
  )
}

function ReportsSection({ runs, versionById, onDeleted }) {
  const reportedRuns = runs.filter((r) => r.has_report)
  if (reportedRuns.length === 0) return null

  const handleDelete = async (run) => {
    if (!window.confirm(`Delete the report for "${run.name}"? This can't be undone.`)) return
    try {
      await deleteReport(run.id)
      onDeleted()
    } catch (err) {
      window.alert(`Failed to delete report: ${err.message}`)
    }
  }

  return (
    <div className="reports-section">
      <h3 className="breakdown-title">Reports</h3>
      <div className="reports-list">
        {reportedRuns.map((run) => (
          <div key={run.id} className="reports-row">
            <span className="mono version-tag">v{versionById.get(run.id)}</span>
            <span className="mono">{run.name}</span>
            <span className="muted">
              {relativeTime(run.started_at)}
              {run.created_by_username ? ` \u00b7 by ${run.created_by_username}` : ''}
            </span>
            <a
              className="icon-btn"
              href={reportUrl(run.id)}
              target="_blank"
              rel="noreferrer"
            >
              View report
            </a>
            <button className="icon-btn reports-delete-btn" onClick={() => handleDelete(run)}>
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function TestRow({ test }) {
  const [expanded, setExpanded] = useState(false)
  const hasDetails = test.status === 'failed' && Boolean(test.error_message)

  return (
    <div className={`test-row test-${test.status}`}>
      <div
        className={`test-row-main ${hasDetails ? 'test-row-clickable' : ''}`}
        onClick={hasDetails ? () => setExpanded((e) => !e) : undefined}
      >
        <span className={`status-icon ${test.status === 'passed' ? 'status-icon-pass' : 'status-icon-fail'}`}>
          {test.status === 'passed' ? <IconCheck /> : <IconX />}
        </span>
        <span className="mono test-name">{test.name}</span>
        <span className="muted test-duration">
          {test.duration_seconds?.toFixed(2)}s
        </span>
        {hasDetails && (
          <span className="muted test-toggle">{expanded ? 'Hide details \u25b4' : 'Show details \u25be'}</span>
        )}
      </div>

      {hasDetails && expanded && (
        <>
          <p className="error-text mono test-error">{test.error_message}</p>
          {test.has_screenshot ? (
            <img
              className="screenshot-thumb"
              src={screenshotUrl(test.id)}
              alt={`Screenshot for ${test.name}`}
              onClick={() => window.open(screenshotUrl(test.id), '_blank')}
            />
          ) : (
            <p className="muted no-screenshot">
              <IconCamera size={13} className="no-screenshot-icon" />
              No screenshot captured
            </p>
          )}
        </>
      )}
    </div>
  )
}

function StatusBadge({ passed, failed, skipped }) {
  const allPassed = failed === 0
  return (
    <span className={`badge ${allPassed ? 'badge-pass' : 'badge-fail'}`}>
      {passed} passed - {failed} failed{skipped ? ` - ${skipped} skipped` : ''}
    </span>
  )
}

function RunProgressBar({ passed, total }) {
  const pct = total > 0 ? (passed / total) * 100 : 0
  return (
    <div className="run-progress">
      <div className="run-progress-fill" style={{ width: `${pct}%` }} />
    </div>
  )
}

function TestRuns({ project, onBack }) {
  const [runs, setRuns] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [selectedRun, setSelectedRun] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const loadRuns = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await listRuns(project)
      setRuns(data)
      setSelectedId((current) => {
        if (current && data.some((r) => r.id === current)) return current
        return data.length ? data[0].id : null
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [project])

  useEffect(() => {
    loadRuns()
  }, [loadRuns])

  useEffect(() => {
    if (!selectedId) {
      setSelectedRun(null)
      return
    }
    getRun(selectedId).then(setSelectedRun).catch((err) => setError(err.message))
  }, [selectedId])

  const versionById = computeVersions(runs)

  return (
    <div className="dashboard">
      {project && (
        <div className="project-detail-header">
          <button className="icon-btn" onClick={onBack}>
            <IconArrowLeft size={13} />
            All projects
          </button>
          <h2 className="project-detail-title">{project}</h2>
        </div>
      )}

      {project && <ProjectBreakdown project={project} />}
      {project && <ReportsSection runs={runs} versionById={versionById} onDeleted={loadRuns} />}

      <StatsBar runs={runs} />

      <div className="runs-layout">
        <div className="runs-list">
          <div className="runs-list-header">
            <h2>Runs</h2>
            <button className="icon-btn" onClick={loadRuns} title="Refresh">
              <IconRefresh />
              Refresh
            </button>
          </div>

          {loading && <p className="muted">Loading...</p>}
          {error && <p className="error-text">{error}</p>}

          {!loading && runs.length === 0 && !error && (
            <div className="empty-state">
              <IconLayers size={28} />
              <p className="muted">No test runs yet. Run pytest to generate one.</p>
            </div>
          )}

          {runs.map((run) => (
            <button
              key={run.id}
              className={`run-item ${run.id === selectedId ? 'selected' : ''}`}
              onClick={() => setSelectedId(run.id)}
            >
              <div className="run-item-top">
                <span className="mono version-tag">v{versionById.get(run.id)}</span>
                <span className="mono run-id">{run.name}</span>
                <span className="run-time">{relativeTime(run.started_at)}</span>
              </div>
              <RunProgressBar passed={run.passed} total={run.total} />
              <StatusBadge passed={run.passed} failed={run.failed} skipped={run.skipped} />
            </button>
          ))}
        </div>

        <div className="run-detail">
          {!selectedRun && (
            <div className="empty-state">
              <IconLayers size={28} />
              <p className="muted">Select a run to see details.</p>
            </div>
          )}

          {selectedRun && (
            <>
              <div className="run-detail-header">
                <h2 className="mono">
                  <span className="version-tag">v{versionById.get(selectedRun.id)}</span> {selectedRun.name}
                </h2>
                <span className="muted">
                  {selectedRun.environment} - {selectedRun.status} -{' '}
                  {new Date(selectedRun.started_at).toLocaleString()}
                </span>
                {selectedRun.has_report && (
                  <a
                    className="icon-btn"
                    href={reportUrl(selectedRun.id)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View report
                  </a>
                )}
              </div>

              {Object.entries(selectedRun.suites).map(([suiteName, tests]) => (
                <div key={suiteName} className="suite-block">
                  <h3 className="suite-title">{suiteName}</h3>
                  <div className="test-list">
                    {tests.map((test) => (
                      <TestRow key={test.id} test={test} />
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default TestRuns