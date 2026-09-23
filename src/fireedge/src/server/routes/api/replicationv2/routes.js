const { httpMethod, from: fromData } = require('../../../utils/constants/defaults')
const { GET, POST } = httpMethod
const { postBody } = fromData

const basepath = '/v1/replication-v2'
const Actions = {
  CAPABILITIES: 'replicationv2.capabilities',
  SESSIONS: 'replicationv2.sessions',
  CREATE: 'replicationv2.create',
  PREFLIGHT: 'replicationv2.preflight',
  HEALTH: 'replicationv2.health',
  BACKEND_HEALTH: 'replicationv2.backendHealth',
  CHECKPOINTS: 'replicationv2.checkpoints',
  CLONE: 'replicationv2.clone',
  REBASELINE: 'replicationv2.rebaseline',
  PUT_PROTECTION_GROUP: 'replicationv2.putProtectionGroup',
  CAPTURE_PROTECTION_GROUP: 'replicationv2.captureProtectionGroup',
  PROTECTION_GROUP_CHECKPOINTS: 'replicationv2.protectionGroupCheckpoints',
}

module.exports = {
  Actions,
  Commands: {
    [Actions.CAPABILITIES]: {
      path: basepath + '/capabilities',
      httpMethod: GET,
      auth: true,
      params: {},
    },
    [Actions.SESSIONS]: {
      path: basepath + '/sessions',
      httpMethod: GET,
      auth: true,
      params: {},
    },
    [Actions.CREATE]: {
      path: basepath + '/sessions',
      httpMethod: POST,
      auth: true,
      params: { request: { from: postBody } },
    },
    [Actions.PREFLIGHT]: {
      path: basepath + '/preflight',
      httpMethod: POST,
      auth: true,
      params: { request: { from: postBody } },
    },
    [Actions.HEALTH]: {
      path: basepath + '/health',
      httpMethod: POST,
      auth: true,
      params: { sessionId: { from: postBody } },
    },
    [Actions.BACKEND_HEALTH]: {
      path: basepath + '/backend-health',
      httpMethod: POST,
      auth: true,
      params: { sessionId: { from: postBody } },
    },
    [Actions.CHECKPOINTS]: {
      path: basepath + '/checkpoints',
      httpMethod: POST,
      auth: true,
      params: { sessionId: { from: postBody } },
    },
    [Actions.CLONE]: {
      path: basepath + '/clone',
      httpMethod: POST,
      auth: true,
      params: {
        sessionId: { from: postBody },
        checkpointId: { from: postBody },
        name: { from: postBody },
      },
    },
    [Actions.REBASELINE]: {
      path: basepath + '/rebaseline',
      httpMethod: POST,
      auth: true,
      params: { sessionId: { from: postBody } },
    },
    [Actions.PUT_PROTECTION_GROUP]: {
      path: basepath + '/protection-groups',
      httpMethod: POST,
      auth: true,
      params: { group: { from: postBody } },
    },
    [Actions.CAPTURE_PROTECTION_GROUP]: {
      path: basepath + '/protection-groups/capture',
      httpMethod: POST,
      auth: true,
      params: { groupId: { from: postBody } },
    },
    [Actions.PROTECTION_GROUP_CHECKPOINTS]: {
      path: basepath + '/protection-groups/checkpoints',
      httpMethod: POST,
      auth: true,
      params: { groupId: { from: postBody } },
    },
  },
}
