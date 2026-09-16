import { useState } from 'react'
import { login } from './api/client'

function Login({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username, password)
      onLogin()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <form className="login-panel" onSubmit={handleSubmit}>
        <div className="brand login-brand">
          <span className="brand-mark" />
          <div className="brand-text">
            <h1>QA Dashboard</h1>
            <p>Sign in to continue</p>
          </div>
        </div>

        <label className="field">
          <span className="field-label">Username</span>
          <input
            className="field-input"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            required
          />
        </label>

        <label className="field">
          <span className="field-label">Password</span>
          <input
            className="field-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        {error && <p className="error-text login-error">{error}</p>}

        <button className="login-button" type="submit" disabled={loading}>
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}

export default Login