import { useState, useEffect } from 'react'
import TestRuns from './TestRuns'
import Projects from './Projects'
import Users from './Users'
import Login from './Login'
import ChangePassword from './ChangePassword'
import { clearToken, getToken, getMe } from './api/client'
import { IconSun, IconMoon } from './icons'
import './App.css'
import Issues from './Issues'   // add near your other imports

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
            {confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}

function App() {
  const [tab, setTab] = useState('projects')
  const [selectedProject, setSelectedProject] = useState(null)
  const [theme, setTheme] = useState(() => localStorage.getItem('qa-dashboard-theme') || 'dark')
  // Don't assume a stored token is valid just because it's present, but
  // don't throw away a still-valid session on every refresh either —
  // verify it against the backend once on load, and only fall back to
  // the login screen if that check fails or there's no token at all.
  const [authed, setAuthed] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [me, setMe] = useState(null)
  // Mirrors the backend's must_change_password flag. Set from whichever
  // response reaches us first — the /auth/login payload (fastest path,
  // right after signing in) or /auth/me (token-restore-on-refresh path) —
  // and gates the entire dashboard below, before Projects/Issues/Users
  // ever get a chance to mount and hit a 403 from the API.
  const [forcePasswordChange, setForcePasswordChange] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('qa-dashboard-theme', theme)
  }, [theme])

  useEffect(() => {
    if (!getToken()) {
      setCheckingAuth(false)
      return
    }
    getMe()
      .then((data) => {
        setMe(data)
        setAuthed(true)
        setForcePasswordChange(!!data.must_change_password)
      })
      .catch(() => {
        clearToken()
        setAuthed(false)
      })
      .finally(() => setCheckingAuth(false))
  }, [])

  useEffect(() => {
    if (!authed) {
      setMe(null)
      return
    }
    getMe()
      .then((data) => {
        setMe(data)
        setForcePasswordChange(!!data.must_change_password)
      })
      .catch(() => setMe(null))
  }, [authed])

  if (checkingAuth) {
    return null
  }

  const handleLogin = (loginData) => {
    setAuthed(true)
    setForcePasswordChange(!!loginData?.must_change_password)
  }

  if (!authed) {
    return <Login onLogin={handleLogin} />
  }

  const handlePasswordChanged = () => {
    setForcePasswordChange(false)
    // Refresh /auth/me so `me` (role, etc.) reflects the now-unlocked
    // account rather than whatever partial state we had before.
    getMe().then(setMe).catch(() => {})
  }

  const handleForceLogout = () => {
    clearToken()
    setAuthed(false)
    setForcePasswordChange(false)
  }

  if (forcePasswordChange) {
    return <ChangePassword onSuccess={handlePasswordChanged} onLogout={handleForceLogout} />
  }

  const confirmLogout = () => {
    setShowLogoutConfirm(false)
    clearToken()
    setAuthed(false)
  }

  const handleTabChange = (nextTab) => {
    setTab(nextTab)
    setSelectedProject(null)
  }

  const isAdmin = me?.role === 'admin'

  return (
    <div className="page">
      <div className="shell">
        <header className="app-header">
          <div className="brand">
            <span className="brand-mark" />
            <div className="brand-text">
              <h1>QA Dashboard</h1>
            </div>
          </div>

          <div className="header-controls">
            <nav className="tabs">
              <button className={`tab ${tab === 'projects' ? 'active' : ''}`} onClick={() => handleTabChange('projects')}>
                Projects
              </button>
              <button className={`tab ${tab === 'issues' ? 'active' : ''}`} onClick={() => handleTabChange('issues')}>
                Issues
               </button>
              {isAdmin && (
                <button className={`tab ${tab === 'users' ? 'active' : ''}`} onClick={() => handleTabChange('users')}>
                  Users
                </button>
              )}
            </nav>
            <button
              className="theme-toggle"
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              title="Toggle theme"
            >
              {theme === 'dark' ? <IconSun /> : <IconMoon />}
              {theme === 'dark' ? 'Light' : 'Dark'}
            </button>
            <button className="theme-toggle" onClick={() => setShowLogoutConfirm(true)} title="Log out">
              Log out
            </button>
          </div>
        </header>

        {tab === 'projects' && !selectedProject && (
          <Projects onSelectProject={setSelectedProject} />
        )}
        {tab === 'projects' && selectedProject && (
          <TestRuns project={selectedProject} onBack={() => setSelectedProject(null)} />
        )}
        {tab === 'issues' && (
         <Issues
            onSelectProject={(project) => {
            setSelectedProject(project)
            setTab('projects')
    }}
  />
)}
        {tab === 'users' && isAdmin && <Users />}
      </div>

      {showLogoutConfirm && (
        <ConfirmModal
          title="Log out?"
          message="You'll need to sign in again to access the dashboard."
          confirmLabel="Log out"
          onConfirm={confirmLogout}
          onCancel={() => setShowLogoutConfirm(false)}
        />
      )}
    </div>
  )
}

export default App