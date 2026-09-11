const {
  httpMethod,
  from: fromData,
} = require('../../../utils/constants/defaults')

const { GET, POST, PUT, DELETE } = httpMethod
const { resource, postBody } = fromData
const basepath = '/layersentry/dbaas'

const Actions = {
  LIST: 'layersentry.dbaas.list',
  CREATE: 'layersentry.dbaas.create',
  SHOW: 'layersentry.dbaas.show',
  UPDATE: 'layersentry.dbaas.update',
  DELETE: 'layersentry.dbaas.delete',
  ACTION: 'layersentry.dbaas.action',
}

const commonCluster = {
  clusterId: { from: resource },
}

const Commands = {
  [Actions.LIST]: {
    path: `${basepath}/:clusterId/databases`,
    httpMethod: GET,
    auth: true,
    params: commonCluster,
  },
  [Actions.CREATE]: {
    path: `${basepath}/:clusterId/databases`,
    httpMethod: POST,
    auth: true,
    params: { ...commonCluster, body: { from: postBody } },
  },
  [Actions.SHOW]: {
    path: `${basepath}/:clusterId/databases/:name`,
    httpMethod: GET,
    auth: true,
    params: { ...commonCluster, name: { from: resource } },
  },
  [Actions.UPDATE]: {
    path: `${basepath}/:clusterId/databases/:name`,
    httpMethod: PUT,
    auth: true,
    params: {
      ...commonCluster,
      name: { from: resource },
      body: { from: postBody },
    },
  },
  [Actions.DELETE]: {
    path: `${basepath}/:clusterId/databases/:name`,
    httpMethod: DELETE,
    auth: true,
    params: { ...commonCluster, name: { from: resource } },
  },
  [Actions.ACTION]: {
    path: `${basepath}/:clusterId/databases/:name/actions/:operation`,
    httpMethod: POST,
    auth: true,
    params: {
      ...commonCluster,
      name: { from: resource },
      operation: { from: resource },
      body: { from: postBody },
    },
  },
}

module.exports = { Actions, Commands }
