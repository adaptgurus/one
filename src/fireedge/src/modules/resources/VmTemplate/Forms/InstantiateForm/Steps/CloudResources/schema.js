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
import { boolean, number, object, string } from 'yup'

import { INPUT_TYPES } from '@ConstantsModule'
import { getValidationFromFields } from '@UtilsModule'

const enabledType = (value) => (value ? INPUT_TYPES.TEXT : INPUT_TYPES.HIDDEN)
const enabledSwitch = (value) =>
  value ? INPUT_TYPES.SWITCH : INPUT_TYPES.HIDDEN

const DATA_DISK_ENABLED = {
  name: 'dataDiskEnabled',
  label: 'Add a data disk',
  tooltip:
    'Adds one customer data disk. LayerSentry selects safe device settings.',
  type: INPUT_TYPES.SWITCH,
  validation: boolean().default(false),
  grid: { md: 12 },
}

const DATA_DISK_SIZE = {
  name: 'dataDiskSizeGb',
  label: 'Data disk size (GB)',
  dependOf: DATA_DISK_ENABLED.name,
  type: enabledType,
  htmlType: 'number',
  validation: number().integer().min(1).max(16384).default(100),
  fieldProps: { inputProps: { min: 1, max: 16384 } },
  grid: { md: 6 },
}

/**
 * @param {object} vmTemplate - Source VM template
 * @returns {boolean} Whether provider allows per-VM IOPS control
 */
const storageIopsSupported = (vmTemplate = {}) =>
  String(vmTemplate?.TEMPLATE?.LAYERSENTRY_STORAGE_IOPS_QOS ?? '')
    .trim()
    .toUpperCase() === 'YES'

const STORAGE_IOPS_ENABLED = (vmTemplate) => ({
  name: 'storageIopsEnabled',
  label: 'Custom IOPS limit',
  tooltip:
    'Available only when the provider-published storage backend supports per-VM IOPS QoS.',
  dependOf: DATA_DISK_ENABLED.name,
  type: storageIopsSupported(vmTemplate) ? enabledSwitch : INPUT_TYPES.HIDDEN,
  validation: boolean().default(false),
  grid: { md: 6 },
})

const STORAGE_IOPS = (vmTemplate) => ({
  name: 'storageIops',
  label: 'Maximum IOPS',
  dependOf: 'storageIopsEnabled',
  type: storageIopsSupported(vmTemplate) ? enabledType : INPUT_TYPES.HIDDEN,
  htmlType: 'number',
  validation: number().integer().min(100).max(1000000).default(5000),
  fieldProps: { inputProps: { min: 100, max: 1000000 } },
  grid: { md: 6 },
})

const NETWORK_ID = (networks = []) => ({
  name: 'networkId',
  label: 'Network',
  tooltip: 'Choose the LayerSentry network for this VM.',
  type: INPUT_TYPES.SELECT,
  values: [
    { text: 'Select a network', value: '' },
    ...networks.map(({ ID, NAME }) => ({
      text: NAME,
      value: String(ID),
    })),
  ],
  validation: string().trim().required('Select a network'),
  grid: { md: 6 },
})

const IP_ASSIGNMENT = {
  name: 'ipAssignment',
  label: 'IP assignment',
  type: INPUT_TYPES.SELECT,
  values: [
    { text: 'Automatic', value: 'AUTO' },
    { text: 'Static IPv4', value: 'STATIC' },
  ],
  validation: string().oneOf(['AUTO', 'STATIC']).default('AUTO'),
  grid: { md: 6 },
}

const STATIC_IP = {
  name: 'staticIp',
  label: 'Static IPv4 address',
  dependOf: IP_ASSIGNMENT.name,
  type: (mode) => (mode === 'STATIC' ? INPUT_TYPES.TEXT : INPUT_TYPES.HIDDEN),
  validation: string()
    .trim()
    .max(15)
    .matches(
      /^(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}$/,
      { message: 'Enter a valid IPv4 address', excludeEmptyString: true }
    )
    .default(''),
  grid: { md: 6 },
}

const NETWORK_QOS_ENABLED = {
  name: 'networkQosEnabled',
  label: 'Custom network speed limit',
  tooltip: 'Off uses the provider network default.',
  type: INPUT_TYPES.SWITCH,
  validation: boolean().default(false),
  grid: { md: 6 },
}

const NETWORK_SPEED = {
  name: 'networkSpeedMbps',
  label: 'Maximum network speed (Mbps)',
  dependOf: NETWORK_QOS_ENABLED.name,
  type: enabledType,
  htmlType: 'number',
  validation: number().integer().min(1).max(100000).default(500),
  fieldProps: { inputProps: { min: 1, max: 100000 } },
  grid: { md: 6 },
}

/**
 * @param vmTemplate
 */
/**
 * @param {object} vmTemplate - Source VM template
 * @returns {object[]} Customer resource form sections
 */
export const SECTIONS = (vmTemplate = {}, networks = []) => [
  {
    id: 'data-disk',
    legend: 'Additional data disk',
    fields: [
      DATA_DISK_ENABLED,
      DATA_DISK_SIZE,
      STORAGE_IOPS_ENABLED(vmTemplate),
      STORAGE_IOPS(vmTemplate),
    ],
  },
  {
    id: 'network',
    legend: 'Network',
    fields: [
      NETWORK_ID(networks),
      IP_ASSIGNMENT,
      STATIC_IP,
      NETWORK_QOS_ENABLED,
      NETWORK_SPEED,
    ],
  },
]

/**
 * @param vmTemplate
 */
/**
 * @param {object} vmTemplate - Source VM template
 * @returns {object[]} Customer resource fields
 */
export const FIELDS = (vmTemplate = {}, networks = []) =>
  SECTIONS(vmTemplate, networks).flatMap(({ fields }) => fields)

/**
 * @param vmTemplate
 */
/**
 * @param {object} vmTemplate - Source VM template
 * @returns {object} Yup schema
 */
export const SCHEMA = (vmTemplate = {}) =>
  object(getValidationFromFields(FIELDS(vmTemplate)))
