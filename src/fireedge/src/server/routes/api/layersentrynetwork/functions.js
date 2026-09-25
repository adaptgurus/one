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
const { XMLBuilder } = require('fast-xml-parser')
const { defaults, httpCodes } = require('server/utils/constants')
const { httpResponse } = require('server/utils/server')
const { Actions: vnActions } = require('server/utils/constants/commands/vn')
const {
  Actions: vnTemplateActions,
} = require('server/utils/constants/commands/vntemplate')
const {
  Actions: securityGroupActions,
} = require('server/utils/constants/commands/secgroup')

const { defaultEmptyFunction } = defaults
const { ok, badRequest, conflict, internalServerError, unauthorized } =
  httpCodes
const { VN_INFO, VN_POOL_INFO, VN_UPDATE } = vnActions
const { VNTEMPLATE_INFO, VNTEMPLATE_INSTANTIATE } = vnTemplateActions
const { SECGROUP_INFO } = securityGroupActions

const environments = new Set(['PROD', 'UAT', 'DEV', 'STAGE', 'CUSTOM'])
const tiers = new Set(['WEB', 'APP', 'DB', 'MANAGEMENT', 'BACKUP', 'CUSTOM'])
const isolationPolicies = new Set([
  'ISOLATED',
  'SAME_APPLICATION',
  'SAME_ENVIRONMENT',
  'CUSTOM',
])
const normalized = (value) => String(value ?? '').trim()
const toArray = (value) =>
  value === undefined || value === null ? [] : [].concat(value)

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

const inside = (value, cidr, label) => {
  const address = ipv4ToNumber(value)
  if (address <= cidr.network || address >= cidr.broadcast) {
    throw new Error(`${label} must be a usable address inside the CIDR`)
  }

  return address
}

const allowedValues = (value) =>
  normalized(value)
    .toUpperCase()
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

const scopedSecurityRules = (template = {}) => {
  const rules = toArray(template.RULE).filter(Boolean)

  return (
    rules.length > 0 &&
    rules.every((rule) => {
      const direction = normalized(rule?.RULE_TYPE).toUpperCase()
      const protocol = normalized(rule?.PROTOCOL).toUpperCase()
      if (!['INBOUND', 'OUTBOUND'].includes(direction)) return false
      if (!['ALL', 'TCP', 'UDP', 'ICMP', 'IPSEC'].includes(protocol)) {
        return false
      }
      if (/^\d+$/.test(normalized(rule?.NETWORK_ID))) return true
      try {
        const size = Number(rule?.SIZE)
        ipv4ToNumber(rule?.IP)

        return Number.isInteger(size) && size >= 1 && size <= 65536
      } catch {
        return false
      }
    })
  )
}

const buildOverlay = (params, blueprint, securityGroup) => {
  const body = blueprint?.TEMPLATE ?? {}
  const security = securityGroup?.TEMPLATE ?? {}
  if (
    normalized(body.LAYERSENTRY_APPROVED).toUpperCase() !== 'YES' ||
    !normalized(body.VN_MAD)
  ) {
    throw new Error('Select an approved network blueprint')
  }

  const name = normalized(params.name)
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(name)) {
    throw new Error('Network name must use letters, numbers, dot, dash or underscore')
  }
  const environment = normalized(params.environment).toUpperCase()
  const tier = normalized(params.tier).toUpperCase()
  const isolation = normalized(params.isolationPolicy).toUpperCase()
  if (!environments.has(environment)) throw new Error('Select an environment')
  if (!tiers.has(tier)) throw new Error('Select a network tier')
  if (!isolationPolicies.has(isolation)) {
    throw new Error('Select an isolation policy')
  }
  const blueprintEnvironments = allowedValues(body.LAYERSENTRY_ENVIRONMENTS)
  if (
    !blueprintEnvironments.includes('ANY') &&
    !blueprintEnvironments.includes(environment)
  ) {
    throw new Error('Network blueprint is not approved for this environment')
  }
  const securityEnvironments = allowedValues(
    security.LAYERSENTRY_ENVIRONMENTS
  )
  if (
    Number(securityGroup?.ID) === 0 ||
    normalized(security.LAYERSENTRY_APPROVED).toUpperCase() !== 'YES' ||
    normalized(security.LAYERSENTRY_ISOLATION_POLICY).toUpperCase() !==
      isolation ||
    (!securityEnvironments.includes('ANY') &&
      !securityEnvironments.includes(environment)) ||
    !scopedSecurityRules(security)
  ) {
    throw new Error(
      'Firewall Rules are not approved for this environment and communication policy'
    )
  }

  const cidr = parseCidr(params.cidr)
  const gateway = normalized(params.gateway)
  if (gateway) inside(gateway, cidr, 'Gateway')
  const rangeStart = normalized(params.rangeStart)
  const start = inside(rangeStart, cidr, 'IP range start')
  const rangeEnd = normalized(params.rangeEnd)
  const end = inside(rangeEnd, cidr, 'IP range end')
  if (end < start) throw new Error('IP range end must not precede its start')
  const size = end - start + 1
  if (size > 65536) throw new Error('IP range is too large')
  const dns = normalized(params.dns)
  if (dns) dns.split(/[ ,]+/).filter(Boolean).forEach(ipv4ToNumber)

  return {
    name,
    driver: normalized(body.VN_MAD),
    template: {
      DESCRIPTION: normalized(params.description).slice(0, 1024),
      LAYERSENTRY_ENVIRONMENT: environment,
      LAYERSENTRY_TIER: tier,
      LAYERSENTRY_ISOLATION_POLICY: isolation,
      NETWORK_ADDRESS: cidr.networkAddress,
      NETWORK_MASK: cidr.networkMask,
      ...(gateway && { GATEWAY: gateway }),
      ...(dns && { DNS: dns }),
      SECURITY_GROUPS: String(securityGroup.ID),
      AR: { TYPE: 'IP4', IP: rangeStart, SIZE: String(size) },
    },
  }
}

