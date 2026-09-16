const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'
const TOKEN_KEY = 'qa-dashboard-token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`
  const token = getToken()

  const headers = { 'Content-Type': 'application/json', ...options.headers }
  if (token) headers['Authorization'] = `Bearer ${token}`

  let response
  try {
    response = await fetch(url, { headers, ...options })
  } catch (networkError) {
    throw new Error(
      `Could not reach ${url}. Is the backend running and is CORS enabled? (${networkError.message})`
    )
  }

  if (response.status === 401) {
    clearToken()
    window.location.reload()
    throw new Error('Session expired. Please log in again.')
  }

  if (!response.ok) {
    let detail = response.statusText
    try {
      const body = await response.json()
      detail = body.detail || JSON.stringify(body)
    } catch {
      // response wasn't JSON
    }
    throw new Error(`${response.status} ${detail}`)
  }

  if (response.status === 204) return null
  return response.json()
}

export const api = {
  get: (path) => request(path, { method: 'GET' }),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (path) => request(path, { method: 'DELETE' }),
}

export const checkHealth = () => api.get('/health')

export const listRuns = (project) =>
  api.get(project ? `/runs?project=${encodeURIComponent(project)}` : '/runs')

export const listProjects = () => api.get('/projects')

export const listProjectConfigs = () => api.get('/project-configs')

export const createProjectConfig = (name, workingDirectory, pythonExecutable) =>
  api.post('/project-configs', {
    name,
    working_directory: workingDirectory,
    python_executable: pythonExecutable || 'python',
  })

export const triggerProjectRun = (configId, testPath) =>
  api.post(`/project-configs/${configId}/trigger`, testPath ? { test_path: testPath } : {})

export const listTestCases = (project) =>
  api.get(project ? `/testcases?project=${encodeURIComponent(project)}` : '/testcases')

export const getRun = (runId) => api.get(`/runs/${runId}`)

export const screenshotUrl = (testCaseId) =>
  `${BASE_URL}/testcases/${testCaseId}/screenshot?token=${encodeURIComponent(getToken() || '')}`

export async function login(username, password) {
  const response = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!response.ok) {
    let detail = 'Invalid username or password'
    try {
      const body = await response.json()
      detail = body.detail || detail
    } catch {
      // ignore
    }
    throw new Error(detail)
  }
  const data = await response.json()
  setToken(data.token)
  return data.token
}


export const reportUrl = (runId) =>
  `${BASE_URL}/runs/${runId}/report?token=${encodeURIComponent(getToken() || '')}`

export const deleteReport = (runId) => api.delete(`/runs/${runId}/report`)

export const getMe = () => api.get('/auth/me')
export const listUsers = () => api.get('/users')

export const createUser = (username, password, role) =>
  api.post('/users', { username, password, role: role || 'user' })