const { httpMethod, from: fromData } = require('../../../utils/constants/defaults')

const { GET, POST } = httpMethod
const { postBody, resource } = fromData
const basepath = '/v1/controlplane/operations'

const Actions = {
  SUBMIT: 'controlplaneops.submit',
  GET: 'controlplaneops.get',
}

module.exports = {
  Actions,
  Commands: {
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
