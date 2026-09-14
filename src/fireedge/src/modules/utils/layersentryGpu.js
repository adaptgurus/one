/* LayerSentry published GPU profiles. SPDX-License-Identifier: Apache-2.0 */

export const MAX_SELF_SERVICE_GPU_COUNT = 8

const GPU_PCI_CLASSES = new Set(['0300', '0302'])

const cleanText = (value, max = 128) => {
  if (value === undefined || value === null) return undefined
  const text = String(value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim()

  return text ? text.slice(0, max) : undefined
}

const cleanId = (value) => {
  const id = cleanText(value, 64)

  return id && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(id)
    ? id
    : undefined
}

const cleanHex = (value) => {
  const hex = cleanText(value, 4)?.toLowerCase()

  return hex && /^[0-9a-f]{4}$/.test(hex) ? hex : undefined
}

const toList = (value) =>
  value === undefined || value === null
    ? []
    : Array.isArray(value)
    ? value
    : [value]

const boundedCount = (value, fallback = 1) => {
  const count = Number(value)

  return Number.isInteger(count) &&
    count >= 1 &&
    count <= MAX_SELF_SERVICE_GPU_COUNT
    ? count
    : fallback
}

/**
 * Reads administrator-published GPU profiles from a VM template.
 *
 * Profiles deliberately cannot publish a physical PCI address. Customers only
 * select scheduler constraints that OpenNebula can place on an eligible Host.
 * Only display/3D PCI classes are accepted, preventing this portal metadata
 * from becoming a generic passthrough-device escape hatch.
 *
 * @param {object} template - OpenNebula VM template body
 * @returns {object[]} Sanitized customer-visible GPU profiles
 */
export const getPublishedGpuProfiles = (template = {}) => {
  const seen = new Set()

  return toList(template?.LAYERSENTRY_GPU_PROFILES).reduce(
    (profiles, rawProfile) => {
      if (!rawProfile || typeof rawProfile !== 'object' || Array.isArray(rawProfile)) {
        return profiles
      }

      const id = cleanId(rawProfile.ID)
      const pciClass = cleanHex(rawProfile.CLASS)
      if (!id || seen.has(id) || !GPU_PCI_CLASSES.has(pciClass)) {
        return profiles
      }

      const pci = { CLASS: pciClass }
      const vendor = cleanHex(rawProfile.VENDOR)
      const device = cleanHex(rawProfile.DEVICE)
      const vgpuProfile = cleanText(rawProfile.PROFILE, 128)

      if (vendor) pci.VENDOR = vendor
      if (device) pci.DEVICE = device
      if (vgpuProfile) pci.PROFILE = vgpuProfile

      const maxCount = boundedCount(rawProfile.MAX_COUNT)
      const label = cleanText(rawProfile.LABEL, 96) ?? id
      const description = cleanText(rawProfile.DESCRIPTION, 192)

      seen.add(id)
      profiles.push({ id, label, description, maxCount, pci })

      return profiles
    },
    []
  )
}

/**
 * Resolves a customer GPU request against the profiles published by the
 * selected VM template. The submitted browser value is never trusted to
 * provide PCI vendor/device/class/profile constraints.
 *
 * @param {object} raw - Customer request from the instantiate form
 * @param {object} template - Authoritative source VM template
 * @returns {object} Resolution with valid/requested flags and PCI vectors
 */
export const resolvePublishedGpuRequest = (raw, template = {}) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { valid: true, requested: false, pci: [] }
  }

  const profileId = cleanId(raw.PROFILE_ID)
  if (!profileId) return { valid: true, requested: false, pci: [] }

  const profile = getPublishedGpuProfiles(template).find(
    ({ id }) => id === profileId
  )
  if (!profile) {
    return {
      valid: false,
      requested: true,
      reason: 'PROFILE_NOT_PUBLISHED',
      pci: [],
    }
  }

  const count = Number(raw.COUNT ?? 1)
  if (
    !Number.isInteger(count) ||
    count < 1 ||
    count > profile.maxCount ||
    count > MAX_SELF_SERVICE_GPU_COUNT
  ) {
    return {
      valid: false,
      requested: true,
      reason: 'COUNT_OUT_OF_RANGE',
      pci: [],
    }
  }

  return {
    valid: true,
    requested: true,
    profileId,
    count,
    pci: Array.from({ length: count }, () => ({ ...profile.pci })),
  }
}
