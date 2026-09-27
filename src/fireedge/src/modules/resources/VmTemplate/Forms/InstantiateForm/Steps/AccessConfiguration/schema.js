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
import { boolean, object, string } from 'yup'

import { INPUT_TYPES } from '@ConstantsModule'
import {
  getLayerSentryGuestOsFamily,
  getValidationFromFields,
} from '@UtilsModule'

const USERNAME = (vmTemplate) => {
  const windows = getLayerSentryGuestOsFamily(vmTemplate) === 'WINDOWS'
  const account = windows ? 'Administrator' : 'root'

  return {
    name: 'username',
    label: windows ? 'Windows account' : 'Linux account',
    tooltip: `LayerSentry provisions only the ${account} account for this image.`,
    type: INPUT_TYPES.HIDDEN,
    validation: string()
      .oneOf([account])
      .required()
      .default(() => account),
    grid: { md: 6 },
  }
}

const PASSWORD = (vmTemplate) => {
  const windows = getLayerSentryGuestOsFamily(vmTemplate) === 'WINDOWS'

  return {
    name: 'password',
    label: windows
      ? 'Administrator password (optional)'
      : 'Root password (optional)',
    tooltip:
      'Used only for first-boot contextualization and never rendered in Review.',
    type: INPUT_TYPES.PASSWORD,
    validation: string()
      .max(128)
      .notRequired()
      .default(() => ''),
    grid: { md: 6 },
  }
}

const CONFIRM_PASSWORD = (vmTemplate) => ({
  name: 'confirmPassword',
  label:
    getLayerSentryGuestOsFamily(vmTemplate) === 'WINDOWS'
      ? 'Confirm Administrator password'
      : 'Confirm root password',
  type: INPUT_TYPES.PASSWORD,
  validation: string()
    .max(128)
    .notRequired()
    .test('passwords-match', 'Passwords must match', function (value) {
      return (this.parent.password ?? '') === (value ?? '')
    })
    .default(() => ''),
  grid: { md: 6 },
})

const USE_ACCOUNT_KEY = {
  name: 'useAccountKey',
  label: 'Use my account SSH public key',
  tooltip: 'Inject $USER[SSH_PUBLIC_KEY] when the VM boots.',
  type: INPUT_TYPES.SWITCH,
  validation: boolean().default(() => true),
  grid: { md: 6 },
}

const SSH_PUBLIC_KEY = {
  name: 'sshPublicKey',
  label: 'Additional SSH public key (optional)',
  tooltip: 'Paste an ssh-ed25519, ecdsa, or ssh-rsa public key.',
  type: INPUT_TYPES.TEXT,
  multiline: true,
  fieldProps: { rows: 4 },
  validation: string()
    .trim()
    .max(16384)
    .notRequired()
    .default(() => ''),
  grid: { md: 12 },
}

/**
 * Build fields for the guest family published by the source template.
 *
 * @param {object} vmTemplate - Authoritative source VM template
 * @returns {object[]} Guest access fields
 */
export const FIELDS = (vmTemplate = {}) => {
  const windows = getLayerSentryGuestOsFamily(vmTemplate) === 'WINDOWS'

  return [
    USERNAME(vmTemplate),
    PASSWORD(vmTemplate),
    CONFIRM_PASSWORD(vmTemplate),
    ...(!windows ? [USE_ACCOUNT_KEY, SSH_PUBLIC_KEY] : []),
  ]
}

/**
 * Build validation for the OS-specific access form.
 *
 * @param {object} vmTemplate - Authoritative source VM template
 * @returns {object} Yup object schema
 */
export const SCHEMA = (vmTemplate = {}) =>
  object(getValidationFromFields(FIELDS(vmTemplate)))
