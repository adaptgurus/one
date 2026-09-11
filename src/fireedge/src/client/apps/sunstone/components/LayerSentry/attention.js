/* LayerSentry native attention model. SPDX-License-Identifier: Apache-2.0 */

const values = (value) => [value ?? []].flat().filter(Boolean)
const countIds = (value) => values(value?.ID ?? value).length
const text = (value) => String(value ?? '').toUpperCase()

const severityRank = { error: 0, warning: 1, info: 2 }

const getProtection = (vm = {}) =>
  values(vm?.TEMPLATE?.LAYERSENTRY_PROTECTION).find(
    (entry) => entry && typeof entry === 'object'
  )

/**
 * Build a read-only attention list from authoritative resource observations.
 * No item here means notification delivery, acknowledgement, or recovery.
 *
 * @param {object} input - Native observations
 * @param {Array} input.vms - {resource,stateName} VM observations
 * @param {Array} input.backupJobs - Native BackupJob objects
 * @param {Array} input.clusters - {resource,stateName} OneKS observations
 * @returns {Array} attention items
 */
export const buildAttentionItems = ({
  vms = [],
  backupJobs = [],
  clusters = [],
} = {}) => {
  const items = []

  vms.forEach(({ resource: vm = {}, stateName = '' }) => {
    const state = text(stateName)
    if (/(FAIL|ERROR|UNKNOWN)/.test(state)) {
      items.push({
        id: `vm-${vm.ID}-state`,
        severity: 'error',
        kind: 'Virtual machine',
        title: `${vm.NAME ?? `VM #${vm.ID}`} needs attention`,
        detail: `Observed OpenNebula state: ${stateName || 'unknown'}.`,
        path: `/vm/${vm.ID}`,
      })
    }

    const protection = getProtection(vm)
    if (
      protection?.ENABLED === 'YES' &&
      protection?.REQUEST_STATE === 'REQUESTED_NOT_ACTIVE'
    ) {
      items.push({
        id: `vm-${vm.ID}-protection`,
        severity: 'warning',
        kind: 'Backup & DR',
        title: `${vm.NAME ?? `VM #${vm.ID}`} protection is requested, not active`,
        detail:
          'The VM contains a LayerSentry protection request, but no active/effective protection state has been published.',
        path: `/vm/${vm.ID}`,
      })
    }
  })

  backupJobs.forEach((job = {}) => {
    const failed = countIds(job.ERROR_VMS)
    const outdated = countIds(job.OUTDATED_VMS)
    if (failed > 0) {
      items.push({
        id: `backup-${job.ID}-error`,
        severity: 'error',
        kind: 'Backup',
        title: `${job.NAME ?? `Backup job #${job.ID}`} has failed VM backups`,
        detail: `${failed} VM${failed === 1 ? '' : 's'} currently reported in ERROR_VMS.`,
        path: `/backupjobs/${job.ID}`,
      })
    }
    if (outdated > 0) {
      items.push({
        id: `backup-${job.ID}-outdated`,
        severity: 'warning',
        kind: 'Backup',
        title: `${job.NAME ?? `Backup job #${job.ID}`} has outdated VM backups`,
        detail: `${outdated} VM${outdated === 1 ? '' : 's'} currently reported as outdated.`,
        path: `/backupjobs/${job.ID}`,
      })
    }
  })

  clusters.forEach(({ resource: cluster = {}, stateName = '' }) => {
    const state = text(stateName)
    if (/(FAIL|ERROR)/.test(state)) {
      items.push({
        id: `k8s-${cluster.ID}-error`,
        severity: 'error',
        kind: 'Kubernetes',
        title: `${cluster.NAME ?? `Cluster #${cluster.ID}`} lifecycle operation failed`,
        detail: `Observed OneKS state: ${stateName || 'unknown'}.`,
        path: `/kubernetes/${cluster.ID}`,
      })
    } else if (/(WARN|UNKNOWN)/.test(state)) {
      items.push({
        id: `k8s-${cluster.ID}-warning`,
        severity: 'warning',
        kind: 'Kubernetes',
        title: `${cluster.NAME ?? `Cluster #${cluster.ID}`} needs review`,
        detail: `Observed OneKS state: ${stateName || 'unknown'}.`,
        path: `/kubernetes/${cluster.ID}`,
      })
    }
  })

  return items.sort(
    (a, b) =>
      (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9) ||
      a.title.localeCompare(b.title)
  )
}
