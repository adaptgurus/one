/* ------------------------------------------------------------------------- *
 * Copyright 2002-2026, OpenNebula Project, OpenNebula Systems               *
 *                                                                           *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may   *
 * not use this file except in compliance with the License. You may obtain   *
 * a copy of the License at                                                  *
 *                                                                           *
 * http://www.apache.org/licenses/LICENSE-2.0                                *
 *                                                                           *
 * Unless required by applicable law or agreed to in writing, software       *
 * distributed under the License is distributed on an "AS IS" BASIS,         *
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.  *
 * See the License for the specific language governing permissions and       *
 * limitations under the License.                                            *
 * ------------------------------------------------------------------------- */
/* eslint-disable jsdoc/require-jsdoc, prettier/prettier, padding-line-between-statements */

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
  preflight: (request) =>
    json('/preflight', { method: 'POST', body: JSON.stringify({ request }) }),
  create: (request) =>
    json('/sessions', { method: 'POST', body: JSON.stringify({ request }) }),
  health: (sessionId) =>
    json('/health', { method: 'POST', body: JSON.stringify({ sessionId }) }),
  backendHealth: (sessionId) =>
    json('/backend-health', {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    }),
  checkpoints: (sessionId) =>
    json('/checkpoints', {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    }),
  clone: (sessionId, checkpointId, name) =>
    json('/clone', {
      method: 'POST',
      body: JSON.stringify({ sessionId, checkpointId, name }),
    }),
  rebaseline: (sessionId) =>
    json('/rebaseline', {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    }),
  putProtectionGroup: (group) =>
    json('/protection-groups', {
      method: 'POST',
      body: JSON.stringify({ group }),
    }),
  captureProtectionGroup: (groupId) =>
    json('/protection-groups/capture', {
      method: 'POST',
      body: JSON.stringify({ groupId }),
    }),
  protectionGroupCheckpoints: (groupId) =>
    json('/protection-groups/checkpoints', {
      method: 'POST',
      body: JSON.stringify({ groupId }),
    }),
}
