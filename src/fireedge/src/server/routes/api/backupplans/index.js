/* ------------------------------------------------------------------------- *
 * Copyright 2002-2026, OpenNebula Project, OpenNebula Systems               *
 *                                                                           *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may   *
 * not use this file except in compliance with the License. You may obtain   *
 * a copy of the License at                                                  *
 *                                                                           *
 * http://www.apache.org/licenses/LICENSE-2.0                                *
 * ------------------------------------------------------------------------- */

const { Actions, Commands } = require('server/routes/api/backupplans/routes')
const { list } = require('server/routes/api/backupplans/functions')

const { BACKUP_PLANS_LIST } = Actions

module.exports = [
  {
    ...Commands[BACKUP_PLANS_LIST],
    action: list,
  },
]
