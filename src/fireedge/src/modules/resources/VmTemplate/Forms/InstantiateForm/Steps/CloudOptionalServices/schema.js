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
import { boolean, number } from 'yup'

import { INPUT_TYPES } from '@ConstantsModule'
import {
  getObjectSchemaFromFields,
  getPublishedGpuProfiles,
} from '@UtilsModule'
import {
  FIELDS as GPU_FIELDS,
  SCHEMA as GPU_SCHEMA,
} from '@modules/resources/VmTemplate/Forms/InstantiateForm/Steps/ExtraConfiguration/gpu/schema'

const visibleWhen = (value) => (value ? INPUT_TYPES.TEXT : INPUT_TYPES.HIDDEN)

const BACKUP_ENABLED = {
  name: 'backupEnabled',
  label: 'Enable backup protection',
  tooltip:
    'Requests managed backup protection. The protection service remains authoritative for activation and effective policy.',
  type: INPUT_TYPES.SWITCH,
  validation: boolean().default(false),
  grid: { md: 12 },
}

const RESTORE_POINTS = {
  name: 'restorePoints',
  label: 'Restore points to keep',
  dependOf: BACKUP_ENABLED.name,
  type: visibleWhen,
  htmlType: 'number',
  validation: number().integer().min(1).max(90).default(7),
  fieldProps: { inputProps: { min: 1, max: 90 } },
  grid: { md: 6 },
}

const DR_ENABLED = {
  name: 'drEnabled',
  label: 'Enable DR replication request',
  tooltip:
    'Requests a recovery copy at the provider DR site. It does not claim replication is active until the DR backend accepts it.',
  type: INPUT_TYPES.SWITCH,
  validation: boolean().default(false),
  grid: { md: 12 },
}

const PROTECTION_FIELDS = [BACKUP_ENABLED, RESTORE_POINTS, DR_ENABLED]

/**
 * @param {object} vmTemplate - Source VM template
 * @returns {object[]} Simplified optional-service sections
 */
export const SECTIONS = (vmTemplate = {}) => {
  const profiles = getPublishedGpuProfiles(vmTemplate?.TEMPLATE)

  return [
    {
      id: 'protection',
      legend: 'Backup and disaster recovery',
      fields: PROTECTION_FIELDS,
    },
    profiles.length > 0 && {
      id: 'gpu',
      legend: 'GPU acceleration',
      fields: GPU_FIELDS(profiles),
    },
  ].filter(Boolean)
}

/**
 * @param {object} vmTemplate - Source VM template
 * @returns {object} Yup schema for customer optional services
 */
export const SCHEMA = (vmTemplate = {}) =>
  getObjectSchemaFromFields(PROTECTION_FIELDS).concat(
    GPU_SCHEMA(getPublishedGpuProfiles(vmTemplate?.TEMPLATE))
  )
