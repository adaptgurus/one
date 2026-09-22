export const REPLICATION_V2_API = '/api/v1/replication-v2'

const json = async (path, options = {}) => {
  const response = await fetch(REPLICATION_V2_API + path, {
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
    ...options,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload?.error || 'Replication request failed')
  return payload
}

export const replicationAPI = {
  capabilities: () => json('/capabilities'),
  sessions: () => json('/sessions'),
  preflight: (request) => json('/preflight', { method: 'POST', body: JSON.stringify({ request }) }),
  create: (request) => json('/sessions', { method: 'POST', body: JSON.stringify({ request }) }),
  checkpoints: (sessionId) => json('/checkpoints', { method: 'POST', body: JSON.stringify({ sessionId }) }),
  clone: (sessionId, checkpointId, name) => json('/clone', { method: 'POST', body: JSON.stringify({ sessionId, checkpointId, name }) }),
  rebaseline: (sessionId) => json('/rebaseline', { method: 'POST', body: JSON.stringify({ sessionId }) }),
}
