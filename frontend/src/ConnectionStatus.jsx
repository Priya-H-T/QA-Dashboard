import { useEffect, useState, useCallback } from 'react'
import { checkHealth } from './api/client'

const STATUS = { IDLE: 'checking', UP: 'connected', DOWN: 'unreachable' }

function ConnectionStatus() {
  const [status, setStatus] = useState(STATUS.IDLE)
  const [detail, setDetail] = useState('')
  const [lastChecked, setLastChecked] = useState(null)

  const runCheck = useCallback(async () => {
    setStatus(STATUS.IDLE)
    try {
      const data = await checkHealth()
      setDetail(JSON.stringify(data))
      setStatus(STATUS.UP)
    } catch (err) {
      setDetail(err.message)
      setStatus(STATUS.DOWN)
    } finally {
      setLastChecked(new Date())
    }
  }, [])

  useEffect(() => { runCheck() }, [runCheck])

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="dot dot-pass" />
        <h1>Connection</h1>
      </div>
      <div className="row">
        <span className="label">Backend endpoint</span>
        <span className="value mono">{import.meta.env.VITE_API_BASE_URL}</span>
      </div>
      <div className="row">
        <span className="label">Status</span>
        <span className={`value mono status-${status}`}>{status}</span>
      </div>
      <div className="row">
        <span className="label">Response</span>
        <span className="value mono response">{detail || '-'}</span>
      </div>
      {lastChecked && (
        <div className="row">
          <span className="label">Last checked</span>
          <span className="value mono">{lastChecked.toLocaleTimeString()}</span>
        </div>
      )}
      <button className="recheck" onClick={runCheck}>Recheck connection</button>
    </div>
  )
}

export default ConnectionStatus