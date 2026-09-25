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

const normalized = (value) => String(value ?? '').trim()
const environments = new Set(['PROD', 'UAT', 'DEV', 'STAGE', 'CUSTOM'])
const tiers = new Set(['WEB', 'APP', 'DB', 'MANAGEMENT', 'BACKUP', 'CUSTOM'])
const isolationPolicies = new Set([
  'ISOLATED',
  'SAME_APPLICATION',
  'SAME_ENVIRONMENT',
  'CUSTOM',
])

const ipv4ToNumber = (value) => {
  const parts = normalized(value).split('.')
  if (
    parts.length !== 4 ||
    parts.some(
      (part) =>
        !/^\d{1,3}$/.test(part) || Number(part) < 0 || Number(part) > 255
    )
  ) {
    throw new Error('Enter a valid IPv4 address')
  }

  return parts.reduce((result, part) => result * 256 + Number(part), 0) >>> 0
}

const numberToIpv4 = (value) =>
  [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join('.')

const parseCidr = (value) => {
  const [address, prefixText, ...extra] = normalized(value).split('/')
  const prefix = Number(prefixText)
  if (extra.length || !Number.isInteger(prefix) || prefix < 8 || prefix > 30) {
    throw new Error('CIDR prefix must be between /8 and /30')
  }

  const addressNumber = ipv4ToNumber(address)
  const mask = (0xffffffff << (32 - prefix)) >>> 0
  const network = (addressNumber & mask) >>> 0
  const broadcast = (network | (~mask >>> 0)) >>> 0

  return {
    network,
    broadcast,
    networkAddress: numberToIpv4(network),
    networkMask: numberToIpv4(mask),
  }
}

const assertInside = (value, cidr, label) => {
  const address = ipv4ToNumber(value)
  if (address <= cidr.network || address >= cidr.broadcast) {
    throw new Error(`${label} must be a usable address inside the CIDR`)
  }

  return address
}

/**
 * Provider network templates are the native owner for driver, bridge/uplink,
 * VLAN and spoofing policy. Only explicitly published templates enter the
 * LayerSentry simple workflow.
 *
 * @param {object} template - OpenNebula VNet template resource
 * @returns {boolean} Whether the template is approved for simple creation
 */
export const isLayerSentryNetworkBlueprint = (template = {}) => {
  const body = template?.TEMPLATE ?? {}

  return (
    normalized(body.LAYERSENTRY_APPROVED).toUpperCase() === 'YES' &&
    normalized(body.VN_MAD) !== ''
  )
}

/**
 * Match an approved native Security Group to the selected communication
 * policy. Rule semantics remain owned by OpenNebula and the published group.
 *
 * @param {object} securityGroup - OpenNebula Security Group resource
 * @param {string} isolationPolicy - Requested LayerSentry policy
 * @returns {boolean} Whether the native group is an approved exact match
 */
export const isLayerSentrySecurityGroupCompatible = (
  securityGroup = {},
  isolationPolicy = ''
) => {
  const body = securityGroup?.TEMPLATE ?? {}
  const policy = normalized(isolationPolicy).toUpperCase()

  return (
    isolationPolicies.has(policy) &&
    normalized(body.LAYERSENTRY_APPROVED).toUpperCase() === 'YES' &&
    normalized(body.LAYERSENTRY_ISOLATION_POLICY).toUpperCase() === policy
  )
}

/**
 * Build a bounded overlay for native OpenNebula VNet-template instantiation.
 * Provider implementation fields remain owned by the approved blueprint.
 *
 * @param {object} request - Customer-facing network request
 * @param {object} blueprint - Authoritative OpenNebula VNet template
 * @param {object[]} securityGroups - Security groups visible to the actor
 * @returns {object} Strict OpenNebula template overlay
 */
export const buildLayerSentryNetworkOverlay = (
  request = {},
  blueprint = {},
  securityGroups = []
) => {
  if (!isLayerSentryNetworkBlueprint(blueprint)) {
    throw new Error('Select an approved network blueprint')
  }

  const name = normalized(request.name)
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(name)) {
    throw new Error(
      'Network name must use letters, numbers, dot, dash or underscore'
    )
  }

  const environment = normalized(request.environment).toUpperCase()
  const tier = normalized(request.tier).toUpperCase()
  const isolation = normalized(request.isolationPolicy).toUpperCase()
  if (!environments.has(environment)) throw new Error('Select an environment')
  if (!tiers.has(tier)) throw new Error('Select a network tier')
  if (!isolationPolicies.has(isolation)) {
    throw new Error('Select an isolation policy')
  }

  const allowedEnvironments = normalized(
    blueprint?.TEMPLATE?.LAYERSENTRY_ENVIRONMENTS
  )
    .toUpperCase()
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  if (
    allowedEnvironments.length &&
    !allowedEnvironments.includes('ANY') &&
    !allowedEnvironments.includes(environment)
  ) {
    throw new Error('Network blueprint is not approved for this environment')
  }

  const securityGroupId = normalized(request.securityGroupId)
  const securityGroup = securityGroups.find(
    (candidate) =>
      normalized(candidate?.ID) === securityGroupId &&
      isLayerSentrySecurityGroupCompatible(candidate, isolation)
  )
  if (!/^\d+$/.test(securityGroupId) || !securityGroup) {
    throw new Error('Select an available firewall rule set')
  }

  const cidr = parseCidr(request.cidr)
  const gateway = normalized(request.gateway)
  if (gateway) assertInside(gateway, cidr, 'Gateway')

  const rangeStart = normalized(request.rangeStart)
  const rangeEnd = normalized(request.rangeEnd)
  const start = assertInside(rangeStart, cidr, 'IP range start')
  const end = assertInside(rangeEnd, cidr, 'IP range end')
  if (end < start) throw new Error('IP range end must not precede its start')

  const size = end - start + 1
  if (size > 65536) throw new Error('IP range is too large')

  const dns = normalized(request.dns)
  if (dns) dns.split(/[ ,]+/).filter(Boolean).forEach(ipv4ToNumber)

  return {
    name,
    template: {
      DESCRIPTION: normalized(request.description),
      LAYERSENTRY_ENVIRONMENT: environment,
      LAYERSENTRY_TIER: tier,
      LAYERSENTRY_ISOLATION_POLICY: isolation,
      NETWORK_ADDRESS: cidr.networkAddress,
      NETWORK_MASK: cidr.networkMask,
      ...(gateway && { GATEWAY: gateway }),
      ...(dns && { DNS: dns }),
      SECURITY_GROUPS: securityGroupId,
      AR: {
        TYPE: 'IP4',
        IP: rangeStart,
        SIZE: String(size),
      },
    },
  }
}
