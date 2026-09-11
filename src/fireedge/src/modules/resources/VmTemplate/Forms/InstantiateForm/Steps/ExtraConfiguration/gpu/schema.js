/* LayerSentry self-service GPU request. SPDX-License-Identifier: Apache-2.0 */
import { number, string } from 'yup'

import { INPUT_TYPES } from '@ConstantsModule'
import {
  getObjectSchemaFromFields,
  MAX_SELF_SERVICE_GPU_COUNT,
} from '@UtilsModule'

const ROOT = 'LAYERSENTRY_GPU_REQUEST'
const PROFILE_ID = `${ROOT}.PROFILE_ID`
const COUNT = `${ROOT}.COUNT`

/**
 * Builds fields from safe profiles published on the selected VM template.
 *
 * @param {object[]} profiles - Sanitized published profiles
 * @returns {object[]} Form fields
 */
export const FIELDS = (profiles = []) => {
  const profileIds = profiles.map(({ id }) => id)

  return [
    {
      name: PROFILE_ID,
      label: 'GPU profile',
      tooltip:
        'Only profiles published by the provider for this VM template can be selected.',
      type: INPUT_TYPES.SELECT,
      values: [
        { text: 'No GPU', value: '' },
        ...profiles.map(({ id, label, maxCount }) => ({
          text: maxCount > 1 ? `${label} (up to ${maxCount})` : label,
          value: id,
        })),
      ],
      validation: string()
        .trim()
        .oneOf(['', ...profileIds])
        .default(''),
    },
    {
      name: COUNT,
      label: 'GPU count',
      dependOf: PROFILE_ID,
      type: (profileId) =>
        profileId ? INPUT_TYPES.TEXT : INPUT_TYPES.HIDDEN,
      htmlType: 'number',
      validation: number()
        .integer()
        .min(1)
        .max(MAX_SELF_SERVICE_GPU_COUNT)
        .default(1)
        .when(PROFILE_ID, (profileId, schema) => {
          const profile = profiles.find(({ id }) => id === profileId)

          return profile ? schema.max(profile.maxCount) : schema
        }),
      fieldProps: {
        inputProps: { min: 1, max: MAX_SELF_SERVICE_GPU_COUNT },
      },
    },
  ]
}

export const SCHEMA = (profiles = []) =>
  getObjectSchemaFromFields(FIELDS(profiles))
