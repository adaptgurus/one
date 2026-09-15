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
import { INPUT_TYPES } from '@ConstantsModule'
import { array, string } from 'yup'
import { isIscsiMultipath, isLinstor } from '../../functions'

const hideUnless = (predicate) => (backend) =>
  !predicate(backend) && INPUT_TYPES.HIDDEN

const ISCSI_PORTALS = {
  name: 'LAYERSENTRY_ISCSI_PORTALS',
  label: 'iSCSI portals',
  tooltip:
    'Add at least two independent target portal addresses for DM-Multipath.',
  type: INPUT_TYPES.AUTOCOMPLETE,
  multiple: true,
  dependOf: '$general.STORAGE_BACKEND',
  htmlType: hideUnless(isIscsiMultipath),
  validation: array(string().trim())
    .default(() => [])
    .when('$general.STORAGE_BACKEND', {
      is: (backend) => isIscsiMultipath(backend),
      then: (schema) =>
        schema.min(2, 'At least two iSCSI portals are required').required(),
      otherwise: (schema) => schema.strip(),
    }),
  fieldProps: { freeSolo: true },
  grid: { xs: 12, md: 12 },
}

const ISCSI_TARGET = {
  name: 'LAYERSENTRY_ISCSI_TARGET_IQN',
  label: 'Target IQN / EUI / NAA',
  type: INPUT_TYPES.TEXT,
  dependOf: '$general.STORAGE_BACKEND',
  htmlType: hideUnless(isIscsiMultipath),
  validation: string()
    .trim()
    .when('$general.STORAGE_BACKEND', {
      is: (backend) => isIscsiMultipath(backend),
      then: (schema) => schema.required('Target identifier is required'),
      otherwise: (schema) => schema.strip(),
    }),
  grid: { xs: 12, md: 6 },
}

const ISCSI_WWID = {
  name: 'LAYERSENTRY_ISCSI_WWID',
  label: 'Multipath WWID',
  tooltip:
    'Use the stable WWID reported consistently by every selected KVM host.',
  type: INPUT_TYPES.TEXT,
  dependOf: '$general.STORAGE_BACKEND',
  htmlType: hideUnless(isIscsiMultipath),
  validation: string()
    .trim()
    .matches(/^(0x)?[A-Fa-f0-9]{16,128}$/, {
      message: 'Enter a valid hexadecimal WWID',
      excludeEmptyString: true,
    })
    .when('$general.STORAGE_BACKEND', {
      is: (backend) => isIscsiMultipath(backend),
      then: (schema) => schema.required('Multipath WWID is required'),
      otherwise: (schema) => schema.strip(),
    }),
  grid: { xs: 12, md: 6 },
}

const LINSTOR_RESOURCE_GROUP = {
  name: 'LINSTOR_RESOURCE_GROUP',
  label: 'LINSTOR resource group',
  tooltip:
    'Resource groups are the supported placement-policy object for current LINSTOR OpenNebula integration.',
  type: INPUT_TYPES.TEXT,
  dependOf: '$general.STORAGE_BACKEND',
  htmlType: hideUnless(isLinstor),
  validation: string()
    .trim()
    .matches(/^[A-Za-z0-9_.:-]{1,128}$/, {
      message: 'Use letters, numbers, dot, underscore, colon or hyphen',
      excludeEmptyString: true,
    })
    .when('$general.STORAGE_BACKEND', {
      is: (backend) => isLinstor(backend),
      then: (schema) => schema.required('LINSTOR resource group is required'),
      otherwise: (schema) => schema.strip(),
    }),
  grid: { xs: 12, md: 6 },
}

const LINSTOR_CONTROLLERS = {
  name: 'LINSTOR_CONTROLLERS',
  label: 'LINSTOR controllers',
  tooltip:
    'Optional controller endpoints (host:port). Leave empty when the controller runs locally on the front-end.',
  type: INPUT_TYPES.AUTOCOMPLETE,
  multiple: true,
  dependOf: '$general.STORAGE_BACKEND',
  htmlType: hideUnless(isLinstor),
  validation: array(string().trim())
    .default(() => undefined)
    .afterSubmit((value) => (value?.length ? value.join(',') : undefined)),
  fieldProps: { freeSolo: true },
  grid: { xs: 12, md: 6 },
}

export const LAYERSENTRY_STORAGE_FIELDS = [
  ISCSI_PORTALS,
  ISCSI_TARGET,
  ISCSI_WWID,
  LINSTOR_RESOURCE_GROUP,
  LINSTOR_CONTROLLERS,
]
