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
const {
  httpMethod,
  from: fromData,
} = require('../../../utils/constants/defaults')

const { GET, POST } = httpMethod
const { postBody, resource } = fromData
const basepath = '/v1/kubeone'

const Actions = {
  LIST: 'kubeoneportal.list',
  NAMESPACES: 'kubeoneportal.namespaces',
  CREATE_NAMESPACE: 'kubeoneportal.namespace.create',
  KUBECONFIG: 'kubeoneportal.kubeconfig',
  PROVISION: 'kubeoneportal.provision',
  PROVISION_STATUS: 'kubeoneportal.provision.status',
  CONTROL_PLANE_RECONCILIATION: 'kubeoneportal.controlplane.reconciliation',
  CONTROL_PLANE_RECONCILIATION_STATUS: 'kubeoneportal.controlplane.reconciliation.status',
  WORKER_RECONCILIATION: 'kubeoneportal.worker.reconciliation',
  RECONCILE_WORKERS: 'kubeoneportal.workers.reconcile',
  APPLICATIONS: 'kubeoneportal.applications',
  INSTALL_APPLICATION: 'kubeoneportal.application.install',
}

module.exports = {
  Actions,
  Commands: {
    [Actions.LIST]: {
      path: `${basepath}/clusters`,
      httpMethod: GET,
      auth: true,
      params: {},
    },
    [Actions.NAMESPACES]: {
      path: `${basepath}/clusters/:id/namespaces`,
      httpMethod: GET,
      auth: true,
      params: { id: { from: resource } },
    },
    [Actions.CREATE_NAMESPACE]: {
      path: `${basepath}/clusters/:id/namespaces`,
      httpMethod: POST,
      auth: true,
      params: { id: { from: resource }, name: { from: postBody } },
    },
    [Actions.KUBECONFIG]: {
      path: `${basepath}/clusters/:id/kubeconfig`,
      httpMethod: GET,
      auth: true,
      params: { id: { from: resource } },
    },
    [Actions.PROVISION_STATUS]: {
      path: `${basepath}/clusters/:id/provision`,
      httpMethod: GET,
      auth: true,
      params: { id: { from: resource } },
    },
    [Actions.PROVISION]: {
      path: `${basepath}/clusters/:id/provision`,
      httpMethod: POST,
      auth: true,
      params: { id: { from: resource } },
    },
    [Actions.CONTROL_PLANE_RECONCILIATION_STATUS]: {
      path: `${basepath}/clusters/:id/control-plane-reconciliation`,
      httpMethod: GET,
      auth: true,
      params: { id: { from: resource } },
    },
    [Actions.CONTROL_PLANE_RECONCILIATION]: {
      path: `${basepath}/clusters/:id/control-plane-reconciliation`,
      httpMethod: POST,
      auth: true,
      params: { id: { from: resource } },
    },
    [Actions.WORKER_RECONCILIATION]: {
      path: `${basepath}/clusters/:id/worker-reconciliation`,
      httpMethod: GET,
      auth: true,
      params: { id: { from: resource } },
    },
    [Actions.RECONCILE_WORKERS]: {
      path: `${basepath}/clusters/:id/worker-reconciliation`,
      httpMethod: POST,
      auth: true,
      params: { id: { from: resource } },
    },
    [Actions.APPLICATIONS]: {
      path: `${basepath}/clusters/:id/applications`,
      httpMethod: GET,
      auth: true,
      params: { id: { from: resource } },
    },
    [Actions.INSTALL_APPLICATION]: {
      path: `${basepath}/clusters/:id/applications/:app`,
      httpMethod: POST,
      auth: true,
      params: { id: { from: resource }, app: { from: resource } },
    },
  },
}