const toXml = (template) =>
  new XMLBuilder({ format: false }).build({ ROOT: template })

const invoke = (oneClient, action, parameters) =>
  new Promise((resolve, reject) => {
    oneClient({
      action,
      parameters,
      callback: (error, data) => (error ? reject(error) : resolve(data)),
    })
  })

const verify = (network, id, request) => {
  const ranges = toArray(network?.AR_POOL?.AR)
  const range = ranges.find(
    ({ IP, SIZE }) =>
      IP === request.template.AR.IP &&
      String(SIZE) === request.template.AR.SIZE
  )

  return (
    String(network?.ID) === String(id) &&
    network?.NAME === request.name &&
    network?.VN_MAD === request.driver &&
    network?.TEMPLATE?.LAYERSENTRY_ENVIRONMENT ===
      request.template.LAYERSENTRY_ENVIRONMENT &&
    String(network?.TEMPLATE?.SECURITY_GROUPS) ===
      request.template.SECURITY_GROUPS &&
    Boolean(range)
  )
}

const create = async (
  res = {},
  next = defaultEmptyFunction,
  params = {},
  userData = {},
  xmlrpc = defaultEmptyFunction
) => {
  const { user, password } = userData
  if (!user || !password) {
    res.locals.httpCode = httpResponse(unauthorized, '')
    next()

    return
  }

  let allocatedId
  try {
    const blueprintId = Number(params.blueprintId)
    const securityGroupId = Number(params.securityGroupId)
    if (!Number.isInteger(blueprintId) || blueprintId < 0) {
      throw new Error('Select an approved network blueprint')
    }
    if (!Number.isInteger(securityGroupId) || securityGroupId <= 0) {
      throw new Error('Select approved Firewall Rules')
    }

    const oneClient = xmlrpc(user, password)
    const [blueprintResponse, securityResponse, poolResponse] =
      await Promise.all([
        invoke(oneClient, VNTEMPLATE_INFO, [blueprintId, false]),
        invoke(oneClient, SECGROUP_INFO, [securityGroupId, false]),
        invoke(oneClient, VN_POOL_INFO, [-2, -1, -1]),
      ])
    const blueprint = blueprintResponse?.VNTEMPLATE
    const securityGroup = securityResponse?.SECURITY_GROUP
    if (!blueprint || !securityGroup) {
      throw new Error('Selected provider policy is no longer available')
    }
    const request = buildOverlay(params, blueprint, securityGroup)
    const existing = toArray(poolResponse?.VNET_POOL?.VNET).find(
      ({ NAME }) => normalized(NAME).toLowerCase() === request.name.toLowerCase()
    )
    if (existing) {
      res.locals.httpCode = httpResponse(
        conflict,
        { resourceId: existing.ID },
        'A network with this name already exists'
      )
      next()

      return
    }

    allocatedId = await invoke(oneClient, VNTEMPLATE_INSTANTIATE, [
      blueprintId,
      request.name,
      toXml(request.template),
    ])
    let networkResponse = await invoke(oneClient, VN_INFO, [
      Number(allocatedId),
      false,
    ])
    let network = networkResponse?.VNET
    const securityGroups = normalized(network?.TEMPLATE?.SECURITY_GROUPS)
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
    if (
      securityGroups.length !== 1 ||
      securityGroups[0] !== request.template.SECURITY_GROUPS
    ) {
      await invoke(oneClient, VN_UPDATE, [
        Number(allocatedId),
        toXml({
          ...(network?.TEMPLATE ?? {}),
          SECURITY_GROUPS: request.template.SECURITY_GROUPS,
        }),
        0,
      ])
      networkResponse = await invoke(oneClient, VN_INFO, [
        Number(allocatedId),
        false,
      ])
      network = networkResponse?.VNET
    }
    if (!verify(network, allocatedId, request)) {
      throw new Error('Authoritative network readback is incomplete')
    }

    res.locals.httpCode = httpResponse(ok, {
      id: Number(allocatedId),
      network,
    })
  } catch {
    res.locals.httpCode = allocatedId
      ? httpResponse(
          internalServerError,
          { resourceId: Number(allocatedId) },
          `Network #${allocatedId} exists but policy/readback reconciliation failed`
        )
      : httpResponse(
          badRequest,
          '',
          'The network request failed authoritative validation'
        )
  }
  next()
}

module.exports = { create }
