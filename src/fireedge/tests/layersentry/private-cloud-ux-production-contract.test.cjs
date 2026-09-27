/* SPDX-License-Identifier: Apache-2.0 */
const { before, test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '../..')
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8')
let replication

before(async () => {
  const source = read('src/client/apps/layersentry/replicationV2.js')
  replication = await import(
    'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
  )
})

test('KubeOne is the only Kubernetes lifecycle surface', () => {
  const overview = read('src/client/apps/layersentry/pages/Overview.js')
  const search = read('src/client/apps/layersentry/pages/Search.js')
  const workspace = read('src/client/apps/layersentry/pages/KubernetesWorkspace.js')

  for (const source of [overview, search, workspace]) {
    assert.match(source, /KubeOnePortalAPI/)
    assert.doesNotMatch(source, /OneKsAPI/)
  }
  assert.match(workspace, /CAPABILITY_IDS\.KUBERNETES_CREATE/)
  assert.match(workspace, /canMutate/)
})

test('host detail is read-first and exposes required authoritative domains', () => {
  const detail = read('src/client/apps/layersentry/pages/HostDetail.js')
  const portal = read('src/client/apps/layersentry/Portal.js')

  for (const label of [
    'VM Placement',
    'Storage & Devices',
    'DRS & Maintenance',
    'Management',
    'Workload / Production VM',
    'Storage',
    'Live Migration',
    'Backup / Replication',
    'Cluster Control (optional)',
    'VLAN',
    'VNI',
    'MTU',
    'Throughput',
    'Errors / drops',
    'Drift',
  ]) {
    assert.ok(detail.includes(label), `missing host detail label ${label}`)
  }
  assert.match(detail, /HostAPI\.useGetHostsQuery/)
  assert.match(detail, /VmAPI\.useGetVmsQuery/)
  assert.match(detail, /does not infer a role/)
  assert.doesNotMatch(detail, /use[A-Za-z]+Mutation/)
  assert.match(portal, /INFRA_HOSTS}\/\:id/)
})

test('DR v2 displays measured telemetry and Guardian evidence without inference', () => {
  const replication = read(
    'src/client/apps/layersentry/pages/ReplicationV2Workspace.js'
  )
  const guardian = read(
    'src/client/apps/layersentry/components/GuardianInsight.js'
  )

  for (const label of [
    'Bytes received',
    'Sync progress',
    'Replication throughput',
    'Network utilization',
    'Verification',
    'Latest RESTORABLE checkpoint',
    'Sync ETA (projected)',
    'Recovery boot contract',
    'Secure Boot',
    'vTPM',
    'portable GPU/PCI selector(s)',
    'digest-bound',
  ]) {
    assert.ok(replication.includes(label), `missing DR telemetry ${label}`)
  }
  assert.match(replication, /GuardianInsight/)
  assert.match(replication, /latestRestorableCheckpoint/)
  assert.match(replication, /!restorable/)
  assert.match(guardian, /No\s+recommendation or safe action is inferred/)
  assert.match(guardian, /never bypass/)
})

test('DR v2 permits recovery only from verified digest-bound RESTORABLE points', () => {
  const base = {
    id: 'cp-7',
    generation: 7,
    committed_at: '2026-09-27T12:00:00Z',
    state: 'RESTORABLE',
    verification_state: 'VERIFIED',
    recovery_manifest: {
      digest: `sha256:${'a'.repeat(64)}`,
      disks: [{ id: '0' }],
    },
  }

  assert.equal(replication.isRestorableCheckpoint(base), true)
  assert.equal(
    replication.isRestorableCheckpoint({ ...base, state: 'COMMITTED' }),
    false
  )
  assert.equal(
    replication.isRestorableCheckpoint({
      ...base,
      verification_state: 'FAILED',
    }),
    false
  )
  assert.equal(
    replication.isRestorableCheckpoint({
      ...base,
      recovery_manifest: { disks: [{ id: '0' }] },
    }),
    false
  )
  assert.equal(
    replication.latestRestorableCheckpoint([
      base,
      {
        ...base,
        id: 'cp-8',
        generation: 8,
        committed_at: '2026-09-27T12:05:00Z',
      },
      { ...base, id: 'cp-9', generation: 9, state: 'VERIFYING' },
    ]).id,
    'cp-8'
  )
})

test('backup and DC/DR surfaces share evidence-bound Guardian presentation', () => {
  const backup = read(
    'src/client/apps/layersentry/pages/ProtectionWorkspace.js'
  )
  const siteRecovery = read(
    'src/client/apps/layersentry/pages/SiteRecoveryWorkspace.js'
  )

  assert.match(backup, /GuardianInsight/)
  assert.match(backup, /scope="backup"/)
  assert.match(siteRecovery, /Guardian AI for DC\/DR/)
  assert.match(siteRecovery, /PROTECTION_REPLICATION/)
})
