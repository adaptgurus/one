const { httpMethod, from: fromData } = require('../../../utils/constants/defaults')

const { GET, POST } = httpMethod
const { postBody, query, resource } = fromData
const basepath = '/v1/controlplane/operations'

const Actions = {
  LIST: 'controlplaneops.list',
  SUBMIT: 'controlplaneops.submit',
  GET: 'controlplaneops.get',
}

module.exports = {
  Actions,
  Commands: {
    [Actions.LIST]: {
      path: basepath,
      httpMethod: GET,
      auth: true,
      params: { limit: { from: query } },
    },
    [Actions.SUBMIT]: {
      path: basepath,
      httpMethod: POST,
      auth: true,
      params: {
        resourceKind: { from: postBody },
        resourceId: { from: postBody },
        action: { from: postBody },
        desiredState: { from: postBody },
        reason: { from: postBody },
        idempotencyKey: { from: postBody },
      },
    },
    [Actions.GET]: {
      path: `${basepath}/:id`,
      httpMethod: GET,
      auth: true,
      params: { id: { from: resource } },
    },
  },
}
