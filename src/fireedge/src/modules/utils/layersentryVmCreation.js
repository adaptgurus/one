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

const asArray = (value) =>
  value === undefined || value === null ? [] : [].concat(value)

const normalized = (value) => String(value ?? '').trim()

const hasOneKsMarker = (template = {}) => {
  if (template.ONEKS || template.VROUTER === 'YES') return true

  const keys = [
    ...Object.keys(template.CONTEXT ?? {}),
    ...Object.keys(template.USER_INPUTS ?? {}),
  ]

  return keys.some((key) => String(key).startsWith('ONEAPP_ONEKS_'))
}

/**
 * Return IMAGE_ID references from a VM template.
 *
 * @param {object} vmTemplate - OpenNebula VM template pool item
 * @returns {string[]} Referenced image identifiers
 */
export const getTemplateImageIds = (vmTemplate = {}) =>
  asArray(vmTemplate?.TEMPLATE?.DISK)
    .map((disk) => normalized(disk?.IMAGE_ID))
    .filter(Boolean)

/**
 * LayerSentry customer VM templates must be KVM/x86_64, non-OneKS templates
 * backed exclusively by qcow2 OpenNebula images.
 *
 * @param {object} vmTemplate - OpenNebula VM template pool item
 * @param {object[]} images - OpenNebula image pool items
 * @returns {boolean} Whether the template belongs in customer VM creation
 */
export const isLayerSentryCustomerTemplate = (vmTemplate = {}, images = []) => {
  const template = vmTemplate?.TEMPLATE ?? {}
  if (hasOneKsMarker(template)) return false

  const hypervisor = normalized(template.HYPERVISOR).toLowerCase()
  if (hypervisor && hypervisor !== 'kvm') return false

  const architecture = normalized(template?.OS?.ARCH).toLowerCase()
  if (architecture && architecture !== 'x86_64') return false

  const imageIds = getTemplateImageIds(vmTemplate)
  if (imageIds.length === 0) return false

  const imageById = new Map(
    images.map((image) => [normalized(image?.ID), image]).filter(([id]) => id)
  )

  return imageIds.every((id) => {
    const image = imageById.get(id)
    const format = normalized(image?.FORMAT).toLowerCase()
    const type = normalized(image?.TYPE).toUpperCase()

    return format === 'qcow2' && (!type || type === 'OS' || type === '0')
  })
}

/**
 * Test whether an OpenNebula template identifier is present. ID 0 is valid.
 *
 * @param {unknown} templateId - Template identifier
 * @returns {boolean} Whether the identifier is usable
 */
export const hasTemplateId = (templateId) =>
  templateId !== undefined &&
  templateId !== null &&
  normalized(templateId) !== ''

const encodeBase64Utf8 = (value) => {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)))

  return btoa(binary)
}

const credentialKeys = [
  'PASSWORD',
  'PASSWORD_BASE64',
  'CRYPTED_PASSWORD',
  'CRYPTED_PASSWORD_BASE64',
]

/**
 * Apply LayerSentry's fixed guest-context defaults and requested credentials.
 * Plain-text passwords are never emitted into the OpenNebula template.
 *
 * @param {object} existingContext - Source template context
 * @param {object} access - LayerSentry access form values
 * @returns {object} Context ready for OpenNebula instantiation
 */
export const buildLayerSentryGuestContext = (
  existingContext = {},
  access = {}
) => {
  const context = {
    ...existingContext,
    NETWORK: 'YES',
    SET_HOSTNAME: '$NAME',
    GROW_FS: '/',
    USERNAME: normalized(access.username) || 'root',
  }

  credentialKeys.forEach((key) => delete context[key])

  const password = String(access.password ?? '')
  if (password) context.PASSWORD_BASE64 = encodeBase64Utf8(password)

  const sshKeys = []
  if (access.useAccountKey !== false) sshKeys.push('$USER[SSH_PUBLIC_KEY]')
  const customKey = String(access.sshPublicKey ?? '').trim()
  if (customKey) sshKeys.push(customKey)

  if (sshKeys.length) context.SSH_PUBLIC_KEY = [...new Set(sshKeys)].join('\n')
  else delete context.SSH_PUBLIC_KEY

  return context
}

/**
 * Apply fixed LayerSentry customer-VM defaults after native template filtering.
 *
 * @param {object} template - Filtered OpenNebula VM template body
 * @param {object} access - LayerSentry access form values
 * @returns {object} Template with customer-safe defaults
 */
