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
 * Infer the customer guest OS family. Provider metadata wins over name-based
 * fallback so production templates can make this deterministic.
 *
 * @param {object} sourceTemplate - OpenNebula VM template resource or body
 * @returns {'LINUX'|'WINDOWS'} Guest OS family
 */
export const getLayerSentryGuestOsFamily = (sourceTemplate = {}) => {
  const body = sourceTemplate?.TEMPLATE ?? sourceTemplate
  const explicit = normalized(body?.LAYERSENTRY_OS_FAMILY).toUpperCase()
  if (explicit === 'WINDOWS' || explicit === 'LINUX') return explicit

  const identity = [
    sourceTemplate?.NAME,
    body?.NAME,
    body?.DESCRIPTION,
    body?.OS?.TYPE,
  ]
    .map(normalized)
    .join(' ')
    .toLowerCase()

  return /windows|winserver|win(?:dows)?\s*server/.test(identity)
    ? 'WINDOWS'
    : 'LINUX'
}

/**
 * Resolve provider-hidden data-disk defaults. OpenNebula formats volatile
 * disks only when FS is supplied; Windows disks remain unformatted so the
 * Windows guest can initialize them as NTFS instead of requiring host ntfs
 * tooling. Linux defaults to ext4, which is part of the supported host FS set
 * in the qualified lab and is the documented OpenNebula example.
 *
 * @param {object} sourceTemplate - OpenNebula VM template resource or body
 * @returns {object} Hidden disk policy
 */
export const getLayerSentryDataDiskPolicy = (sourceTemplate = {}) => {
  const body = sourceTemplate?.TEMPLATE ?? sourceTemplate
  const osFamily = getLayerSentryGuestOsFamily(sourceTemplate)
  const requestedFormat = normalized(
    body?.LAYERSENTRY_DATA_DISK_FORMAT
  ).toLowerCase()
  const format = ['raw', 'qcow2'].includes(requestedFormat)
    ? requestedFormat
    : 'qcow2'
  const requestedFs = normalized(body?.LAYERSENTRY_DATA_DISK_FS).toLowerCase()
  const fs = osFamily === 'WINDOWS' ? undefined : requestedFs || 'ext4'
  const devPrefix =
    normalized(body?.LAYERSENTRY_DATA_DISK_DEV_PREFIX).toLowerCase() || 'vd'

  return { osFamily, format, fs, devPrefix }
}

const networkTemplate = (network = {}) => network?.TEMPLATE ?? {}

const networkMode = (network = {}) => {
  const mode = normalized(
    networkTemplate(network)?.LAYERSENTRY_NETWORK_MODE
  ).toUpperCase()

  return ['SRIOV', 'PCI', 'PCI_PASSTHROUGH', 'ACCELERATED'].includes(mode)
    ? 'ACCELERATED'
    : 'STANDARD'
}

const networkQosSupported = (network = {}) => {
  const template = networkTemplate(network)
  const explicit = normalized(template?.LAYERSENTRY_NETWORK_QOS).toUpperCase()
  if (explicit === 'YES') return true
  if (explicit === 'NO') return false
  if (networkMode(network) === 'ACCELERATED') return false

  // OpenNebula supports symmetric per-NIC QoS for the qualified bridge/fw,
  // 802.1Q and VXLAN paths. OVS outbound QoS uses a different mechanism.
  return normalized(template?.VN_MAD).toLowerCase() !== 'ovswitch'
}

/**
 * Applies the intentionally small LayerSentry cloud resource request to a
 * native OpenNebula VM template. Provider details stay server controlled.
 *
 * @param {object} template - Filtered native OpenNebula template
 * @param {object} resources - LayerSentry cloud resource fields
 * @param {object} capabilities - Provider capabilities
 * @param {boolean} capabilities.storageIopsSupported - IOPS policy gate
 * @param {object} capabilities.sourceTemplate - Selected source template
 * @param {object} capabilities.network - Authoritative selected VNet
 * @returns {object} Native OpenNebula template
 */
export const applyLayerSentryCloudResources = (
  template = {},
  resources = {},
  { storageIopsSupported = false, sourceTemplate = {}, network = {} } = {}
) => {
  const result = { ...template }

  if (resources.dataDiskEnabled) {
    const sizeGb = positiveInteger(
      resources.dataDiskSizeGb,
      1,
      16384,
      'Data disk size'
    )
    const diskPolicy = getLayerSentryDataDiskPolicy(sourceTemplate)
    const dataDisk = {
      TYPE: 'fs',
      SIZE: String(sizeGb * 1024),
      FORMAT: diskPolicy.format,
      DEV_PREFIX: diskPolicy.devPrefix,
    }

    if (diskPolicy.fs) dataDisk.FS = diskPolicy.fs

    if (storageIopsSupported && resources.storageIopsEnabled) {
      dataDisk.TOTAL_IOPS_SEC = String(
        positiveInteger(resources.storageIops, 100, 1000000, 'IOPS limit')
      )
    }

    result.DISK = [...asArray(template.DISK), dataDisk]
  }

  const requestedNetworkId = normalized(resources.networkId)
  if (!/^\d+$/.test(requestedNetworkId)) {
    throw new Error('Select a valid LayerSentry network')
  }

  const authoritativeNetworkId = normalized(network?.ID)
  if (authoritativeNetworkId && requestedNetworkId !== authoritativeNetworkId) {
    throw new Error('Selected network no longer matches the provider network')
  }

  const staticIp =
    resources.ipAssignment === 'STATIC' ? normalized(resources.staticIp) : ''
  if (staticIp && !isIpv4(staticIp)) {
    throw new Error('Enter a valid static IPv4 address')
  }

  if (networkMode(network) === 'ACCELERATED') {
    if (resources.networkQosEnabled) {
      throw new Error(
        'Custom bandwidth QoS is not available on this accelerated network'
      )
    }

    const networkName = normalized(network?.NAME)
    if (!networkName)
      throw new Error('Accelerated network has no provider name')

    const metadata = networkTemplate(network)
    const pci = {
      TYPE: 'NIC',
      NETWORK: networkName,
    }
    if (staticIp) pci.IP = staticIp
    ;['CLASS', 'VENDOR', 'DEVICE', 'PROFILE'].forEach((key) => {
      const value = normalized(metadata?.[`LAYERSENTRY_PCI_${key}`])
      if (value) pci[key] = value
    })

    result.PCI = [...asArray(template.PCI), pci]
    delete result.NIC
  } else {
    const nic = {
      NETWORK_ID: requestedNetworkId,
      MODEL:
        normalized(networkTemplate(network)?.LAYERSENTRY_NIC_MODEL) || 'virtio',
    }
    if (staticIp) nic.IP = staticIp

    if (resources.networkQosEnabled) {
      if (!networkQosSupported(network)) {
        throw new Error('Custom bandwidth QoS is not supported by this network')
      }

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

    result.NIC = [nic]
  }

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
