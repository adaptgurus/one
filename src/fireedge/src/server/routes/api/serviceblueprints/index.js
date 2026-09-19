/* ------------------------------------------------------------------------- *
 * Copyright 2002-2026, OpenNebula Project, OpenNebula Systems
 * Licensed under the Apache License, Version 2.0.
 * ------------------------------------------------------------------------- */

const {
  Actions,
  Commands,
} = require('server/routes/api/serviceblueprints/routes')
const {
  list,
  preflight,
  deploy,
} = require('server/routes/api/serviceblueprints/functions')

const {
  SERVICE_BLUEPRINTS_LIST,
  SERVICE_BLUEPRINTS_PREFLIGHT,
  SERVICE_BLUEPRINTS_DEPLOY,
} = Actions

module.exports = [
  {
    ...Commands[SERVICE_BLUEPRINTS_LIST],
    action: list,
  },
  {
    ...Commands[SERVICE_BLUEPRINTS_PREFLIGHT],
    action: preflight,
  },
  {
    ...Commands[SERVICE_BLUEPRINTS_DEPLOY],
    action: deploy,
  },
]