export const applyLayerSentryVmDefaults = (template = {}, access = {}) => ({
  ...template,
  CONTEXT: buildLayerSentryGuestContext(template.CONTEXT, access),
  NIC_DEFAULT: {
    ...(template.NIC_DEFAULT ?? {}),
    MODEL: 'virtio',
  },
})

const positiveInteger = (value, minimum, maximum, name) => {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}`)
  }

  return parsed
}

const isIpv4 = (value) => {
  const parts = String(value ?? '')
    .trim()
    .split('.')

  return (
    parts.length === 4 &&
    parts.every(
      (part) =>
        /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255
    )
  )
}

/**
 * Applies the intentionally small LayerSentry cloud resource request to a
 * native OpenNebula VM template. Provider details stay server controlled.
 *
 * @param {object} template - Filtered native OpenNebula template
 * @param {object} resources - LayerSentry cloud resource fields
 * @param {object} capabilities - Provider capabilities
 * @param {boolean} capabilities.storageIopsSupported - IOPS policy gate
 * @returns {object} Native OpenNebula template
 */
export const applyLayerSentryCloudResources = (
  template = {},
  resources = {},
  { storageIopsSupported = false } = {}
) => {
  const result = { ...template }

  if (resources.dataDiskEnabled) {
    const sizeGb = positiveInteger(
      resources.dataDiskSizeGb,
      1,
      16384,
      'Data disk size'
    )
    const dataDisk = {
      TYPE: 'fs',
      SIZE: String(sizeGb * 1024),
      FORMAT: 'qcow2',
      FS: 'ext4',
    }

    if (storageIopsSupported && resources.storageIopsEnabled) {
      dataDisk.TOTAL_IOPS_SEC = String(
        positiveInteger(resources.storageIops, 100, 1000000, 'IOPS limit')
      )
    }

    result.DISK = [...asArray(template.DISK), dataDisk]
  }

  const networkId = normalized(resources.networkId)
  if (!/^\d+$/.test(networkId)) {
    throw new Error('Select a valid LayerSentry network')
  }

  const nic = {
    NETWORK_ID: networkId,
    MODEL: 'virtio',
  }

  if (resources.ipAssignment === 'STATIC') {
    const staticIp = normalized(resources.staticIp)
    if (!isIpv4(staticIp)) throw new Error('Enter a valid static IPv4 address')
    nic.IP = staticIp
  }

  if (resources.networkQosEnabled) {
    const speedMbps = positiveInteger(
      resources.networkSpeedMbps,
      1,
      100000,
      'Network speed'
    )
    const kilobytesPerSecond = Math.round(speedMbps * 125)
    nic.INBOUND_AVG_BW = String(kilobytesPerSecond)
    nic.OUTBOUND_AVG_BW = String(kilobytesPerSecond)
  }

  // The selected VNet remains authoritative for standard vs SR-IOV/PCI NIC
  // implementation. Customer requests never include host PCI addresses.
  result.NIC = [nic]

  return result
}

/**
 * Hide provider-managed OneKS/VRouter VMs from the customer clone workflow.
 *
 * @param {object} vm - OpenNebula VM pool item
 * @returns {boolean} Whether the VM can be presented as a customer clone source
 */
export const isLayerSentryCloneSource = (vm = {}) => {
  const template = vm?.USER_TEMPLATE ?? vm?.TEMPLATE ?? {}
  if (template?.ONEKS || template?.VROUTER === 'YES') return false
  if (vm?.VROUTER_ID !== undefined && vm?.VROUTER_ID !== null) return false

  const keys = Object.keys(template?.CONTEXT ?? {})

  return !keys.some((key) => String(key).startsWith('ONEAPP_ONEKS_'))
}

/**
 * OpenNebula 7.4 onevm save supports full VM cloning only from POWEROFF state.
 *
 * @param {object} vm - OpenNebula VM pool item
 * @returns {boolean} Whether full save-as-template clone is currently allowed
 */
export const canCloneVm = (vm = {}) => Number(vm?.STATE) === 8

/**
 * Parse a template identifier returned by the FireEdge onevm-save endpoint.
 *
 * @param {unknown} response - API response body
 * @returns {number|undefined} Parsed template identifier
 */
export const parseSavedTemplateId = (response) => {
  let text = ''
  if (response?.message !== undefined) text = String(response.message)
  else if (['string', 'number'].includes(typeof response))
    text = String(response)
  else {
    try {
      text = JSON.stringify(response ?? '')
    } catch {
      text = ''
    }
  }

  const explicit = text.match(/(?:template|id)[^0-9]*([0-9]+)/i)
  const fallback = text.match(/\b([0-9]+)\b/)
  const value = explicit?.[1] ?? fallback?.[1]

  return value === undefined ? undefined : Number(value)
}
