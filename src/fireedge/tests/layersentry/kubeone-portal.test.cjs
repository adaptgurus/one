const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '../..')
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8')

test('KubeOne proxy preserves server-side identity and bounded typed routes', () => {
  const platform = read('src/server/routes/api/serviceblueprints/platform.js')
  const routes = read('src/server/routes/api/kubeoneportal/routes.js')
  const functions = read('src/server/routes/api/kubeoneportal/functions.js')

  assert.match(platform, /X-LayerSentry-Tenant/)
  assert.match(platform, /\[GATEWAY_TENANT_HEADER\]: actor\.uid/)
  assert.match(routes, /kubeoneportal\.namespace\.create/)
  assert.match(functions, /encodeURIComponent\(id\)/)
  assert.match(functions, /Invalid cluster or namespace identity/)
  assert.doesNotMatch(functions, /exec\(|spawn\(|shell/)
})

test('KubeOne manager exposes health, namespace and access without enabling unqualified workers', () => {
  const workspace = read('src/client/apps/layersentry/pages/KubernetesWorkspace.js')

  assert.match(workspace, /API ready/)
  assert.match(workspace, /Create namespace/)
  assert.match(workspace, /Download kubeconfig/)
  assert.match(workspace, /GPU and vGPU choices are limited/)
  assert.match(workspace, /<Button variant="contained" disabled>/)
  assert.match(workspace, /no provider-qualified GPU or vGPU profile/)
})
