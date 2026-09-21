/* ------------------------------------------------------------------------- *
 * Copyright 2002-2026, OpenNebula Project, OpenNebula Systems               *
 * ------------------------------------------------------------------------- */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')

test('local live backup refreshes qcow2 paths after first snapshot folder creation', () => {
  const source = readFileSync(
    resolve(__dirname, '../../../tm_mad/lib/backup_kvm.rb'),
    'utf8'
  )

  assert.match(
    source,
    /if snap_folder\(did, true\)\s+qdisk\[did\]\.read_paths\(disk_path, disk_opts\)\s+elsif/
  )
})
