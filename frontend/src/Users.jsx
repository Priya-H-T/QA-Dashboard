import { useEffect, useState, useCallback } from 'react'
import { listUsers, createUser } from './api/client'
import { relativeTime } from './StatsBar'
import { IconLayers } from './icons'

function NewUserModal({ onCreated, onCancel }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('user')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await createUser(username, password, role)
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
        <h3 className="modal-title">New user</h3>
        <p className="muted modal-desc">Create a login for a teammate.</p>

        <label className="field">
          <span className="field-label">Username</span>
          <input
            className="field-input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="name@company.com"
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

        <label className="field">
          <span className="field-label">Role</span>
          <select
            className="field-input"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </label>

        {error && <p className="error-text">{error}</p>}

        <div className="project-form-actions">
          <button type="button" className="icon-btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="login-button" disabled={saving}>
            {saving ? 'Creating...' : 'Create user'}
          </button>
        </div>
      </form>
    </div>
  )
}

function Users() {
  const [users, setUsers] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await listUsers()
      setUsers(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  return (
    <div className="dashboard">
      <div className="runs-list-header">
        <h2>Users</h2>
        <button className="icon-btn" onClick={() => setShowModal(true)}>
          + New user
        </button>
      </div>

      {loading && <p className="muted">Loading...</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && users.length === 0 && !error && (
        <div className="empty-state">
          <IconLayers size={28} />
          <p className="muted">No users found.</p>
        </div>
      )}

      {users.length > 0 && (
        <div className="users-table">
          <div className="users-row users-row-head">
            <span>Username</span>
            <span>Role</span>
            <span>Created</span>
          </div>
          {users.map((u) => (
            <div key={u.id} className="users-row">
              <span className="mono">{u.username}</span>
              <span className={`badge ${u.role === 'admin' ? 'badge-pass' : ''}`}>{u.role}</span>
              <span className="muted">{relativeTime(u.created_at)}</span>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <NewUserModal
          onCreated={() => {
            setShowModal(false)
            loadUsers()
          }}
          onCancel={() => setShowModal(false)}
        />
      )}
    </div>
  )
}

export default Users