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
export const STORAGE_PROFILE = Object.freeze({
  ISCSI_MULTIPATH: 'layersentry-iscsi-multipath',
  LINSTOR: 'linstor-linstor',
})

export const STORAGE_PACKAGES = Object.freeze({
  iscsi: {
    rpm: [
      'device-mapper-multipath',
      'iscsi-initiator-utils',
      'lvm2',
      'lsscsi',
      'sg3_utils',
    ],
    deb: ['multipath-tools', 'open-iscsi', 'lvm2', 'lsscsi', 'sg3-utils'],
  },
  linstorController: {
    rpm: ['linbit-sds-controller', 'linstor-opennebula'],
    deb: ['linbit-sds-controller', 'linstor-opennebula'],
  },
  linstorSatellite: {
    rpm: ['linbit-sds-satellite', 'kmod-drbd'],
    deb: ['linbit-sds-satellite', 'drbd-dkms'],
  },
  nfs: { rpm: ['nfs-utils'], deb: ['nfs-common'] },
  ceph: { rpm: ['ceph-common'], deb: ['ceph-common'] },
})

const text = (value) => String(value ?? '').trim()
const list = (value) =>
  (Array.isArray(value) ? value : [value]).map(text).filter(Boolean)

/**
 * @param {object} values - Raw datastore form values
 * @returns {object} Normalized iSCSI multipath datastore attributes
 */
export const normalizeIscsiMultipath = (values = {}) => {
  const portals = list(values.LAYERSENTRY_ISCSI_PORTALS)
  const target = text(values.LAYERSENTRY_ISCSI_TARGET_IQN)
  const wwid = text(values.LAYERSENTRY_ISCSI_WWID)
    .replace(/^0x/i, '')
    .toLowerCase()
  if (portals.length < 2)
    throw new Error('Multipath iSCSI requires at least two portals')
  if (
    !target.startsWith('iqn.') &&
    !target.startsWith('eui.') &&
    !target.startsWith('naa.')
  ) {
    throw new Error('Invalid iSCSI target identifier')
  }
  if (!/^[a-f0-9]{16,128}$/.test(wwid))
    throw new Error('Invalid multipath WWID')

  return {
    LAYERSENTRY_ISCSI_PORTALS: portals.join(','),
    LAYERSENTRY_ISCSI_TARGET_IQN: target,
    LAYERSENTRY_ISCSI_WWID: wwid,
    LAYERSENTRY_MULTIPATH_REQUIRED: 'YES',
  }
}

/**
 * @param {object} values - Raw datastore form values
 * @returns {object} Normalized LINSTOR datastore attributes
 */
export const normalizeLinstor = (values = {}) => {
  const group = text(values.LINSTOR_RESOURCE_GROUP)
  const controllers = list(values.LINSTOR_CONTROLLERS)
  if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(group))
    throw new Error('Invalid LINSTOR resource group')

  return {
    LINSTOR_RESOURCE_GROUP: group,
    LINSTOR_CONTROLLERS: controllers.length ? controllers.join(',') : undefined,
  }
}

/**
 * @param {string} profile - LayerSentry storage profile identifier
 * @param {string} osFamily - Package family, rpm or deb
 * @returns {{frontend: string[], hosts: string[]}} Package installation plan
 */
export const storageInstallPlan = (profile, osFamily = 'rpm') => {
  const family = osFamily === 'deb' ? 'deb' : 'rpm'
  if (profile === STORAGE_PROFILE.ISCSI_MULTIPATH) {
    return { frontend: [], hosts: STORAGE_PACKAGES.iscsi[family] }
  }
  if (profile === STORAGE_PROFILE.LINSTOR) {
    return {
      frontend: STORAGE_PACKAGES.linstorController[family],
      hosts: STORAGE_PACKAGES.linstorSatellite[family],
    }
  }

  return { frontend: [], hosts: [] }
}
