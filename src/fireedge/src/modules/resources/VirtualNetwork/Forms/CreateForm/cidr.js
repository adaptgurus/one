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

const parseIpv4 = (value) => {
  const parts = String(value ?? '').trim().split('.')
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

/**
 * Parse and normalize an IPv4 CIDR.
 *
 * @param {string} value - CIDR, for example 10.20.30.0/24
 * @returns {object|undefined} Native OpenNebula network context attributes
 */
export const parseIpv4Cidr = (value) => {
  const [address, prefix, ...extra] = String(value ?? '').trim().split('/')
  if (extra.length) return undefined

  const octets = parseIpv4(address)
  if (!octets || !/^\d{1,2}$/.test(prefix ?? '')) return undefined

  const prefixLength = Number(prefix)
  if (!Number.isInteger(prefixLength) || prefixLength < 0 || prefixLength > 32) {
    return undefined
  }

  const addressInt = ipv4ToInt(octets)
  const maskInt = maskFromPrefix(prefixLength)
  const networkInt = (addressInt & maskInt) >>> 0
  const networkAddress = intToIpv4(networkInt)
  const networkMask = intToIpv4(maskInt)

  return {
    cidr: `${networkAddress}/${prefixLength}`,
    networkAddress,
    networkMask,
    prefixLength,
  }
}

/**
 * Convert native OpenNebula NETWORK_ADDRESS/NETWORK_MASK values to CIDR.
 *
 * @param {string} networkAddress - IPv4 network address
 * @param {string} networkMask - Dotted-decimal IPv4 netmask
 * @returns {string|undefined} Normalized CIDR
 */
export const ipv4CidrFromNetwork = (networkAddress, networkMask) => {
  const addressOctets = parseIpv4(networkAddress)
  const maskOctets = parseIpv4(networkMask)
  if (!addressOctets || !maskOctets) return undefined

  const maskInt = ipv4ToInt(maskOctets)
  const bits = maskInt.toString(2).padStart(32, '0')
  if (!/^1*0*$/.test(bits)) return undefined

  const firstZero = bits.indexOf('0')
  const prefixLength = firstZero === -1 ? 32 : firstZero
  const addressInt = ipv4ToInt(addressOctets)
  const normalizedNetwork = intToIpv4((addressInt & maskInt) >>> 0)

  return `${normalizedNetwork}/${prefixLength}`
}
