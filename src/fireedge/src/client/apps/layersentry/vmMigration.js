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

const toArray = (value) => (Array.isArray(value) ? value : value ? [value] : [])

export const getLastVmHistory = (vm) => {
  const history = toArray(vm?.HISTORY_RECORDS?.HISTORY)

  return history[history.length - 1] ?? {}
}

export const getTransferDriver = (datastore) =>
  String(datastore?.TM_MAD ?? datastore?.TEMPLATE?.TM_MAD ?? '')
    .trim()
    .toLowerCase()

const isExplicitlyEnabled = (value) =>
  ['YES', 'TRUE', '1'].includes(
    String(value ?? '')
      .trim()
      .toUpperCase()
  )

export const datastoreAllowsMigration = (datastore, live = false) => {
  if (!datastore) return false
  const template = datastore.TEMPLATE ?? {}

  return isExplicitlyEnabled(
    live ? template.DS_LIVE_MIGRATE : template.DS_MIGRATE
  )
}

export const eligibleSystemDatastores = (
  datastores,
  currentDatastore,
  live = false
) => {
  const sourceDriver = getTransferDriver(currentDatastore)
  if (!sourceDriver || !datastoreAllowsMigration(currentDatastore, live)) {
    return []
  }

  return toArray(datastores).filter((datastore) => {
    const system =
      String(datastore?.TYPE) === '1' ||
      String(datastore?.TYPE).toUpperCase() === 'SYSTEM_DS'

    return (
      system &&
      getTransferDriver(datastore) === sourceDriver &&
      datastoreAllowsMigration(datastore, live)
    )
  })
}

export const validateStorageMigration = ({
  vm,
  currentDatastore,
  targetDatastore,
  targetHostId,
  live,
}) => {
  const location = getLastVmHistory(vm)
  if (!vm?.ID || !targetHostId || !targetDatastore?.ID) {
    return 'Choose a destination host and storage pool.'
  }
  if (!currentDatastore) {
    return 'The current storage pool could not be resolved. Migration is blocked.'
  }
  if (String(location?.DS_ID) === String(targetDatastore.ID)) {
    return 'Choose a destination storage pool different from the current pool.'
  }
  if (
    !getTransferDriver(currentDatastore) ||
    getTransferDriver(currentDatastore) !== getTransferDriver(targetDatastore)
  ) {
    return 'Cross-driver storage migration is unsupported. Source and destination must use the same transfer driver.'
  }
  if (!datastoreAllowsMigration(currentDatastore, live)) {
    return live
      ? 'The source storage pool is not qualified for live migration.'
      : 'The source storage pool is not qualified for migration.'
  }
  if (!datastoreAllowsMigration(targetDatastore, live)) {
    return live
      ? 'The destination storage pool is not qualified for live migration.'
      : 'The destination storage pool is not qualified for migration.'
  }
  if (live && String(vm.STATE) !== '3') {
    return 'Live storage migration requires a running virtual machine.'
  }
  if (live && String(location?.HID) !== String(targetHostId)) {
    return 'Live storage migration cannot change host and storage pool in one operation.'
  }

  return ''
}

export const migrationReadbackMatches = (vm, hostId, datastoreId) => {
  const location = getLastVmHistory(vm)

  return (
    String(location?.HID) === String(hostId) &&
    String(location?.DS_ID) === String(datastoreId)
  )
}
