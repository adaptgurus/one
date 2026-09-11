/* SPDX-License-Identifier: Apache-2.0 */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const YAML = require('yaml')

const fireedge = resolve(__dirname, '../..')
const read = (path) => readFileSync(resolve(fireedge, path), 'utf8')

test('cloud instantiate view exposes published GPU profiles, not native host inventory picker', () => {
  const view = YAML.parse(
    read('etc/sunstone/views/cloud/vm-template-tab.yaml')
  )
  assert.equal(view.dialogs.instantiate_dialog.gpu, true)
  assert.notEqual(view.dialogs.instantiate_dialog.pci, true)
})

test('GPU tab is conditional on provider-published template profiles', () => {
  const source = read(
    'src/modules/resources/VmTemplate/Forms/InstantiateForm/Steps/ExtraConfiguration/gpu/index.js'
  )
  assert.match(source, /getPublishedGpuProfiles/)
  assert.match(source, /isVisible/)
  assert.doesNotMatch(source, /HostAPI/)
  assert.doesNotMatch(source, /SHORT_ADDRESS/)
})

test('instantiate path resolves browser choice against authoritative template and appends native PCI vectors', () => {
  const source = read('src/modules/containers/VmTemplates/Instantiate.js')
  assert.match(source, /resolvePublishedGpuRequest/)
  assert.match(source, /apiTemplateData\?\.TEMPLATE/)
  assert.match(source, /filteredTemplate\.PCI = \[\.\.\.existingPci, \.\.\.gpuRequest\.pci\]/)
  assert.match(source, /delete filteredTemplate\.LAYERSENTRY_GPU_PROFILES/)
  assert.match(source, /PUBLISHED_TEMPLATE_PROFILE/)
})
