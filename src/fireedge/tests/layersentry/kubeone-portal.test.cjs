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
  assert.match(routes, /kubeoneportal\.capabilities/)
  assert.match(routes, /kubeoneportal\.diagnostics/)
  assert.match(routes, /kubeoneportal\.workers\.reconcile/)
  assert.match(routes, /kubeoneportal\.provision/)
  assert.match(routes, /kubeoneportal\.controlplane\.reconciliation/)
  assert.match(functions, /control-plane-reconciliation/)
  assert.match(functions, /\/v1\/kubernetes\/capabilities/)
  assert.match(functions, /\/diagnostics/)
  assert.match(functions, /\/provision/)
  assert.match(functions, /encodeURIComponent\(id\)/)
  assert.match(functions, /Invalid cluster or namespace identity/)
  assert.doesNotMatch(functions, /exec\(|spawn\(|shell/)
})

test('Kubernetes manager exposes fleet health, diagnostics and bounded registered-worker reconciliation', () => {
  const workspace = read(
    'src/client/apps/layersentry/pages/KubernetesWorkspace.js'
  )

  assert.match(workspace, /API ready/)
  assert.match(workspace, /Create namespace/)
  assert.match(workspace, /Download kubeconfig/)
  assert.match(workspace, /Create Kubernetes cluster/)
  assert.match(workspace, /provider-approved control-plane hosts/)
  assert.match(workspace, /Reconcile only workers already present/)
  assert.match(workspace, /Cluster fleet/)
  assert.match(workspace, /Health diagnostics/)
  assert.match(workspace, /Remediation:/)
  assert.match(workspace, /multi_cluster/)
  assert.match(workspace, /destructive_lifecycle/)
  assert.match(workspace, /useProvisionKubeOneClusterMutation/)
  assert.match(workspace, /useReconcileKubeOneControlPlaneMutation/)
  assert.match(workspace, /useReconcileKubeOneWorkersMutation/)
  assert.match(workspace, /self_service_lifecycle/)
  assert.match(workspace, /!workerPending/)
  assert.match(workspace, /controlPlaneHealthy/)
  assert.match(workspace, /Reconcile registered workers/)
  assert.doesNotMatch(workspace, /Device count/)
  assert.doesNotMatch(workspace, /label="GPU \/ vGPU profile"/)
  assert.match(workspace, /runOperation/)
})

test('LayerSentry Kubernetes workspace keeps provider brands out of presentation', () => {
  const workspace = read(
    'src/client/apps/layersentry/pages/KubernetesWorkspace.js'
  )
  const kubeOneApi = read('src/modules/features/OneApi/kubeOnePortal.js')

  assert.match(workspace, /Manage LayerSentry Kubernetes clusters/)
  assert.doesNotMatch(workspace, />[^<{]*(KubeOne|OneKS)[^<{]*</i)
  assert.doesNotMatch(workspace, /OneKsAPI|ONEKS|oneks/i)
  assert.doesNotMatch(kubeOneApi, /OneKsAPI|\/oneks/)
})
