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

const { isIP } = require('net')

const fqdnPattern =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i

const forbiddenSecretKeys = new Set([
  'password',
  'proxypassword',
  'rootpassword',
  'privatekey',
  'secretkey',
  'token',
  'roottoken',
  'unsealkey',
  'recoverykey',
  'repositorypassword',
])

const nonEmpty = (value) => Boolean(String(value ?? '').trim())
const validFqdn = (value) => fqdnPattern.test(String(value ?? '').trim())

/**
 * Find raw secret-bearing fields recursively.
 *
 * Secret references and boolean "*Present" markers are allowed because they
 * carry no secret value.
 *
 * @param {*} value - desired-state value
 * @param {string} path - current field path
 * @param {Array<string>} found - discovered secret paths
 * @returns {Array<string>} secret-bearing paths
 */
const findRawSecretFields = (value, path = '', found = []) => {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      findRawSecretFields(item, `${path}[${index}]`, found)
    )

    return found
  }

  if (!value || typeof value !== 'object') return found

  Object.entries(value).forEach(([key, child]) => {
    const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase()
    const childPath = path ? `${path}.${key}` : key
    const isReference = /ref$/i.test(key)
    const isPresenceMarker = /present$/i.test(key)

    if (
      forbiddenSecretKeys.has(normalized) &&
      !isReference &&
      !isPresenceMarker &&
      nonEmpty(child)
    ) {
      found.push(childPath)
    }

    findRawSecretFields(child, childPath, found)
  })

  return found
}

/**
 * Validate a production-service desired state before infrastructure mutation.
 *
 * This is intentionally limited to authoritative request invariants that can
 * be checked without reserving infrastructure. Native resource availability,
 * DNS ownership, image compatibility, package availability and failure-domain
 * capacity remain later preflight gates.
 *
 * @param {object} desiredState - sanitized desired-state document
 * @returns {Array<object>} structured validation errors
 */
