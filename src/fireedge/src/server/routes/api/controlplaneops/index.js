const { Actions, Commands } = require('server/routes/api/controlplaneops/routes')
const { get, submit } = require('server/routes/api/controlplaneops/functions')

module.exports = [
  { ...Commands[Actions.SUBMIT], action: submit },
  { ...Commands[Actions.GET], action: get },
]
