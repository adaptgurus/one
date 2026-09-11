const { Actions, Commands } = require('server/routes/api/layersentry-dbaas/routes')
const {
  list,
  create,
  show,
  update,
  remove,
  action,
} = require('server/routes/api/layersentry-dbaas/functions')

module.exports = [
  { action: list, ...Commands[Actions.LIST] },
  { action: create, ...Commands[Actions.CREATE] },
  { action: show, ...Commands[Actions.SHOW] },
  { action: update, ...Commands[Actions.UPDATE] },
  { action: remove, ...Commands[Actions.DELETE] },
  { action, ...Commands[Actions.ACTION] },
]