const validateDesiredState = (desiredState = {}) => {
  const errors = []
  const add = (code, message) => errors.push({ code, message })

  if (!desiredState || typeof desiredState !== 'object') {
    return [
      {
        code: 'DESIRED_STATE_REQUIRED',
        message: 'A sanitized desired state is required.',
      },
    ]
  }

  const rawSecretPaths = findRawSecretFields(desiredState)
  if (rawSecretPaths.length > 0) {
    add(
      'DESIRED_STATE_CONTAINS_SECRET',
      `Raw secret material is not allowed in desired state: ${rawSecretPaths.join(
        ', '
      )}`
    )
  }

  if (!nonEmpty(desiredState.serviceName)) {
    add('SERVICE_NAME_REQUIRED', 'Service name is required.')
  }

  if (!validFqdn(desiredState.domain)) {
    add('DOMAIN_INVALID', 'A valid DNS domain is required.')
  }

  if (!validFqdn(desiredState.serviceFqdn)) {
    add('SERVICE_FQDN_INVALID', 'A valid service FQDN is required.')
  }

  if (
    nonEmpty(desiredState.domain) &&
    validFqdn(desiredState.serviceFqdn) &&
    !String(desiredState.serviceFqdn)
      .toLowerCase()
      .endsWith(`.${String(desiredState.domain).toLowerCase()}`) &&
    String(desiredState.serviceFqdn).toLowerCase() !==
      String(desiredState.domain).toLowerCase()
  ) {
    add(
      'SERVICE_FQDN_DOMAIN_MISMATCH',
      'Service FQDN must belong to the selected DNS domain.'
    )
  }

  if (desiredState.ipMode === 'Static') {
    const addresses = String(desiredState.staticIps || '')
      .split(/[\n,]/)
      .map((value) => value.trim())
      .filter(Boolean)

    if (addresses.length === 0) {
      add('STATIC_IP_REQUIRED', 'Static addressing requires node IP addresses.')
    }

    const invalid = addresses.filter((address) => isIP(address) === 0)
    if (invalid.length > 0) {
      add(
        'STATIC_IP_INVALID',
        `Invalid IPv4/IPv6 address: ${invalid.join(', ')}`
      )
    }

    if (new Set(addresses).size !== addresses.length) {
      add('STATIC_IP_DUPLICATE', 'Static node IP addresses must be unique.')
    }
  }

  if (desiredState.portPolicy === 'Custom qualified port') {
    const port = Number(desiredState.customPort)
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      add(
        'SERVICE_PORT_INVALID',
        'Custom service port must be between 1 and 65535.'
      )
    }
  }

  if (desiredState.dnsRegistration === 'Manual DNS records') {
    if (!validFqdn(desiredState.dnsZone)) {
      add('DNS_ZONE_INVALID', 'Manual DNS requires a valid DNS zone.')
    }

    const ttl = Number(desiredState.dnsTtl)
    if (!Number.isInteger(ttl) || ttl < 30 || ttl > 86400) {
      add('DNS_TTL_INVALID', 'Manual DNS TTL must be 30-86400 seconds.')
    }

    if (desiredState.dnsTargetMode === 'Specify DNS target now') {
      if (!nonEmpty(desiredState.dnsTarget)) {
        add('DNS_TARGET_REQUIRED', 'Manual DNS target is required.')
      } else if (
        desiredState.dnsRecordType === 'A/AAAA' &&
        isIP(String(desiredState.dnsTarget).trim()) === 0
      ) {
        add('DNS_ADDRESS_INVALID', 'A/AAAA target must be an IP address.')
      } else if (
        desiredState.dnsRecordType === 'CNAME' &&
        !validFqdn(desiredState.dnsTarget)
      ) {
        add('DNS_CNAME_INVALID', 'CNAME target must be a valid FQDN.')
      }
    }
  }

  if (desiredState.drEnabled) {
    if (!nonEmpty(desiredState.drTarget)) {
      add('DR_TARGET_REQUIRED', 'DR requires a target site/profile.')
    }

    for (const [key, label] of [
      ['rpoMinutes', 'RPO'],
      ['rtoMinutes', 'RTO'],
    ]) {
      const value = Number(desiredState[key])
      if (!Number.isFinite(value) || value < 0) {
        add(`DR_${label}_INVALID`, `DR ${label} must be zero or positive.`)
      }
    }
  }

  if (desiredState.environment === 'Production' && desiredState.tls !== true) {
    add('TLS_REQUIRED', 'TLS is mandatory for a production service.')
  }

  if (
    desiredState.packageSourceMode === 'Local repository / mirror' &&
    !nonEmpty(desiredState.repoUrl)
  ) {
    add(
      'LOCAL_REPOSITORY_REQUIRED',
      'Local repository mode requires an internal repository reference.'
    )
  }

  if (
    desiredState.packageSourceMode === 'Air-gapped bundle' &&
    !nonEmpty(desiredState.bundleId)
  ) {
    add(
      'AIRGAP_BUNDLE_REQUIRED',
      'Air-gapped mode requires a qualified bundle ID.'
    )
  }

  if (
    desiredState.packageSourceMode === 'Managed repositories' &&
    desiredState.internetAccess === 'HTTP(S) Proxy'
  ) {
    try {
      const proxy = new URL(String(desiredState.proxyUrl || ''))
      if (!['http:', 'https:'].includes(proxy.protocol)) {
        throw new Error('unsupported protocol')
      }
    } catch {
      add(
        'PROXY_URL_INVALID',
        'Proxy mode requires a valid http:// or https:// proxy URL.'
      )
    }
  }

  if (desiredState.backupEnabled) {
    if (!nonEmpty(desiredState.backupRepositoryRef)) {
      add(
        'BACKUP_REPOSITORY_REQUIRED',
        'Application-aware backup requires a backup repository reference.'
      )
    }

    const retention = Number(desiredState.retentionDays)
    if (!Number.isInteger(retention) || retention < 1) {
      add(
        'BACKUP_RETENTION_INVALID',
        'Backup retention must be at least one day.'
      )
    }
  }

  if (Array.isArray(desiredState.storage)) {
    desiredState.storage.forEach((item = {}, index) => {
      const prefix = `storage[${index}]`
      if (item.dependency) {
        if (item.required !== false && !nonEmpty(item.attachmentRef)) {
          add(
            'STORAGE_DEPENDENCY_REQUIRED',
            `${prefix} requires a linked dependency reference.`
          )
        }

        return
      }

      if (!nonEmpty(item.storagePool)) {
        add(
          'STORAGE_POOL_REQUIRED',
          `${prefix} requires a storage pool/repository.`
        )
      }

      if (
        item.layout !== 'Repository-managed' &&
        (!Number.isFinite(Number(item.sizeGiB)) || Number(item.sizeGiB) <= 0)
      ) {
        add('STORAGE_SIZE_INVALID', `${prefix} size must be greater than zero.`)
      }

      if (
        ['Existing SAN / LUN', 'Existing mount'].includes(item.layout) &&
        !nonEmpty(item.attachmentRef)
      ) {
        add(
          'STORAGE_REFERENCE_REQUIRED',
          `${prefix} existing storage requires an attachment reference.`
        )
      }
    })
  }

  return errors
}

module.exports = {
  findRawSecretFields,
  validateDesiredState,
}
