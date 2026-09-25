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

export const SEGMENT_MODES = Object.freeze({
  VLAN: 'vlan',
  BRIDGE: 'bridge',
})

export const ENVIRONMENT_OPTIONS = Object.freeze([
  ['prod', 'Production'],
  ['uat', 'UAT'],
  ['dev', 'Development'],
  ['stage', 'Stage'],
  ['custom', 'Custom'],
])

export const TIER_OPTIONS = Object.freeze([
  ['web', 'Web'],
  ['app', 'Application'],
  ['db', 'Database'],
  ['management', 'Management'],
  ['backup', 'Backup'],
  ['custom', 'Custom'],
])

const parseIpv4 = (value) => {
  const parts = String(value ?? '')
    .trim()
    .split('.')

  if (parts.length !== 4) return undefined

  const octets = parts.map((part) => {
    if (!/^\d{1,3}$/.test(part)) return undefined
    const octet = Number(part)

    return Number.isInteger(octet) && octet >= 0 && octet <= 255
      ? octet
      : undefined
  })

  if (octets.some((octet) => octet === undefined)) return undefined

  return octets
}

const ipv4ToInt = (octets) =>
  (((octets[0] << 24) >>> 0) |
    (octets[1] << 16) |
    (octets[2] << 8) |
    octets[3]) >>>
  0

const intToIpv4 = (value) =>
  [
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255,
  ].join('.')

const maskFromPrefix = (prefixLength) =>
  prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0

export const parseIpv4Cidr = (value) => {
  const [address, prefix, ...extra] = String(value ?? '')
    .trim()
    .split('/')

  if (extra.length) return undefined

  const octets = parseIpv4(address)
  if (!octets || !/^\d{1,2}$/.test(prefix ?? '')) return undefined

  const prefixLength = Number(prefix)
  if (
    !Number.isInteger(prefixLength) ||
    prefixLength < 0 ||
    prefixLength > 32
  ) {
    return undefined
  }

  const addressInt = ipv4ToInt(octets)
  const maskInt = maskFromPrefix(prefixLength)
  const networkInt = (addressInt & maskInt) >>> 0
  const broadcastInt = (networkInt | (~maskInt >>> 0)) >>> 0

  return {
    cidr: `${intToIpv4(networkInt)}/${prefixLength}`,
    prefixLength,
    networkAddress: intToIpv4(networkInt),
    networkMask: intToIpv4(maskInt),
    networkInt,
    broadcastInt,
  }
}

const isIpv4 = (value) => Boolean(parseIpv4(value))

const getUsableBounds = (cidr) => {
  const parsed = parseIpv4Cidr(cidr)
  if (!parsed) return undefined

  if (parsed.prefixLength >= 31) {
    return [parsed.networkInt, parsed.broadcastInt]
  }

  return [parsed.networkInt + 1, parsed.broadcastInt - 1]
}

const ipv4InCidr = (value, cidr) => {
  const octets = parseIpv4(value)
  const parsed = parseIpv4Cidr(cidr)
  if (!octets || !parsed) return false

  const ip = ipv4ToInt(octets)

  return ip >= parsed.networkInt && ip <= parsed.broadcastInt
}

const rangeFitsCidr = (firstIp, size, cidr) => {
  const first = parseIpv4(firstIp)
  const bounds = getUsableBounds(cidr)
  const count = Number(size)

  if (
    !first ||
    !bounds ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 65536
  ) {
    return false
  }

  const start = ipv4ToInt(first)
  const end = start + count - 1

  return start >= bounds[0] && end <= bounds[1] && end <= 0xffffffff
}

const cidrsOverlap = (left, right) => {
  const a = parseIpv4Cidr(left)
  const b = parseIpv4Cidr(right)
  if (!a || !b) return false

  return a.networkInt <= b.broadcastInt && b.networkInt <= a.broadcastInt
}

const validateTaggedVlans = (value) => {
  const text = String(value ?? '').trim()
  if (!text) return true

  return text.split(',').every((entry) => {
    const [startRaw, endRaw, ...extra] = entry.trim().split('-')
    if (extra.length) return false

    const start = Number(startRaw)
    const end = endRaw === undefined ? start : Number(endRaw)

    return (
      Number.isInteger(start) &&
      Number.isInteger(end) &&
      start >= 1 &&
      end <= 4094 &&
      start <= end
    )
  })
}

const clean = (value) => String(value ?? '').trim()

export const createSegmentDraft = ({
  environment = 'prod',
  tier = 'web',
  index = 0,
} = {}) => ({
  key: `${environment}-${tier}-${index}`,
  name: environment === 'custom' ? '' : `${environment}_${tier}_network`,
  environment,
  tier,
  mode: SEGMENT_MODES.VLAN,
  parent: 'br0',
  vlanId: '',
  bridge: '',
  taggedVlans: '',
  cidr: '',
  gateway: '',
  dns: '',
  firstIp: '',
  rangeSize: '32',
})

export const createStandardSegmentSet = (environment = 'prod') =>
  ['web', 'app', 'db'].map((tier, index) =>
    createSegmentDraft({ environment, tier, index })
  )

