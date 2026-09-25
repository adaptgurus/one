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
/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param-description, jsdoc/require-param-type, jsdoc/require-returns */

import { parseIpv4Cidr } from '../../../modules/resources/VirtualNetwork/Forms/CreateForm/cidr'

export const NETWORK_ENVIRONMENTS = Object.freeze([
  ['prod', 'Production'],
  ['uat', 'UAT'],
  ['stage', 'Stage'],
  ['dev', 'Development'],
])

export const NETWORK_TIERS = Object.freeze([
  ['web', 'Web'],
  ['app', 'Application'],
  ['db', 'Database'],
  ['shared', 'Shared services'],
])

export const NETWORK_IP_MODES = Object.freeze([
  ['STATIC', 'Static addresses'],
  ['DHCP', 'DHCPv4'],
])

export const NETWORK_POLICIES = Object.freeze([
  ['ISOLATED', 'Block cross-environment communication'],
  ['TIERED', 'Allow only Web → App → Database'],
  ['CUSTOM', 'Selected firewall groups'],
])

/**
 *
 */
export const defaultNetworkDraft = () => ({
  name: 'dev_web_network',
  environment: 'dev',
  tier: 'web',
  cidr: '10.20.0.0/24',
  gateway: '10.20.0.1',
  dns: '',
  firstIp: '10.20.0.10',
  size: '100',
  ipMode: 'STATIC',
  policy: 'ISOLATED',
  securityGroups: '',
  vlanId: '',
  advanced: false,
  driver: 'fw',
  bridge: '',
  uplink: '',
  mtu: '',
  filterMacSpoofing: true,
  filterIpSpoofing: true,
})

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

const ipv4ToInt = (value) =>
  String(value)
    .split('.')
    .reduce((total, octet) => ((total << 8) | Number(octet)) >>> 0, 0)

const isIpv4InCidr = (value, cidr, allowBoundary = false) => {
  if (!isIpv4(value) || !cidr) return false
  const address = ipv4ToInt(value)
  const network = ipv4ToInt(cidr.networkAddress)
  const hostCount = 2 ** (32 - cidr.prefixLength)
  const broadcast = network + hostCount - 1

  return allowBoundary
    ? address >= network && address <= broadcast
    : address > network && address < broadcast
}

/**
 * @param value
 */
export const normalizeSecurityGroups = (value) =>
  String(value ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .filter((id, index, values) => values.indexOf(id) === index)

/**
 * @param draft
 */
export const validateNetworkDraft = (draft) => {
  const errors = {}
  const cidr = parseIpv4Cidr(draft.cidr)
  const size = Number(draft.size)
  const vlanId = draft.vlanId === '' ? undefined : Number(draft.vlanId)
  const mtu = draft.mtu === '' ? undefined : Number(draft.mtu)
  const securityGroups = normalizeSecurityGroups(draft.securityGroups)
  const firstIp = isIpv4(draft.firstIp) ? ipv4ToInt(draft.firstIp) : undefined
  const rangeEnd = firstIp === undefined ? undefined : firstIp + size - 1
  const network = cidr ? ipv4ToInt(cidr.networkAddress) : undefined
  const broadcast = cidr
    ? network + 2 ** (32 - cidr.prefixLength) - 1
    : undefined
  const effectiveDriver = draft.advanced
    ? draft.driver
    : vlanId === undefined
    ? 'fw'
    : '802.1Q'

  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{1,126}$/.test(draft.name ?? '')) {
    errors.name = 'Use 2-127 letters, numbers, dots, dashes or underscores.'
  }
  if (!cidr) errors.cidr = 'Enter a valid IPv4 CIDR.'
  if (!isIpv4(draft.gateway)) errors.gateway = 'Enter a valid IPv4 gateway.'
  else if (cidr && !isIpv4InCidr(draft.gateway, cidr)) {
    errors.gateway = 'Gateway must be a usable address inside this CIDR.'
  }
  if (!isIpv4(draft.firstIp))
    errors.firstIp = 'Enter a valid first IPv4 address.'
  else if (cidr && !isIpv4InCidr(draft.firstIp, cidr)) {
    errors.firstIp = 'First address must be usable inside this CIDR.'
  }
  if (!Number.isInteger(size) || size < 1 || size > 65536) {
    errors.size = 'Address count must be between 1 and 65536.'
  } else if (
    cidr &&
    firstIp !== undefined &&
    (rangeEnd >= broadcast || firstIp <= network)
  ) {
    errors.size = 'The address range must fit inside the usable CIDR addresses.'
  }
  if (
    vlanId !== undefined &&
    (!Number.isInteger(vlanId) || vlanId < 1 || vlanId > 4094)
  ) {
    errors.vlanId = 'VLAN ID must be between 1 and 4094.'
  }
  if (
    mtu !== undefined &&
    (!Number.isInteger(mtu) || mtu < 576 || mtu > 9216)
  ) {
    errors.mtu = 'MTU must be between 576 and 9216.'
  }
  if (securityGroups.some((id) => !/^\d+$/.test(id))) {
    errors.securityGroups =
      'Firewall group IDs must be comma-separated numbers.'
  }
  if (securityGroups.length === 0) {
    errors.securityGroups =
      'Select the LayerSentry-managed firewall group that enforces this policy.'
  }
  const dnsServers = String(draft.dns ?? '')
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
  if (dnsServers.some((address) => !isIpv4(address))) {
    errors.dns = 'DNS servers must be valid IPv4 addresses.'
  }
  if (
    ['802.1Q', 'vxlan', 'ovswitch_vxlan'].includes(effectiveDriver) &&
    !String(draft.uplink ?? '').trim()
  ) {
    errors.uplink = 'This network driver requires a physical uplink device.'
  }
  if (effectiveDriver === '802.1Q' && vlanId === undefined) {
    errors.vlanId = '802.1Q networks require a VLAN ID.'
  }

  return errors
}

