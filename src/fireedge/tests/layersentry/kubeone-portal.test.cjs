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
  assert.match(routes, /kubeoneportal\.workers\.reconcile/)
  assert.match(routes, /kubeoneportal\.provision/)
  assert.match(routes, /kubeoneportal\.controlplane\.reconciliation/)
  assert.match(functions, /control-plane-reconciliation/)
  assert.match(functions, /\/provision/)
  assert.match(functions, /encodeURIComponent\(id\)/)
  assert.match(functions, /Invalid cluster or namespace identity/)
  assert.doesNotMatch(functions, /exec\(|spawn\(|shell/)
})

test('KubeOne manager exposes health, namespace, access and bounded registered-worker reconciliation', () => {
  const workspace = read('src/client/apps/layersentry/pages/KubernetesWorkspace.js')

  assert.match(workspace, /API ready/)
  assert.match(workspace, /Create namespace/)
  assert.match(workspace, /Download kubeconfig/)
  assert.match(workspace, /Create KubeOne cluster/)
  assert.match(workspace, /provider-approved control-plane hosts/)
  assert.match(workspace, /Join only workers already present/)
  assert.match(workspace, /useProvisionKubeOneClusterMutation/)
  assert.match(workspace, /useReconcileKubeOneControlPlaneMutation/)
  assert.match(workspace, /useReconcileKubeOneWorkersMutation/)
  assert.match(workspace, /self_service_lifecycle/)
  assert.match(workspace, /!workerPending/)
  assert.match(workspace, /controlPlaneHealthy/)
  assert.match(workspace, /no provider-qualified GPU or vGPU profile/)
})


test('LayerSentry Kubernetes workspace does not route lifecycle through OneKS', () => {
  const workspace = read('src/client/apps/layersentry/pages/KubernetesWorkspace.js')
  const kubeOneApi = read('src/modules/features/OneApi/kubeOnePortal.js')

  assert.match(workspace, /KubeOne-owned clusters/)
  assert.doesNotMatch(workspace, /OneKsAPI|ONEKS|oneks/i)
  assert.doesNotMatch(kubeOneApi, /OneKsAPI|\/oneks/)
})
