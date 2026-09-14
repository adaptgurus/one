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
import { getValidationFromFields } from '@UtilsModule'

const USERNAME = {
  name: 'username',
  label: 'Guest username',
  tooltip: 'Linux account that receives the password and SSH key.',
  type: INPUT_TYPES.TEXT,
  validation: string()
    .trim()
    .matches(/^[a-z_][a-z0-9_-]{0,31}$/i, 'Enter a valid Linux username')
    .required()
    .default(() => 'root'),
  grid: { md: 6 },
}

const PASSWORD = {
  name: 'password',
  label: 'Guest password (optional)',
  tooltip: 'Stored in the VM context as PASSWORD_BASE64, never as plain text.',
  type: INPUT_TYPES.PASSWORD,
  validation: string()
    .max(128)
    .notRequired()
    .default(() => ''),
  grid: { md: 6 },
}

const CONFIRM_PASSWORD = {
  name: 'confirmPassword',
  label: 'Confirm guest password',
  type: INPUT_TYPES.PASSWORD,
  validation: string()
    .max(128)
    .notRequired()
    .test('passwords-match', 'Passwords must match', function (value) {
      return (this.parent.password ?? '') === (value ?? '')
    })
    .default(() => ''),
  grid: { md: 6 },
}

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

export const FIELDS = [
  USERNAME,
  PASSWORD,
  CONFIRM_PASSWORD,
  USE_ACCOUNT_KEY,
  SSH_PUBLIC_KEY,
]

export const SCHEMA = object(getValidationFromFields(FIELDS))
