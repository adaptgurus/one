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

const REQUIRED_TUPLE_FIELDS = Object.freeze([
  'id',
  'blueprintId',
  'version',
  'topology',
  'exactApplicationVersion',
  'osFamily',
  'imageId',
  'imageDigest',
  'architecture',
  'sourceSha',
  'dependencyLock',
  'qualification',
  'executionBackend',
])

/**
 * Immutable promoted tuple registry.
 *
 * Keep this empty until a concrete tuple has completed the production
 * qualification contract. Never add floating "latest" or family-wide entries.
 */
const PROMOTED_TUPLES = Object.freeze([])

/**
 * Validate a promoted-tuple definition.
 *
 * @param {object} tuple - candidate immutable tuple
 * @returns {Array<string>} validation errors
 */
const validateTupleDefinition = (tuple = {}) => {
  const errors = []

  REQUIRED_TUPLE_FIELDS.forEach((field) => {
    if (!String(tuple[field] ?? '').trim()) {
      errors.push(`Missing required tuple field: ${field}`)
    }
  })

  if (tuple.architecture && tuple.architecture !== 'x86_64') {
    errors.push('V1 production tuples must use x86_64 architecture.')
  }

  if (tuple.qualification && tuple.qualification !== 'QUALIFIED') {
    errors.push('Promoted tuples must have qualification=QUALIFIED.')
  }

  if (
    tuple.imageDigest &&
    !/^(sha256:)?[a-f0-9]{64}$/i.test(tuple.imageDigest)
  ) {
    errors.push('imageDigest must be an immutable SHA-256 digest.')
  }

  return errors
}

/**
 * Resolve one exact promoted tuple.
 *
 * Edition is optional for families without editions. Every supplied field must
 * match exactly; there is no fallback to another OS, version or topology.
 *
 * @param {object} request - requested family/version/edition/topology
 * @returns {object|undefined} matching promoted tuple
 */
const findQualifiedTuple = (request = {}) => {
  const { blueprintId, version, edition = '', topology } = request

  return PROMOTED_TUPLES.find(
    (tuple) =>
      tuple.blueprintId === blueprintId &&
      tuple.version === version &&
      (tuple.edition || '') === edition &&
      tuple.topology === topology &&
      validateTupleDefinition(tuple).length === 0
  )
}

module.exports = {
  PROMOTED_TUPLES,
  REQUIRED_TUPLE_FIELDS,
  findQualifiedTuple,
  validateTupleDefinition,
}
