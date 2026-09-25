const { httpMethod, from: fromData } = require('../../../utils/constants/defaults')

const { GET, POST } = httpMethod
const { postBody, resource } = fromData
const basepath = '/v1/kubeone'

const Actions = {
  LIST: 'kubeoneportal.list',
  NAMESPACES: 'kubeoneportal.namespaces',
  CREATE_NAMESPACE: 'kubeoneportal.namespace.create',
  KUBECONFIG: 'kubeoneportal.kubeconfig',
  WORKER_RECONCILIATION: 'kubeoneportal.worker.reconciliation',
  RECONCILE_WORKERS: 'kubeoneportal.workers.reconcile',
  APPLICATIONS: 'kubeoneportal.applications',
  INSTALL_APPLICATION: 'kubeoneportal.application.install',
}

module.exports = {
  Actions,
  Commands: {
    [Actions.LIST]: { path: `${basepath}/clusters`, httpMethod: GET, auth: true, params: {} },
    [Actions.NAMESPACES]: {
      path: `${basepath}/clusters/:id/namespaces`, httpMethod: GET, auth: true,
      params: { id: { from: resource } },
    },
    [Actions.CREATE_NAMESPACE]: {
      path: `${basepath}/clusters/:id/namespaces`, httpMethod: POST, auth: true,
      params: { id: { from: resource }, name: { from: postBody } },
    },
    [Actions.KUBECONFIG]: {
      path: `${basepath}/clusters/:id/kubeconfig`, httpMethod: GET, auth: true,
      params: { id: { from: resource } },
    },
    [Actions.WORKER_RECONCILIATION]: {
      path: `${basepath}/clusters/:id/worker-reconciliation`, httpMethod: GET, auth: true,
      params: { id: { from: resource } },
    },
    [Actions.RECONCILE_WORKERS]: {
      path: `${basepath}/clusters/:id/worker-reconciliation`, httpMethod: POST, auth: true,
      params: { id: { from: resource } },
    },
    [Actions.APPLICATIONS]: {
      path: `${basepath}/clusters/:id/applications`, httpMethod: GET, auth: true,
      params: { id: { from: resource } },
    },
    [Actions.INSTALL_APPLICATION]: {
      path: `${basepath}/clusters/:id/applications/:app`, httpMethod: POST, auth: true,
      params: { id: { from: resource }, app: { from: resource } },
    },
  },
}
