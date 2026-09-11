/* SPDX-License-Identifier: Apache-2.0 */
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
  const tabs = text('src/modules/resources/VmTemplate/Forms/InstantiateForm/Steps/ExtraConfiguration/index.js')
  const schema = text('src/modules/resources/VmTemplate/Forms/InstantiateForm/Steps/ExtraConfiguration/schema.js')
  assert.match(tabs, /import Gpu/)
  assert.match(tabs, /import Protection/)
  assert.match(tabs, /Storage,\s*Gpu,\s*Protection,\s*Networking/)
  assert.match(tabs, /sectionsAvailable\.includes\(id\)/)
  assert.match(schema, /GPU_SCHEMA/)
  assert.match(schema, /PROTECTION_SCHEMA/)
  assert.match(schema, /\.concat\(PROTECTION_SCHEMA\)/)
})

test('native instantiate payload only overlays protection metadata for touched cloud requests', () => {
  const source = text('src/modules/containers/VmTemplates/Instantiate.js')
  assert.match(source, /view === 'cloud'/)
  assert.match(source, /modifiedFields\?\.extra\?\.LayerSentryProtection/)
  assert.match(source, /normalizeProtectionRequest/)
  assert.match(source, /filteredTemplate\.LAYERSENTRY_PROTECTION = protection/)
  assert.doesNotMatch(source, /REQUEST_STATE\s*=\s*['"]ACTIVE/)
})

test('form copy explicitly says protection is request-only', () => {
  const source = text('src/modules/resources/VmTemplate/Forms/InstantiateForm/Steps/ExtraConfiguration/protection/index.js')
  assert.match(source, /do not\s+activate DR/i)
  assert.match(source, /effective policy/i)
})