/**
 * @param draft
 */
export const compileNetworkTemplate = (draft) => {
  const cidr = parseIpv4Cidr(draft.cidr)
  if (!cidr) throw new Error('Invalid IPv4 CIDR')

  const securityGroups = normalizeSecurityGroups(draft.securityGroups)
  const effectiveDriver = draft.advanced
    ? draft.driver
    : draft.vlanId === ''
    ? 'fw'
    : '802.1Q'
  const template = {
    NAME: draft.name.trim(),
    DESCRIPTION: `${draft.environment}/${draft.tier} workload segment`,
    LAYERSENTRY_ENVIRONMENT: draft.environment.toUpperCase(),
    LAYERSENTRY_TIER: draft.tier.toUpperCase(),
    LAYERSENTRY_IP_MODE: draft.ipMode,
    LAYERSENTRY_ISOLATION_POLICY: draft.policy,
    NETWORK_ADDRESS: cidr.networkAddress,
    NETWORK_MASK: cidr.networkMask,
    GATEWAY: draft.gateway.trim(),
    METHOD: draft.ipMode === 'DHCP' ? 'dhcp' : 'static',
    VN_MAD: effectiveDriver,
    FILTER_MAC_SPOOFING: draft.filterMacSpoofing ? 'YES' : 'NO',
    FILTER_IP_SPOOFING: draft.filterIpSpoofing ? 'YES' : 'NO',
    AR: {
      TYPE: 'IP4',
      IP: draft.firstIp.trim(),
      SIZE: Number(draft.size),
    },
  }

  if (draft.dns.trim()) {
    template.DNS = draft.dns
      .trim()
      .split(/[\s,]+/)
      .join(' ')
  }
  if (securityGroups.length) template.SECURITY_GROUPS = securityGroups.join(',')
  if (draft.vlanId !== '') template.VLAN_ID = String(Number(draft.vlanId))
  if (draft.bridge.trim()) template.BRIDGE = draft.bridge.trim()
  if (draft.uplink.trim()) template.PHYDEV = draft.uplink.trim()
  if (draft.advanced && draft.mtu !== '') {
    template.MTU = String(Number(draft.mtu))
  }

  return template
}

/**
 * @param network
 * @param expected
 */
export const networkReadbackMatches = (network, expected) => {
  const template = network?.TEMPLATE ?? {}
  const range = Array.isArray(network?.AR_POOL?.AR)
    ? network.AR_POOL.AR[0]
    : network?.AR_POOL?.AR

  const sameIfRequested = (key) =>
    expected[key] === undefined ||
    String(template[key] ?? network?.[key]) === String(expected[key])
  const observedGroups = normalizeSecurityGroups(
    template.SECURITY_GROUPS
  ).sort()
  const expectedGroups = normalizeSecurityGroups(
    expected.SECURITY_GROUPS
  ).sort()

  return (
    String(network?.NAME) === String(expected.NAME) &&
    String(template.NETWORK_ADDRESS) === String(expected.NETWORK_ADDRESS) &&
    String(template.NETWORK_MASK) === String(expected.NETWORK_MASK) &&
    String(template.LAYERSENTRY_ENVIRONMENT) ===
      String(expected.LAYERSENTRY_ENVIRONMENT) &&
    String(template.LAYERSENTRY_TIER) === String(expected.LAYERSENTRY_TIER) &&
    String(template.LAYERSENTRY_IP_MODE) ===
      String(expected.LAYERSENTRY_IP_MODE) &&
    String(template.LAYERSENTRY_ISOLATION_POLICY) ===
      String(expected.LAYERSENTRY_ISOLATION_POLICY) &&
    String(template.GATEWAY) === String(expected.GATEWAY) &&
    String(template.METHOD) === String(expected.METHOD) &&
    expectedGroups.every((group) => observedGroups.includes(group)) &&
    sameIfRequested('VLAN_ID') &&
    sameIfRequested('VN_MAD') &&
    sameIfRequested('BRIDGE') &&
    sameIfRequested('PHYDEV') &&
    sameIfRequested('MTU') &&
    sameIfRequested('FILTER_MAC_SPOOFING') &&
    sameIfRequested('FILTER_IP_SPOOFING') &&
    String(range?.IP) === String(expected.AR.IP) &&
    Number(range?.SIZE) === Number(expected.AR.SIZE)
  )
}
