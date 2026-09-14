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

const aliases = {
  a: 'array',
  arr: 'array',
  array: 'array',
  b: 'boolean',
  bool: 'boolean',
  boolean: 'boolean',
  null: 'null',
  n: 'number',
  num: 'number',
  number: 'number',
  o: 'object',
  obj: 'object',
  object: 'object',
  s: 'string',
  str: 'string',
  string: 'string',
  undefined: 'undefined',
}

/**
 * Return the normalized runtime type used by the XML-RPC caster.
 *
 * @param {*} value - Value to inspect.
 * @returns {string} Normalized type name.
 */
const type = (value) => {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'

  return typeof value
}

/**
 * Convert a value to a boolean using the legacy upcast semantics FireEdge uses.
 *
 * @param {*} value - Value to convert.
 * @returns {boolean} Converted boolean.
 */
const toBoolean = (value) => {
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'string' && value === 'false') return false

  return Boolean(value)
}

/**
 * Convert a value to a number using the legacy upcast semantics FireEdge uses.
 *
 * @param {*} value - Value to convert.
 * @returns {number} Converted number, or zero when conversion is not numeric.
 */
const toNumber = (value) => {
  if (Array.isArray(value)) return toNumber(value.join(''))
  if (typeof value === 'undefined') return 0

  if (typeof value === 'string') {
    const normalized =
      value === 'false' || value === 'true' ? toBoolean(value) : value
    const number = Number(normalized)

    return Number.isNaN(number) ? 0 : number
  }

  return Number(value)
}

/**
 * Convert a value to an array using the legacy upcast semantics FireEdge uses.
 *
 * @param {*} value - Value to convert.
 * @returns {Array} Converted array.
 */
const toArray = (value) => {
  if (value === null || typeof value === 'undefined') return []

  if (typeof value === 'string') {
    if (value === 'false' || value === 'true') return [toBoolean(value)]

    return value.split('')
  }

  return [value]
}

/**
 * Convert a value to an object using the legacy upcast semantics FireEdge uses.
 *
 * @param {*} value - Value to convert.
 * @returns {object} Converted object wrapper.
 */
const toObject = (value) => {
  if (typeof value === 'string' && (value === 'false' || value === 'true')) {
    return Object(toBoolean(value))
  }

  return Object(value)
}

/**
 * Convert a value to the requested type.
 *
 * @param {*} value - Value to convert.
 * @param {string} requestedType - Target type or supported alias.
 * @returns {*} Converted value.
 * @throws {TypeError} When the target type is not a string.
 */
const to = (value, requestedType) => {
  if (typeof requestedType !== 'string') {
    throw new TypeError('Invalid argument: type is expected to be a string')
  }

  const target = aliases[requestedType] || requestedType

  if (type(value) === target) return value

  switch (target) {
    case 'array':
      return toArray(value)
    case 'boolean':
      return toBoolean(value)
    case 'function':
      return () => value
    case 'null':
      return null
    case 'number':
      return toNumber(value)
    case 'object':
      return toObject(value)
    case 'string':
      if (Array.isArray(value)) return value.join('')
      if (value === null || typeof value === 'undefined') return ''

      return String(value)
    case 'undefined':
      return undefined
    default:
      return value
  }
}

module.exports = { type, to }
