import { useState, useEffect } from 'react'
import TestRuns from './TestRuns'
import Projects from './Projects'
import Users from './Users'
import Login from './Login'
import { clearToken, getToken, getMe } from './api/client'
import { IconSun, IconMoon } from './icons'
import './App.css'
import Issues from './Issues'   // add near your other imports

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
    getMe().then(setMe).catch(() => setMe(null))
  }, [authed])

  if (checkingAuth) {
    return null
  }

  if (!authed) {
    return <Login onLogin={() => setAuthed(true)} />
  }

  const handleLogout = () => {
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
            <button className="theme-toggle" onClick={handleLogout} title="Log out">
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
    </div>
  )
}

export default App