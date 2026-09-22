const { httpMethod, from: fromData } = require('../../../utils/constants/defaults')
const { GET, POST } = httpMethod
const { postBody } = fromData

const basepath = '/v1/replication-v2'
const Actions = {
  CAPABILITIES: 'replicationv2.capabilities',
  SESSIONS: 'replicationv2.sessions',
  CREATE: 'replicationv2.create',
  PREFLIGHT: 'replicationv2.preflight',
  CHECKPOINTS: 'replicationv2.checkpoints',
  CLONE: 'replicationv2.clone',
  REBASELINE: 'replicationv2.rebaseline',
}

module.exports = {
  Actions,
  Commands: {
    [Actions.CAPABILITIES]: { path: basepath + '/capabilities', httpMethod: GET, auth: true, params: {} },
    [Actions.SESSIONS]: { path: basepath + '/sessions', httpMethod: GET, auth: true, params: {} },
    [Actions.CREATE]: { path: basepath + '/sessions', httpMethod: POST, auth: true, params: { request: { from: postBody } } },
    [Actions.PREFLIGHT]: { path: basepath + '/preflight', httpMethod: POST, auth: true, params: { request: { from: postBody } } },
    [Actions.CHECKPOINTS]: { path: basepath + '/checkpoints', httpMethod: POST, auth: true, params: { sessionId: { from: postBody } } },
    [Actions.CLONE]: { path: basepath + '/clone', httpMethod: POST, auth: true, params: { sessionId: { from: postBody }, checkpointId: { from: postBody }, name: { from: postBody } } },
    [Actions.REBASELINE]: { path: basepath + '/rebaseline', httpMethod: POST, auth: true, params: { sessionId: { from: postBody } } },
  },
}
