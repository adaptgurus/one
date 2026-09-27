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

const value = (input) => String(input ?? '').trim().toUpperCase()
const asArray = (input) =>
  input === undefined || input === null
    ? []
    : Array.isArray(input)
    ? input
    : [input]

/**
 * Resolve the digest-bound recovery manifest returned by Replication v2.
 *
 * @param {object} checkpoint - Authoritative checkpoint readback
 * @returns {object|undefined} Recovery manifest, when published
 */
export const recoveryManifestForCheckpoint = (checkpoint = {}) =>
  checkpoint.recovery_manifest ??
  asArray(checkpoint.native_points)
    .map((point) => point?.recovery_manifest)
    .find(Boolean)

/**
 * A checkpoint is presented as RESTORABLE only when backend state,
 * verification, and an immutable recovery-manifest digest all agree.
 *
 * @param {object} checkpoint - Authoritative checkpoint readback
 * @returns {boolean} Whether test recovery is admissible
 */
export const isRestorableCheckpoint = (checkpoint = {}) => {
  const state = value(
    checkpoint.state ?? checkpoint.recovery_state ?? checkpoint.status
  )
  const verification = value(
    checkpoint.verification_state ?? checkpoint.verification_status
  )
  const manifest = recoveryManifestForCheckpoint(checkpoint)
  const digest = String(
    manifest?.digest ?? checkpoint.recovery_manifest_digest ?? ''
  ).trim()

  return (
    state === 'RESTORABLE' &&
    ['VERIFIED', 'PASS', 'PASSED', 'SUCCEEDED'].includes(verification) &&
    /^sha256:[a-f0-9]{64}$/i.test(digest)
  )
}

/**
 * Return the newest admissible recovery point without trusting list order.
 *
 * @param {object[]} checkpoints - Authoritative checkpoint readback
 * @returns {object|undefined} Latest restorable checkpoint
 */
export const latestRestorableCheckpoint = (checkpoints = []) =>
  asArray(checkpoints)
    .filter(isRestorableCheckpoint)
    .sort((left, right) => {
      const time =
        new Date(right.committed_at ?? 0).getTime() -
        new Date(left.committed_at ?? 0).getTime()

      return time || Number(right.generation ?? 0) - Number(left.generation ?? 0)
    })[0]

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
  drSites: () => json('/dr/sites'),
  drEnvironmentNetworks: () => json('/dr/environment-networks'),
  drProvisionEnvironmentNetworks: (plan) =>
    json('/dr/environment-networks/provision', {
      method: 'POST',
      body: JSON.stringify({ plan }),
    }),
  drPairSite: (request) =>
    json('/dr/site-pairs', {
      method: 'POST',
      body: JSON.stringify({ request }),
    }),
  drManagementBackupPolicies: (dc, dr) =>
    json('/dr/management-backup-policies', {
      method: 'POST',
      body: JSON.stringify({ dc, dr }),
    }),
  drRunManagementBackup: (source, target) =>
    json('/dr/management-backups/run', {
      method: 'POST',
      body: JSON.stringify({ source, target }),
    }),
  drManagementBackupStatus: (source, target) =>
    json('/dr/management-backups/status', {
      method: 'POST',
      body: JSON.stringify({ source, target }),
    }),
  drVMCheckpoints: (groupId, siteId) =>
    json('/dr/vm-checkpoints', {
      method: 'POST',
      body: JSON.stringify({ groupId, siteId }),
    }),
  drPutRecoveryMapping: (request) =>
    json('/dr/recovery-mappings', {
      method: 'POST',
      body: JSON.stringify({ request }),
    }),
  drGetRecoveryMapping: (workloadId, siteId) =>
    json('/dr/recovery-mappings/get', {
      method: 'POST',
      body: JSON.stringify({ workloadId, siteId }),
    }),
}
