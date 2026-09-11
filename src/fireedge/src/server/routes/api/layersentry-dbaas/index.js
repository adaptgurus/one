const { Actions, Commands } = require('server/routes/api/layersentry-dbaas/routes')
const {
  catalog,
  list,
  create,
  show,
  update,
  remove,
  action,
} = require('server/routes/api/layersentry-dbaas/functions')

module.exports = [
  { action: catalog, ...Commands[Actions.CATALOG] },
  { action: list, ...Commands[Actions.LIST] },
  { action: create, ...Commands[Actions.CREATE] },
  { action: show, ...Commands[Actions.SHOW] },
  { action: update, ...Commands[Actions.UPDATE] },
  { action: remove, ...Commands[Actions.DELETE] },
  { action, ...Commands[Actions.ACTION] },
]
