/* LayerSentry requested protection metadata. SPDX-License-Identifier: Apache-2.0 */

const cleanText = (value, max = 256) => {
  if (value === undefined || value === null) return undefined
  const text = String(value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
  return text ? text.slice(0, max) : undefined
}

const yesNo = (value) => (value === true || value === 'YES' ? 'YES' : 'NO')
const boundedInteger = (value, min, max, fallback) => {
  const parsed = Number.parseInt(value, 10)

  return Number.isInteger(parsed) && parsed >= min && parsed <= max
    ? String(parsed)
    : String(fallback)
}
const keepMode = (value) => (value === 'ALL' ? 'ALL' : 'COUNT')
const ipMode = (value) => (value === 'CHANGE' ? 'CHANGE' : 'KEEP')

/**
 * Converts customer form values into non-authoritative protection intent.
 * The DR service must independently validate and activate this request.
 *
 * @param {object} raw - Raw protection form value
 * @returns {object|undefined} Sanitized OpenNebula vector value
 */
export const normalizeProtectionRequest = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined

  if (yesNo(raw.ENABLED) === 'NO') {
    return {
      ENABLED: 'NO',
      POLICY_VERSION: '1',
      REQUEST_STATE: 'NOT_REQUESTED',
      SOURCE: 'SELF_SERVICE_CREATE',
    }
  }

  const dcMode = keepMode(raw.DC_RETENTION_MODE)
  const drEnabled = yesNo(raw.DR_ENABLED)
  const request = {
    ENABLED: 'YES',
    POLICY_VERSION: '1',
    REQUEST_STATE: 'REQUESTED_NOT_ACTIVE',
    SOURCE: 'SELF_SERVICE_CREATE',
    DC_RETENTION_MODE: dcMode,
    COPY_INTERVAL_MINUTES: boundedInteger(
      raw.COPY_INTERVAL_MINUTES,
      5,
      10080,
      60
    ),
  }

  if (dcMode === 'COUNT') {
    request.DC_RETENTION_POINTS = boundedInteger(
      raw.DC_RETENTION_POINTS,
      1,
      999,
      7
    )
  }

  request.DR_ENABLED = drEnabled
  if (drEnabled === 'YES') {
    const drMode = keepMode(raw.DR_RETENTION_MODE)
    request.DR_RETENTION_MODE = drMode
    if (drMode === 'COUNT') {
      request.DR_RETENTION_POINTS = boundedInteger(
        raw.DR_RETENTION_POINTS,
        1,
        999,
        30
      )
    }

    request.DR_IP_MODE = ipMode(raw.DR_IP_MODE)
    const textFields = {
      DR_SITE: 128,
      DR_NETWORK: 128,
      DR_IPV4: 64,
      DR_IPV6: 128,
      DR_PREFIX_OR_MASK: 64,
      DR_GATEWAY: 128,
      DR_DNS: 512,
      DR_TEST_NETWORK: 128,
    }
    Object.entries(textFields).forEach(([key, max]) => {
      const value = cleanText(raw[key], max)
      if (value) request[key] = value
    })

    const vlan = Number.parseInt(raw.DR_VLAN_ID, 10)
    if (Number.isInteger(vlan) && vlan >= 1 && vlan <= 4094) {
      request.DR_VLAN_ID = String(vlan)
    }
  }

  return request
}
