const { httpMethod, from: fromData } = require('../../../utils/constants/defaults')

const { GET, POST } = httpMethod
const { postBody, resource } = fromData
const basepath = '/v1/kubeone'

const Actions = {
  LIST: 'kubeoneportal.list',
  NAMESPACES: 'kubeoneportal.namespaces',
  CREATE_NAMESPACE: 'kubeoneportal.namespace.create',
  KUBECONFIG: 'kubeoneportal.kubeconfig',
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
  },
}
