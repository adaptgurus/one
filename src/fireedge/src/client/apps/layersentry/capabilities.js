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
/* eslint-disable jsdoc/require-jsdoc */
import { SERVER_CONFIG } from '@ConstantsModule'

export const CAPABILITY_IDS = Object.freeze({
  VM_CREATE: 'VM_CREATE',
  AFFINITY_CREATE: 'AFFINITY_CREATE',
  KUBERNETES: 'KUBERNETES',
  APPLICATIONS_ONEFLOW: 'APPLICATIONS_ONEFLOW',
  BACKUP_RECOVERY: 'BACKUP_RECOVERY',
  SITE_RECOVERY_DR: 'SITE_RECOVERY_DR',
  REPLICATION_V2: 'REPLICATION_V2',
  BACKUP_STORAGE: 'BACKUP_STORAGE',
  STORAGE_ONBOARDING: 'STORAGE_ONBOARDING',
  PROVIDERS_ONEFORM: 'PROVIDERS_ONEFORM',
  SUPPORT_TICKETING: 'SUPPORT_TICKETING',
})

export const CAPABILITY_VISIBILITY = Object.freeze({
  VISIBLE_ENABLED: 'VISIBLE_ENABLED',
  VISIBLE_READ_ONLY: 'VISIBLE_READ_ONLY',
  VISIBLE_DISABLED: 'VISIBLE_DISABLED',
  HIDDEN_NOT_INSTALLED: 'HIDDEN_NOT_INSTALLED',
  HIDDEN_NOT_CONFIGURED: 'HIDDEN_NOT_CONFIGURED',
  HIDDEN_NOT_AUTHORIZED: 'HIDDEN_NOT_AUTHORIZED',
  HIDDEN_NOT_QUALIFIED: 'HIDDEN_NOT_QUALIFIED',
  HIDDEN_INCOMPATIBLE: 'HIDDEN_INCOMPATIBLE',
  ENGINEERING_ONLY: 'ENGINEERING_ONLY',
})

const DATA_SAFETY_REQUIRED = new Set([
  CAPABILITY_IDS.BACKUP_RECOVERY,
  CAPABILITY_IDS.SITE_RECOVERY_DR,
  CAPABILITY_IDS.REPLICATION_V2,
  CAPABILITY_IDS.BACKUP_STORAGE,
  CAPABILITY_IDS.STORAGE_ONBOARDING,
])

const CAPABILITY_PATHS = Object.freeze([
  ['/protection/replication', CAPABILITY_IDS.REPLICATION_V2],
  ['/protection/site-recovery', CAPABILITY_IDS.SITE_RECOVERY_DR],
  ['/protection/recovery-points', CAPABILITY_IDS.BACKUP_RECOVERY],
  ['/protection/backup-plans', CAPABILITY_IDS.BACKUP_RECOVERY],
  ['/protection/create', CAPABILITY_IDS.BACKUP_RECOVERY],
  ['/protection', CAPABILITY_IDS.BACKUP_RECOVERY],
  ['/compute/create', CAPABILITY_IDS.VM_CREATE],
  ['/vm-group/create', CAPABILITY_IDS.AFFINITY_CREATE],
  ['/kubernetes', CAPABILITY_IDS.KUBERNETES],
  ['/applications', CAPABILITY_IDS.APPLICATIONS_ONEFLOW],
  ['/platform/applications', CAPABILITY_IDS.APPLICATIONS_ONEFLOW],
  ['/platform/service-templates', CAPABILITY_IDS.APPLICATIONS_ONEFLOW],
  ['/infrastructure/backup-storage', CAPABILITY_IDS.BACKUP_STORAGE],
  ['/infrastructure/storage/create', CAPABILITY_IDS.STORAGE_ONBOARDING],
  ['/infrastructure/providers', CAPABILITY_IDS.PROVIDERS_ONEFORM],
  ['/support/create', CAPABILITY_IDS.SUPPORT_TICKETING],
])

const hidden = (visibility, reason) => ({
  visibility,
  enabled: false,
  reason,
})

export const getCapabilityModel = () =>
  SERVER_CONFIG?.layersentry_capabilities ??
  SERVER_CONFIG?.layersentryCapabilities ??
  {}

export const getCapabilityState = (capabilityId, model = {}) => {
  const capability = model?.[capabilityId]

  if (!capability || capability.enabled !== true) {
    return hidden(
      CAPABILITY_VISIBILITY.HIDDEN_NOT_QUALIFIED,
      'This capability is not enabled and qualified for this LayerSentry deployment.'
    )
  }

  if (capability.implementation !== true) {
    return hidden(
      CAPABILITY_VISIBILITY.HIDDEN_NOT_QUALIFIED,
      'The production implementation is not qualified.'
    )
  }
  if (capability.backend !== true) {
    return hidden(
      CAPABILITY_VISIBILITY.HIDDEN_NOT_INSTALLED,
      'The required backend service or appliance is not installed.'
    )
  }
  if (capability.configuration !== true) {
    return hidden(
      CAPABILITY_VISIBILITY.HIDDEN_NOT_CONFIGURED,
      'The required site configuration is not complete.'
    )
  }
  if (capability.health !== true) {
    return hidden(
      CAPABILITY_VISIBILITY.HIDDEN_NOT_QUALIFIED,
      'The required backend service is not healthy.'
    )
  }
  if (capability.authorization !== true) {
    return hidden(
      CAPABILITY_VISIBILITY.HIDDEN_NOT_AUTHORIZED,
      'The current account is not authorized for this capability.'
    )
  }
  if (capability.compatibility !== true) {
    return hidden(
      CAPABILITY_VISIBILITY.HIDDEN_INCOMPATIBLE,
      'The current environment is not compatible with this capability.'
    )
  }
  if (capability.qualification !== true) {
    return hidden(
      CAPABILITY_VISIBILITY.HIDDEN_NOT_QUALIFIED,
      'Production qualification is incomplete.'
    )
  }
  if (
    DATA_SAFETY_REQUIRED.has(capabilityId) &&
    capability.dataSafety !== true
  ) {
    return hidden(
      CAPABILITY_VISIBILITY.HIDDEN_NOT_QUALIFIED,
      'Required data-safety qualification is incomplete.'
    )
  }

  return {
    visibility:
      capability.readOnly === true
        ? CAPABILITY_VISIBILITY.VISIBLE_READ_ONLY
        : CAPABILITY_VISIBILITY.VISIBLE_ENABLED,
    enabled: true,
    reason: capability.reason,
  }
}

export const isCapabilityVisible = (capabilityId, model = {}) => {
  const { visibility } = getCapabilityState(capabilityId, model)

  return (
    visibility === CAPABILITY_VISIBILITY.VISIBLE_ENABLED ||
    visibility === CAPABILITY_VISIBILITY.VISIBLE_READ_ONLY
  )
}

export const getCapabilityForPath = (pathname = '') =>
  CAPABILITY_PATHS.find(
    ([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )?.[1]