export const validateWorkloadSegments = (segments = []) => {
  const rowErrors = segments.map(() => ({}))
  const batchErrors = []

  if (!segments.length) {
    batchErrors.push('Add at least one workload segment.')
    return { rowErrors, batchErrors, valid: false }
  }

  const names = new Map()
  const vlanKeys = new Map()

  segments.forEach((segment, index) => {
    const errors = rowErrors[index]
    const name = clean(segment.name)
    const cidr = clean(segment.cidr)
    const gateway = clean(segment.gateway)
    const dns = clean(segment.dns)
    const firstIp = clean(segment.firstIp)
    const mode = segment.mode

    if (!name) errors.name = 'Network name is required.'
    if (name) {
      const previous = names.get(name.toLowerCase())

      if (previous !== undefined) {
        errors.name = 'Network name must be unique in this batch.'
        rowErrors[previous].name = 'Network name must be unique in this batch.'
      } else {
        names.set(name.toLowerCase(), index)
      }
    }

    if (![SEGMENT_MODES.VLAN, SEGMENT_MODES.BRIDGE].includes(mode)) {
      errors.mode = 'Choose VLAN or Bridge mode.'
    }

    if (mode === SEGMENT_MODES.VLAN) {
      const parent = clean(segment.parent)
      const vlanId = Number(segment.vlanId)

      if (!parent) errors.parent = 'Parent bridge/device is required.'
      if (!Number.isInteger(vlanId) || vlanId < 1 || vlanId > 4094) {
        errors.vlanId = 'VLAN ID must be between 1 and 4094.'
      } else {
        const vlanKey = `${parent.toLowerCase()}:${vlanId}`
        const previous = vlanKeys.get(vlanKey)
        if (previous !== undefined) {
          errors.vlanId = 'VLAN ID must be unique on the same parent device.'
          rowErrors[previous].vlanId =
            'VLAN ID must be unique on the same parent device.'
        } else {
          vlanKeys.set(vlanKey, index)
        }
      }
    }

    if (
      mode === SEGMENT_MODES.BRIDGE &&
      !validateTaggedVlans(segment.taggedVlans)
    ) {
      errors.taggedVlans =
        'Use VLAN IDs/ranges from 1-4094, separated by commas.'
    }

    if (!parseIpv4Cidr(cidr)) {
      errors.cidr = 'Enter a valid IPv4 CIDR, for example 10.20.30.0/24.'
    }

    if (gateway && (!isIpv4(gateway) || !ipv4InCidr(gateway, cidr))) {
      errors.gateway = 'Gateway must be a valid address inside the CIDR.'
    }

    if (dns && !isIpv4(dns)) {
      errors.dns = 'DNS must be a valid IPv4 address.'
    }

    if (!firstIp || !rangeFitsCidr(firstIp, segment.rangeSize, cidr)) {
      errors.firstIp =
        'The first IP and range size must fit inside usable CIDR addresses.'
    }

    const count = Number(segment.rangeSize)
    if (!Number.isInteger(count) || count < 1 || count > 65536) {
      errors.rangeSize = 'IP count must be between 1 and 65536.'
    }
  })

  for (let left = 0; left < segments.length; left += 1) {
    for (let right = left + 1; right < segments.length; right += 1) {
      if (cidrsOverlap(segments[left].cidr, segments[right].cidr)) {
        rowErrors[left].cidr = 'CIDR overlaps another segment in this batch.'
        rowErrors[right].cidr = 'CIDR overlaps another segment in this batch.'
      }
    }
  }

  return {
    rowErrors,
    batchErrors,
    valid:
      batchErrors.length === 0 &&
      rowErrors.every((errors) => Object.keys(errors).length === 0),
  }
}

export const compileWorkloadSegment = (segment) => {
  const cidr = parseIpv4Cidr(segment.cidr)
  if (!cidr) throw new Error('Cannot compile an invalid CIDR.')

  const mode = segment.mode
  const template = {
    NAME: clean(segment.name),
    VN_MAD: mode === SEGMENT_MODES.VLAN ? '802.1Q' : 'bridge',
    NETWORK_ADDRESS: cidr.networkAddress,
    NETWORK_MASK: cidr.networkMask,
    ...(clean(segment.gateway) && { GATEWAY: clean(segment.gateway) }),
    ...(clean(segment.dns) && { DNS: clean(segment.dns) }),
    LAYERSENTRY_SEGMENT: 'YES',
    LAYERSENTRY_ENVIRONMENT: clean(segment.environment),
    LAYERSENTRY_TIER: clean(segment.tier),
    AR: {
      TYPE: 'IP4',
      IP: clean(segment.firstIp),
      SIZE: String(Number(segment.rangeSize)),
    },
  }

  if (mode === SEGMENT_MODES.VLAN) {
    template.PHYDEV = clean(segment.parent)
    template.VLAN_ID = String(Number(segment.vlanId))
  } else {
    if (clean(segment.bridge)) template.BRIDGE = clean(segment.bridge)
    if (clean(segment.taggedVlans)) {
      template.VLAN_TAGGED_ID = clean(segment.taggedVlans)
    }
  }

  return template
}
