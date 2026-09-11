/* LayerSentry self-service protection request. SPDX-License-Identifier: Apache-2.0 */
import { boolean, number, string } from 'yup'
import { INPUT_TYPES } from '@ConstantsModule'
import { getObjectSchemaFromFields } from '@UtilsModule'

const ROOT = 'LAYERSENTRY_PROTECTION'
const name = (field) => `${ROOT}.${field}`
const ENABLED = name('ENABLED')
const DC_MODE = name('DC_RETENTION_MODE')
const DR_ENABLED = name('DR_ENABLED')
const DR_MODE = name('DR_RETENTION_MODE')
const DR_IP_MODE = name('DR_IP_MODE')

const showWhen = (expected = true) => (value) =>
  value === expected || (expected === true && value === 'YES')
    ? INPUT_TYPES.TEXT
    : INPUT_TYPES.HIDDEN

const showSelectWhen = (expected = true) => (value) =>
  value === expected || (expected === true && value === 'YES')
    ? INPUT_TYPES.SELECT
    : INPUT_TYPES.HIDDEN

const countType = (enabled, mode) =>
  showWhen(true)(enabled) !== INPUT_TYPES.HIDDEN && mode === 'COUNT'
    ? INPUT_TYPES.TEXT
    : INPUT_TYPES.HIDDEN

const drCountType = (enabled, drEnabled, mode) =>
  showWhen(true)(enabled) !== INPUT_TYPES.HIDDEN &&
  showWhen(true)(drEnabled) !== INPUT_TYPES.HIDDEN &&
  mode === 'COUNT'
    ? INPUT_TYPES.TEXT
    : INPUT_TYPES.HIDDEN

const drTextType = (enabled, drEnabled) =>
  showWhen(true)(enabled) !== INPUT_TYPES.HIDDEN &&
  showWhen(true)(drEnabled) !== INPUT_TYPES.HIDDEN
    ? INPUT_TYPES.TEXT
    : INPUT_TYPES.HIDDEN

export const FIELDS = [
  {
    name: ENABLED,
    label: 'Request backup / DR protection',
    tooltip:
      'Stores requested protection settings with the VM. It does not activate replication or retention by itself.',
    type: INPUT_TYPES.SWITCH,
    validation: boolean().default(false),
    grid: { md: 12 },
  },
  {
    name: DC_MODE,
    label: 'Main site (DC) saved points',
    dependOf: [ENABLED],
    type: showSelectWhen(true),
    values: [
      { text: 'Keep a chosen number', value: 'COUNT' },
      { text: 'Keep all complete points', value: 'ALL' },
    ],
    validation: string().oneOf(['COUNT', 'ALL']).default('COUNT'),
  },
  {
    name: name('DC_RETENTION_POINTS'),
    label: 'How many complete points at DC?',
    dependOf: [ENABLED, DC_MODE],
    type: countType,
    htmlType: 'number',
    validation: number().integer().min(1).max(999).default(7),
    fieldProps: { inputProps: { min: 1, max: 999 } },
  },
  {
    name: name('COPY_INTERVAL_MINUTES'),
    label: 'Requested copy interval (minutes)',
    dependOf: [ENABLED],
    type: showWhen(true),
    htmlType: 'number',
    validation: number().integer().min(5).max(10080).default(60),
    fieldProps: { inputProps: { min: 5, max: 10080 } },
  },
  {
    name: DR_ENABLED,
    label: 'Keep a recovery copy at DR',
    dependOf: [ENABLED],
    type: (enabled) =>
      showWhen(true)(enabled) === INPUT_TYPES.HIDDEN
        ? INPUT_TYPES.HIDDEN
        : INPUT_TYPES.SWITCH,
    validation: boolean().default(false),
    grid: { md: 12 },
  },
  {
    name: DR_MODE,
    label: 'Recovery site (DR) saved points',
    dependOf: [ENABLED, DR_ENABLED],
    type: (enabled, drEnabled) =>
      drTextType(enabled, drEnabled) === INPUT_TYPES.HIDDEN
        ? INPUT_TYPES.HIDDEN
        : INPUT_TYPES.SELECT,
    values: [
      { text: 'Keep a chosen number', value: 'COUNT' },
      { text: 'Keep all complete points', value: 'ALL' },
    ],
    validation: string().oneOf(['COUNT', 'ALL']).default('COUNT'),
  },
  {
    name: name('DR_RETENTION_POINTS'),
    label: 'How many complete points at DR?',
    dependOf: [ENABLED, DR_ENABLED, DR_MODE],
    type: drCountType,
    htmlType: 'number',
    validation: number().integer().min(1).max(999).default(30),
    fieldProps: { inputProps: { min: 1, max: 999 } },
  },
  {
    name: name('DR_SITE'),
    label: 'Recovery site / location',
    dependOf: [ENABLED, DR_ENABLED],
    type: drTextType,
    validation: string().trim().max(128).default(''),
  },
  {
    name: name('DR_NETWORK'),
    label: 'Recovery network / VNet',
    tooltip: 'Use the published recovery network name or ID. The provider still validates the actual mapping.',
    dependOf: [ENABLED, DR_ENABLED],
    type: drTextType,
    validation: string().trim().max(128).default(''),
  },
  {
    name: name('DR_VLAN_ID'),
    label: 'Recovery VLAN ID (optional)',
    dependOf: [ENABLED, DR_ENABLED],
    type: drTextType,
    htmlType: 'number',
    validation: number().integer().min(1).max(4094).nullable().default(undefined),
    fieldProps: { inputProps: { min: 1, max: 4094 } },
  },
  {
    name: DR_IP_MODE,
    label: 'Recovery IP plan',
    dependOf: [ENABLED, DR_ENABLED],
    type: (enabled, drEnabled) =>
      drTextType(enabled, drEnabled) === INPUT_TYPES.HIDDEN
        ? INPUT_TYPES.HIDDEN
        : INPUT_TYPES.SELECT,
    values: [
      { text: 'Keep the current address', value: 'KEEP' },
      { text: 'Request a different address', value: 'CHANGE' },
    ],
    validation: string().oneOf(['KEEP', 'CHANGE']).default('KEEP'),
  },
  ...[
    ['DR_IPV4', 'Recovery IPv4 address (optional)', 64],
    ['DR_IPV6', 'Recovery IPv6 address (optional)', 128],
    ['DR_PREFIX_OR_MASK', 'Recovery subnet / prefix (optional)', 64],
    ['DR_GATEWAY', 'Recovery gateway (optional)', 128],
    ['DR_DNS', 'Recovery DNS servers (optional)', 512],
    ['DR_TEST_NETWORK', 'Isolated recovery-test network (optional)', 128],
  ].map(([field, label, max]) => ({
    name: name(field),
    label,
    dependOf: [ENABLED, DR_ENABLED],
    type: drTextType,
    validation: string().trim().max(max).default(''),
  })),
]

export const SCHEMA = getObjectSchemaFromFields(FIELDS)
