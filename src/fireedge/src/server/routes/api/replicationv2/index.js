const { Actions, Commands } = require('server/routes/api/replicationv2/routes')
const actions = require('server/routes/api/replicationv2/functions')

module.exports = [
  { ...Commands[Actions.CAPABILITIES], action: actions.capabilities },
  { ...Commands[Actions.SESSIONS], action: actions.sessions },
  { ...Commands[Actions.CREATE], action: actions.create },
  { ...Commands[Actions.PREFLIGHT], action: actions.preflight },
  { ...Commands[Actions.HEALTH], action: actions.health },
  { ...Commands[Actions.BACKEND_HEALTH], action: actions.backendHealth },
  { ...Commands[Actions.CHECKPOINTS], action: actions.checkpoints },
  { ...Commands[Actions.CLONE], action: actions.clone },
  { ...Commands[Actions.REBASELINE], action: actions.rebaseline },
]
