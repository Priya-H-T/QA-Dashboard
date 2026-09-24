import { useEffect, useState, useMemo, useCallback } from 'react'
import { listIssues, updateIssueStatus, deleteIssue } from './api/client'
import { relativeTime } from './StatsBar'
import { IconCheck, IconX, IconRefresh } from './icons'

function ConfirmModal({ title, message, confirmLabel, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{title}</h3>
        <p className="muted modal-desc">{message}</p>
        <div className="project-form-actions">
          <button className="icon-btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="login-button reports-delete-btn-solid" onClick={onConfirm}>
            {confirmLabel || 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

function IssuesStatsBar({ issues }) {
  const total = issues.length
  const open = issues.filter((i) => i.status === 'open').length
  const closed = issues.filter((i) => i.status === 'closed').length

  return (
    <div className="stats-bar">
      <div className="stat-card">
        <div className="stat-icon">
          <IconRefresh />
        </div>
        <div className="stat-body">
          <span className="stat-value mono">{total}</span>
          <span className="stat-label">Total issues</span>
        </div>
      </div>

      <div className="stat-card">
        <div className="stat-icon">
          <IconX />
        </div>
        <div className="stat-body">
          <span className="stat-value mono">{open}</span>
          <span className="stat-label">Open</span>
        </div>
      </div>

      <div className="stat-card">
        <div className="stat-icon">
          <IconCheck />
        </div>
        <div className="stat-body">
          <span className="stat-value mono">{closed}</span>
          <span className="stat-label">Closed</span>
        </div>
      </div>
    </div>
  )
}

// Long Selenium/pytest tracebacks come through as one giant string with
// embedded newlines. Rendered in a plain <p>, the newlines collapse and
// the whole stack trace reads as a single run-on wall of text. Instead:
// show just the first line as a summary, and let the person expand the
// rest into a scrollable, monospaced, whitespace-preserving trace block.
function IssueDescription({ description }) {
  const [expanded, setExpanded] = useState(false)

  if (!description) return null

  const trimmed = description.trim()
  const firstLine = trimmed.split('\n')[0].trim()
  const isMultiline = trimmed.includes('\n')
  const isLong = trimmed.length > 180

  if (!isMultiline && !isLong) {
    return <p className="muted issue-card-desc">{trimmed}</p>
  }

  const summary = isLong && firstLine.length > 180
    ? `${firstLine.slice(0, 180)}\u2026`
    : firstLine

  return (
    <div className="issue-desc-block">
      <p className="muted issue-card-desc mono">{summary}</p>
      <button
        type="button"
        className="issue-trace-toggle"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? '\u2191 Hide full trace' : '\u2193 Show full trace'}
      </button>
      {expanded && <pre className="issue-trace mono">{trimmed}</pre>}
    </div>
  )
}

function IssueCard({ issue, onToggleStatus, onDelete, onViewProject, busy }) {
  const isOpen = issue.status === 'open'

  return (
    <div className="issue-card">
      <div className="issue-card-header">
        <span className={`issue-status-badge ${isOpen ? 'issue-status-open' : 'issue-status-closed'}`}>
          {isOpen ? 'Open' : 'Closed'}
        </span>
        <h3 className="issue-card-title">{issue.title}</h3>
      </div>

      <IssueDescription description={issue.description} />

      <p className="muted issue-card-meta">
        {issue.project ? (
          <button className="issue-link" onClick={() => onViewProject(issue.project)}>
            {issue.project}
          </button>
        ) : (
          'Unassigned project'
        )}
        {' \u00b7 '}
        {issue.run_name}
        {' \u00b7 '}
        {issue.test_case_name}
        {issue.created_by_username ? ` \u00b7 reported by ${issue.created_by_username}` : ''}
        {' \u00b7 '}
        {relativeTime(issue.created_at)}
      </p>

      <div className="issue-card-actions">
        <button
          className="icon-btn"
          disabled={busy}
          onClick={() => onToggleStatus(issue)}
        >
          {isOpen ? 'Mark closed' : 'Reopen'}
        </button>
        <button
          className="icon-btn reports-delete-btn"
          disabled={busy}
          onClick={() => onDelete(issue)}
        >
          Delete
        </button>
      </div>
    </div>
  )
}

function Issues({ onSelectProject }) {
  const [issues, setIssues] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [projectFilter, setProjectFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [busyIds, setBusyIds] = useState(() => new Set())
  const [pendingDelete, setPendingDelete] = useState(null)

  const loadIssues = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await listIssues()
      setIssues(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadIssues()
  }, [loadIssues])

  const projectOptions = useMemo(() => {
    const names = new Set(issues.map((i) => i.project).filter(Boolean))
    return Array.from(names).sort()
  }, [issues])

  const filteredIssues = useMemo(() => {
    const term = search.trim().toLowerCase()
    return issues.filter((issue) => {
      if (statusFilter !== 'all' && issue.status !== statusFilter) return false
      if (projectFilter !== 'all' && issue.project !== projectFilter) return false
      if (term) {
        const haystack = `${issue.title} ${issue.description || ''} ${issue.test_case_name}`.toLowerCase()
        if (!haystack.includes(term)) return false
      }
      return true
    })
  }, [issues, statusFilter, projectFilter, search])

  const setBusy = (id, value) => {
    setBusyIds((prev) => {
      const next = new Set(prev)
      if (value) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const handleToggleStatus = async (issue) => {
    setError('')
    setBusy(issue.id, true)
    const nextStatus = issue.status === 'open' ? 'closed' : 'open'
    try {
      await updateIssueStatus(issue.id, nextStatus)
      setIssues((prev) => prev.map((i) => (i.id === issue.id ? { ...i, status: nextStatus } : i)))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(issue.id, false)
    }
  }

  const handleDelete = (issue) => {
    setPendingDelete(issue)
  }

  const confirmDelete = async () => {
    const issue = pendingDelete
    setPendingDelete(null)
    setError('')
    setBusy(issue.id, true)
    try {
      await deleteIssue(issue.id)
      setIssues((prev) => prev.filter((i) => i.id !== issue.id))
    } catch (err) {
      setError(err.message)
      setBusy(issue.id, false)
    }
  }

  return (
    <div className="dashboard">
      <IssuesStatsBar issues={issues} />

      <div className="runs-list-header">
        <h2>Issues</h2>
        <button className="icon-btn" onClick={loadIssues}>
          Refresh
        </button>
      </div>

      <div className="issues-filter-bar">
        <input
          className="field-input"
          placeholder="Search title, description, test case..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select
          className="field-input"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>

        <select
          className="field-input"
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
        >
          <option value="all">All projects</option>
          {projectOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {loading && <p className="muted">Loading...</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && filteredIssues.length === 0 && !error && (
        <div className="empty-state">
          <IconCheck size={28} />
          <p className="muted">
            {issues.length === 0 ? 'No issues reported yet.' : 'No issues match your filters.'}
          </p>
        </div>
      )}

      <div className="issues-list">
        {filteredIssues.map((issue) => (
          <IssueCard
            key={issue.id}
            issue={issue}
            busy={busyIds.has(issue.id)}
            onToggleStatus={handleToggleStatus}
            onDelete={handleDelete}
            onViewProject={onSelectProject}
          />
        ))}
      </div>

      {pendingDelete && (
        <ConfirmModal
          title={`Delete "${pendingDelete.title}"?`}
          message="This permanently deletes this issue. This cannot be undone."
          confirmLabel="Delete issue"
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  )
}

export default Issues