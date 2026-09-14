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
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const YAML = require('yaml')

const root = resolve(__dirname, '../..')
const text = (path) => readFileSync(resolve(root, path), 'utf8')
const yaml = (path) => YAML.parse(text(path))

test('protection request tab is self-service only', () => {
  const cloud = yaml('etc/sunstone/views/cloud/vm-template-tab.yaml')
  const user = yaml('etc/sunstone/views/user/vm-template-tab.yaml')
  const admin = yaml('etc/sunstone/views/admin/vm-template-tab.yaml')
  assert.equal(cloud.dialogs.instantiate_dialog.protection, true)
  assert.notEqual(user.dialogs.instantiate_dialog.protection, true)
  assert.notEqual(admin.dialogs.instantiate_dialog.protection, true)
})

test('instantiate form includes GPU/protection tabs and filters both through native view config', () => {
  const tabs = text(
    'src/modules/resources/VmTemplate/Forms/InstantiateForm/Steps/ExtraConfiguration/index.js'
  )
  const schema = text(
    'src/modules/resources/VmTemplate/Forms/InstantiateForm/Steps/ExtraConfiguration/schema.js'
  )
  assert.match(tabs, /import Gpu/)
  assert.match(tabs, /import Protection/)
  assert.match(tabs, /Storage,\s*Gpu,\s*Protection,\s*Networking/)
  assert.match(tabs, /sectionsAvailable\.includes\(id\)/)
  assert.match(schema, /GPU_SCHEMA/)
  assert.match(schema, /PROTECTION_SCHEMA/)
  assert.match(schema, /\.concat\(PROTECTION_SCHEMA\)/)
})

test('cloud instantiate payload maps simplified protection request without claiming active DR', () => {
  const source = text('src/modules/containers/VmTemplates/Instantiate.js')
  assert.match(source, /view === 'cloud'/)
  assert.match(source, /rawTemplate\?\.services/)
  assert.match(source, /normalizeProtectionRequest/)
  assert.match(source, /services\.backupEnabled \|\| services\.drEnabled/)
  assert.match(source, /filteredTemplate\.LAYERSENTRY_PROTECTION = protection/)
  assert.match(source, /delete requestTemplate\.services/)
  assert.doesNotMatch(source, /REQUEST_STATE\s*=\s*['"]ACTIVE/)
})

test('cloud protection copy explicitly says backup and DR remain request-based', () => {
  const source = text(
    'src/modules/resources/VmTemplate/Forms/InstantiateForm/Steps/CloudOptionalServices/index.js'
  )
  assert.match(source, /Backup and DR are request-based/i)
  assert.match(source, /protection backend validates/i)
})
