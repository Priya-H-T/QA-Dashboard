import { useEffect, useState, useCallback } from 'react'
import { listProjects, listProjectConfigs, createProjectConfig } from './api/client'
import { relativeTime } from './StatsBar'
import { IconLayers, IconCheck, IconX, IconRefresh } from './icons'

function NewProjectModal({ onCreated, onCancel }) {
  const [name, setName] = useState('')
  const [workingDirectory, setWorkingDirectory] = useState('')
  const [pythonExecutable, setPythonExecutable] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await createProjectConfig(name, workingDirectory, pythonExecutable)
      onCreated()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <form className="modal-dialog" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h3 className="modal-title">New project</h3>
        <p className="muted modal-desc">
          Register a project so pytest runs can be tagged and grouped under it.
        </p>

        <label className="field">
          <span className="field-label">Project name</span>
          <input
            className="field-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="storefront-e2e"
            autoFocus
            required
          />
        </label>

        <label className="field">
          <span className="field-label">Working directory</span>
          <input
            className="field-input"
            value={workingDirectory}
            onChange={(e) => setWorkingDirectory(e.target.value)}
            placeholder="C:\Users\hp\PycharmProjects\Automation Framework"
            required
          />
        </label>

        <label className="field">
          <span className="field-label">Python executable (project's venv)</span>
          <input
            className="field-input"
            value={pythonExecutable}
            onChange={(e) => setPythonExecutable(e.target.value)}
            placeholder="C:\...\Automation Framework\.venv\Scripts\python.exe"
          />
        </label>

        {error && <p className="error-text">{error}</p>}

        <div className="project-form-actions">
          <button type="button" className="icon-btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="login-button" disabled={saving}>
            {saving ? 'Creating...' : 'Create project'}
          </button>
        </div>
      </form>
    </div>
  )
}

function ProjectsStatsBar({ allProjects, configuredCount, testedCount }) {
  const totalRuns = allProjects.reduce((sum, p) => sum + (p.total_runs || 0), 0)
  const totalTests = allProjects.reduce((sum, p) => sum + (p.total_tests || 0), 0)
  const totalPassed = allProjects.reduce((sum, p) => sum + (p.passed || 0), 0)
  const totalGraded = allProjects.reduce((sum, p) => sum + (p.passed || 0) + (p.failed || 0), 0)
  const passRate = totalGraded > 0 ? Math.round((totalPassed / totalGraded) * 100) : null

  return (
    <div className="stats-bar">
      <div className="stat-card">
        <div className="stat-icon">
          <IconLayers />
        </div>
        <div className="stat-body">
          <span className="stat-value mono">{configuredCount}</span>
          <span className="stat-label">Projects</span>
        </div>
      </div>

      <div className="stat-card">
        <div className="stat-icon">
          <IconCheck />
        </div>
        <div className="stat-body">
          <span className="stat-value mono">{testedCount}</span>
          <span className="stat-label">Projects tested</span>
        </div>
      </div>

      <div className="stat-card">
        <div className="stat-icon">
          <IconRefresh />
        </div>
        <div className="stat-body">
          <span className="stat-value mono">{totalRuns}</span>
          <span className="stat-label">Total runs</span>
        </div>
      </div>

      <div className="stat-card">
        <div className="stat-icon">
          <IconX />
        </div>
        <div className="stat-body">
          <span className="stat-value mono">{passRate !== null ? `${passRate}%` : '--'}</span>
          <span className="stat-label">Pass rate</span>
          <span className="stat-sublabel muted">{totalTests} tests</span>
        </div>
      </div>
    </div>
  )
}

function ProjectCard({ project, onClick }) {
  return (
    <div className="project-card" onClick={onClick}>
      <div className="project-card-header">
        <span className="project-card-icon">
          <IconLayers size={20} />
        </span>
        <div>
          <h3 className="project-card-name">{project.name}</h3>
          <span className="muted project-card-sub">
            {project.total_runs} run{project.total_runs === 1 ? '' : 's'}
            {project.last_run_at ? ` \u00b7 last ${relativeTime(project.last_run_at)}` : ''}
          </span>
        </div>
      </div>
    </div>
  )
}

function Projects({ onSelectProject }) {
  const [projects, setProjects] = useState([])
  const [configs, setConfigs] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [projectData, configData] = await Promise.all([listProjects(), listProjectConfigs()])
      setProjects(projectData)
      setConfigs(configData)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const projectNames = new Set(projects.map((p) => p.name))
  const configOnlyProjects = configs
    .filter((c) => !projectNames.has(c.name))
    .map((c) => ({
      name: c.name,
      total_runs: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      total_tests: 0,
      last_run_at: null,
    }))
  const allProjects = [...projects, ...configOnlyProjects]

  return (
    <div className="dashboard">
      <ProjectsStatsBar
        allProjects={allProjects}
        configuredCount={configs.length}
        testedCount={projects.length}
      />

      <div className="runs-list-header">
        <h2>Projects</h2>
        <button className="icon-btn" onClick={() => setShowModal(true)}>
          + New project
        </button>
      </div>

      {loading && <p className="muted">Loading...</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && allProjects.length === 0 && !error && (
        <div className="empty-state">
          <IconLayers size={28} />
          <p className="muted">No projects yet. Create one to get started.</p>
        </div>
      )}

      <div className="project-grid">
        {allProjects.map((project) => (
          <ProjectCard
            key={project.name}
            project={project}
            onClick={() => onSelectProject(project.name)}
          />
        ))}
      </div>

      {showModal && (
        <NewProjectModal
          onCreated={() => {
            setShowModal(false)
            loadAll()
          }}
          onCancel={() => setShowModal(false)}
        />
      )}
    </div>
  )
}

export default Projects