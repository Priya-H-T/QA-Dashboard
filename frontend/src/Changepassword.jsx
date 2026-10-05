import { useState } from 'react'
import { changePassword } from './api/client'

function ChangePassword({ onSuccess, onLogout }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.')
      return
    }
    if (newPassword === currentPassword) {
      setError('New password must be different from your current password.')
      return
    }

    setLoading(true)
    try {
      await changePassword(currentPassword, newPassword)
      onSuccess()
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
            <h1>Set a new password</h1>
            <p>An admin created this account for you. Choose your own password before continuing.</p>
          </div>
        </div>

        <label className="field">
          <span className="field-label">Current (temporary) password</span>
          <input
            className="field-input"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoFocus
            required
          />
        </label>

        <label className="field">
          <span className="field-label">New password</span>
          <input
            className="field-input"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={8}
            required
          />
        </label>

        <label className="field">
          <span className="field-label">Confirm new password</span>
          <input
            className="field-input"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            minLength={8}
            required
          />
        </label>

        {error && <p className="error-text login-error">{error}</p>}

        <button className="login-button" type="submit" disabled={loading}>
          {loading ? 'Updating...' : 'Set password and continue'}
        </button>

        <button
          type="button"
          className="icon-btn"
          style={{ marginTop: '0.75rem' }}
          onClick={onLogout}
        >
          Log out instead
        </button>
      </form>
    </div>
  )
}

export default ChangePassword