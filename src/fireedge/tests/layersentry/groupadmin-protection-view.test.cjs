/* SPDX-License-Identifier: Apache-2.0 */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const fireedgeRoot = path.join(__dirname, '../..')
const view = fs.readFileSync(
  path.join(
    fireedgeRoot,
    'etc',
    'sunstone',
    'views',
    'groupadmin',
    'backupjobs-tab.yaml'
  ),
  'utf8'
)

test('groupadmin backup jobs endpoint exists but remains mutation-safe', () => {
  assert.match(view, /resource_name:\s*"BACKUPJOBS"/)

  for (const action of [
    'create_dialog',
    'update_dialog',
    'delete',
    'chown',
    'chgrp',
    'lock',
    'unlock',
    'start',
    'cancel',
    'edit_labels',
    'rename',
    'priority',
    'chmod',
    'copy',
    'add',
    'edit',
    'sched_action_create',
    'sched_action_update',
    'sched_action_delete',
  ]) {
    assert.match(
      view,
      new RegExp(String.raw`\b${action}:\\s*false\b`),
      `${action} must remain disabled for groupadmin backup jobs`
    )
  }

  assert.match(view, /vms:\s*\n\s+enabled:\s*true/)
})
