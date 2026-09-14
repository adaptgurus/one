/* SPDX-License-Identifier: Apache-2.0 */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const fireedgeRoot = path.join(__dirname, '../..')
const read = (...parts) =>
  fs.readFileSync(path.join(fireedgeRoot, ...parts), 'utf8')

test('public shell uses LayerSentry browser branding', () => {
  const app = read('src/server/routes/entrypoints/App.js')
  assert.match(app, /PRODUCT_TITLE = 'LayerSentry'/)
  assert.match(app, /<title>\$\{PRODUCT_TITLE\} \| Private Cloud<\/title>/)
  assert.match(app, /PRODUCT_FAVICON/)
  assert.doesNotMatch(app, /by OpenNebula<\/title>/)
})

test('default product logo falls back to LayerSentry', () => {
  const logo = read('src/modules/components/composed/OpenNebulaLogo/index.js')
  const icon = read('src/modules/components/primitives/Icons/LayerSentryIcon.js')
  assert.match(logo, /LayerSentryIcon/)
  assert.doesNotMatch(logo, /<OpenNebulaIcon/)
  assert.match(icon, /LAYER/)
  assert.match(icon, /SENTRY/)
  assert.match(icon, /aria-label="LayerSentry"/)
})

test('login presentation is LayerSentry branded', () => {
  const login = read('src/modules/containers/Login/Opennebula/Opennebula.js')
  const remote = read('src/modules/containers/Login/Remote/Remote.js')
  const translations = read('src/modules/constants/translates.js')
  for (const source of [login, remote]) {
    assert.match(source, /layersentry-brand-grid/)
    assert.match(source, /PRIVATE CLOUD PLATFORM/)
    assert.match(source, /Compute, Kubernetes and data services/)
    assert.doesNotMatch(source, /opennebula-brand-grid/)
  }
  assert.match(translations, /LogIn: 'Sign in to LayerSentry'/)
  assert.doesNotMatch(translations, /LogIn: 'Log in to your OpenNebula Account'/)
})

test('branding changes do not rename provider API identifiers', () => {
  const defaults = read('src/server/utils/constants/defaults.js')
  const xmlrpc = read('src/server/routes/entrypoints/Api/xmlrpc.js')
  assert.match(defaults, /defaultCommandVM: 'onevm'/)
  assert.match(defaults, /defaultOneKsServer:/)
  assert.match(xmlrpc, /server\/utils\/upcast/)
})
