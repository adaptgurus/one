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
const {
  httpMethod,
  from: fromData,
} = require('../../../utils/constants/defaults')

const basepath = '/dr'
const { GET, POST, PUT } = httpMethod
const { resource, postBody } = fromData

const CAPABILITIES = 'dr.capabilities'
const SITE_IDENTITY = 'dr.site.identity'
const SITES = 'dr.sites'
const SITE_CREATE = 'dr.site.create'
const SITE_PAIRS = 'dr.site.pairs'
const SITE_PAIR_CREATE = 'dr.site.pair.create'
const ENVIRONMENT_NETWORKS = 'dr.environment.networks'
const ENVIRONMENT_NETWORKS_ALLOCATE = 'dr.environment.networks.allocate'
const ENVIRONMENT_NETWORKS_PROVISION = 'dr.environment.networks.provision'
const SITE_VMS = 'dr.site.vms'
const VM_CHECKPOINTS = 'dr.vm.checkpoints'
const RECOVERY_MAPPING = 'dr.recovery.mapping'
const RECOVERY_MAPPING_UPDATE = 'dr.recovery.mapping.update'
const ENABLE_NDR = 'dr.ndr.enable'
const MANAGEMENT_BACKUPS = 'dr.management.backups'
const MANAGEMENT_BACKUP_NOW = 'dr.management.backup.now'
const DOMAINS = 'dr.domains'
const DOMAIN_CREATE = 'dr.domain.create'
const RECOVERY_POINTS = 'dr.recovery.points'
const CHECKPOINT = 'dr.checkpoint'

const Actions = {
  CAPABILITIES,
  SITE_IDENTITY,
  SITES,
  SITE_CREATE,
  SITE_PAIRS,
  SITE_PAIR_CREATE,
  ENVIRONMENT_NETWORKS,
  ENVIRONMENT_NETWORKS_ALLOCATE,
  ENVIRONMENT_NETWORKS_PROVISION,
  SITE_VMS,
  VM_CHECKPOINTS,
  RECOVERY_MAPPING,
  RECOVERY_MAPPING_UPDATE,
  ENABLE_NDR,
  MANAGEMENT_BACKUPS,
  MANAGEMENT_BACKUP_NOW,
  DOMAINS,
  DOMAIN_CREATE,
  RECOVERY_POINTS,
  CHECKPOINT,
}

module.exports = {
  Actions,
  Commands: {
    [CAPABILITIES]: {
      path: `${basepath}/capabilities`,
      httpMethod: GET,
      auth: true,
    },
    [SITE_IDENTITY]: {
      path: `${basepath}/site-identity`,
      httpMethod: GET,
      auth: true,
    },
    [SITES]: {
      path: `${basepath}/sites`,
      httpMethod: GET,
      auth: true,
    },
    [SITE_CREATE]: {
      path: `${basepath}/sites`,
      httpMethod: POST,
      auth: true,
      params: { site: { from: postBody } },
    },

    [SITE_PAIRS]: {
      path: `${basepath}/site-pairs`,
      httpMethod: GET,
      auth: true,
    },
    [SITE_PAIR_CREATE]: {
      path: `${basepath}/site-pairs`,
      httpMethod: POST,
      auth: true,
      params: { pair: { from: postBody } },
    },
    [ENVIRONMENT_NETWORKS]: {
      path: `${basepath}/environment-networks/:siteId`,
      httpMethod: GET,
      auth: true,
      params: { siteId: { from: resource } },
    },
    [ENVIRONMENT_NETWORKS_ALLOCATE]: {
      path: `${basepath}/environment-networks/:siteId/allocate`,
      httpMethod: POST,
      auth: true,
      params: {
        siteId: { from: resource },
        allocation: { from: postBody },
      },
    },
    [ENVIRONMENT_NETWORKS_PROVISION]: {
      path: `${basepath}/environment-networks/:siteId/provision`,
      httpMethod: POST,
      auth: true,
      params: { siteId: { from: resource } },
    },
    [SITE_VMS]: {
      path: `${basepath}/sites/:siteId/vms`,
      httpMethod: GET,
      auth: true,
      params: { siteId: { from: resource } },
    },
    [VM_CHECKPOINTS]: {
      path: `${basepath}/sites/:siteId/vms/:workloadId/checkpoints`,
      httpMethod: GET,
      auth: true,
      params: {
        siteId: { from: resource },
        workloadId: { from: resource },
      },
    },
    [RECOVERY_MAPPING]: {
      path: `${basepath}/protection-domains/:groupId/recovery-mappings/:siteId`,
      httpMethod: GET,
      auth: true,
      params: {
        groupId: { from: resource },
        siteId: { from: resource },
      },
    },
    [RECOVERY_MAPPING_UPDATE]: {
      path: `${basepath}/protection-domains/:groupId/recovery-mappings/:siteId`,
      httpMethod: PUT,
      auth: true,
      params: {
        groupId: { from: resource },
        siteId: { from: resource },
        mapping: { from: postBody },
      },
    },
    [ENABLE_NDR]: {
      path: `${basepath}/protection-domains/:groupId/enable-ndr`,
      httpMethod: POST,
      auth: true,
      params: {
        groupId: { from: resource },
        config: { from: postBody },
      },
    },
    [MANAGEMENT_BACKUPS]: {
      path: `${basepath}/site-pairs/:pairId/management-backups`,
      httpMethod: GET,
      auth: true,
      params: { pairId: { from: resource } },
    },
    [MANAGEMENT_BACKUP_NOW]: {
      path: `${basepath}/site-pairs/:pairId/management-backup`,
      httpMethod: POST,
      auth: true,
      params: { pairId: { from: resource } },
    },
    [DOMAINS]: {
      path: `${basepath}/protection-domains`,
      httpMethod: GET,
      auth: true,
    },
    [DOMAIN_CREATE]: {
      path: `${basepath}/protection-domains`,
      httpMethod: POST,
      auth: true,
      params: { domain: { from: postBody } },
    },
    [RECOVERY_POINTS]: {
      path: `${basepath}/protection-domains/:id/recovery-points`,
      httpMethod: GET,
      auth: true,
      params: { id: { from: resource } },
    },
    [CHECKPOINT]: {
      path: `${basepath}/protection-domains/:id/checkpoint`,
      httpMethod: POST,
      auth: true,
      params: { id: { from: resource } },
    },
  },
}
