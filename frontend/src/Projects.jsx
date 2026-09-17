import { useEffect, useState, useCallback } from 'react'
import { listProjects, listProjectConfigs, createProjectConfig, triggerProjectRun } from './api/client'
import { relativeTime } from './StatsBar'
import { IconLayers, IconCheck, IconX, IconRefresh } from './icons'

function NewProjectModal({ onCreated, onCancel }) {
  const [name, setName] = useState('')
  const [projectType, setProjectType] = useState('python')
  const [workingDirectory, setWorkingDirectory] = useState('')
  const [pythonExecutable, setPythonExecutable] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await createProjectConfig(name, projectType, workingDirectory, pythonExecutable)
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
          <span className="field-label">Project type</span>
          <select
            className="field-input"
            value={projectType}
            onChange={(e) => setProjectType(e.target.value)}
          >
            <option value="python">Python (pytest)</option>
            <option value="java">Java (Maven / TestNG)</option>
          </select>
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

        {projectType === 'python' && (
          <label className="field">
            <span className="field-label">Python executable (project's venv)</span>
            <input
              className="field-input"
              value={pythonExecutable}
              onChange={(e) => setPythonExecutable(e.target.value)}
              placeholder="C:\...\Automation Framework\.venv\Scripts\python.exe"
            />
          </label>
        )}

        {projectType === 'java' && (
          <p className="muted modal-desc">
            Runs "mvn test" in the working directory above. Make sure "mvn" is on the system PATH.
          </p>
        )}

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

function RunTestsModal({ config, onConfirm, onCancel }) {
  const ideName = config.project_type === 'java' ? 'IntelliJ IDEA' : 'PyCharm'

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Open {config.name} in {ideName}</h3>
        <p className="muted modal-desc">
          This opens {ideName} on the project's directory. Run the test you want from
          inside the IDE \u2014 results will still report back to this dashboard.
        </p>
        <div className="project-form-actions">
          <button className="icon-btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="login-button" onClick={() => onConfirm()}>
            Open {ideName}
          </button>
        </div>
      </div>
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

function ProjectCard({ project, config, onClick, isRunning, onRunClick }) {
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

      {config && (
        <button
          className="icon-btn run-tests-btn"
          onClick={(e) => {
            e.stopPropagation()
            onRunClick(config)
          }}
          disabled={isRunning}
        >
          <IconRefresh size={13} />
          {isRunning ? 'Opening...' : 'Run tests'}
        </button>
      )}
    </div>
  )
}

function Projects({ onSelectProject }) {
  const [projects, setProjects] = useState([])
  const [configs, setConfigs] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [runTarget, setRunTarget] = useState(null)
  const [runningIds, setRunningIds] = useState(() => new Set())

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

  const configByName = Object.fromEntries(configs.map((c) => [c.name, c]))
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

  const handleConfirmRun = async (testPath) => {
    const config = runTarget
    setRunTarget(null)
    setError('')
    setRunningIds((prev) => new Set(prev).add(config.id))
    try {
      await triggerProjectRun(config.id, testPath)
    } catch (err) {
      setError(err.message)
    } finally {
      setTimeout(() => {
        setRunningIds((prev) => {
          const next = new Set(prev)
          next.delete(config.id)
          return next
        })
      }, 3000)
    }
  }

  return (
    <div className="dashboard">
      <ProjectsStatsBar
        allProjects={allProjects}
        configuredCount={configs.length}
        testedCount={projects.length}
      />

      <div className="runs-list-header">
        <h2>Projects</h2>
        <button className="icon-btn" onClick={() => setShowForm(true)}>
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
            config={configByName[project.name]}
            onClick={() => onSelectProject(project.name)}
            isRunning={configByName[project.name] && runningIds.has(configByName[project.name].id)}
            onRunClick={setRunTarget}
          />
        ))}
      </div>

      {showForm && (
        <NewProjectModal
          onCreated={() => {
            setShowForm(false)
            loadAll()
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {runTarget && (
        <RunTestsModal
          config={runTarget}
          onConfirm={handleConfirmRun}
          onCancel={() => setRunTarget(null)}
        />
      )}
    </div>
  )
}

export default Projects