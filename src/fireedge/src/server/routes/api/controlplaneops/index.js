const { Actions, Commands } = require('server/routes/api/controlplaneops/routes')
const {
  get,
  list,
  submit,
} = require('server/routes/api/controlplaneops/functions')

module.exports = [
  { ...Commands[Actions.LIST], action: list },
  { ...Commands[Actions.SUBMIT], action: submit },
  { ...Commands[Actions.GET], action: get },
]
