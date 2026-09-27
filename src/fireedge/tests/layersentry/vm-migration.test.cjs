/* ------------------------------------------------------------------------- *
 * Copyright 2002-2026, OpenNebula Project, OpenNebula Systems               *
 *                                                                           *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may   *
 * not use this file except in compliance with the License. You may obtain   *
 * a copy of the License at                                                  *
 *                                                                           *
 * http://www.apache.org/licenses/LICENSE-2.0                                *
 *                                                                           *
 * Unless required by applicable law or agreed to in writing, software       *
 * distributed under the License is distributed on an "AS IS" BASIS,         *
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.  *
 * See the License for the specific language governing permissions and       *
 * limitations under the License.                                            *
 * ------------------------------------------------------------------------- */
const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { dirname, resolve } = require('node:path')
const Module = require('node:module')
const babel = require('@babel/core')

const fireedgeRoot = resolve(__dirname, '../..')
const file = resolve(fireedgeRoot, 'src/client/apps/layersentry/vmMigration.js')
const { code } = babel.transformSync(readFileSync(file, 'utf8'), {
  babelrc: false,
  configFile: false,
  presets: [
    [
      require.resolve('@babel/preset-env'),
      { targets: { node: 'current' }, modules: 'commonjs' },
    ],
  ],
})
const compiled = new Module(file, module)
compiled.filename = file
compiled.paths = Module._nodeModulePaths(dirname(file))
compiled._compile(code, file)
const migration = compiled.exports

const ds = (id, tm, migrate = 'YES', live = 'YES') => ({
  ID: String(id),
  TYPE: '1',
  TM_MAD: tm,
  TEMPLATE: { DS_MIGRATE: migrate, DS_LIVE_MIGRATE: live },
})
const vm = (state = '3', host = '10', datastore = '20') => ({
  ID: '7',
  STATE: state,
  HISTORY_RECORDS: { HISTORY: [{ HID: host, DS_ID: datastore }] },
})

test('same-driver qualified NFS storage targets are eligible', () => {
  const current = ds(20, 'nfs')
  const targets = migration.eligibleSystemDatastores(
    [current, ds(21, 'nfs'), ds(22, 'iscsi_libvirt')],
    current,
    true
  )
  assert.deepEqual(
    targets.map(({ ID }) => ID),
    ['20', '21']
  )
  assert.equal(
    migration.validateStorageMigration({
      vm: vm(),
      currentDatastore: current,
      targetDatastore: ds(21, 'nfs'),
      targetHostId: '10',
      live: true,
    }),
    ''
  )
})

test('block to NFS and unknown source drivers fail closed', () => {
  assert.match(
    migration.validateStorageMigration({
      vm: vm(),
      currentDatastore: ds(20, 'iscsi_libvirt'),
      targetDatastore: ds(21, 'nfs'),
      targetHostId: '10',
      live: false,
    }),
    /Cross-driver/
  )
  assert.deepEqual(
    migration.eligibleSystemDatastores([ds(21, 'nfs')], { ID: '20' }),
    []
  )
})

test('live storage move cannot also change host', () => {
  assert.match(
    migration.validateStorageMigration({
      vm: vm(),
      currentDatastore: ds(20, 'nfs'),
      targetDatastore: ds(21, 'nfs'),
      targetHostId: '11',
      live: true,
    }),
    /cannot change host/
  )
  assert.equal(
    migration.validateStorageMigration({
      vm: vm('3'),
      currentDatastore: ds(20, 'nfs'),
      targetDatastore: ds(21, 'nfs'),
      targetHostId: '11',
      live: false,
    }),
    ''
  )
})

test('migration capability and authoritative readback are mandatory', () => {
  assert.match(
    migration.validateStorageMigration({
      vm: vm(),
      currentDatastore: ds(20, 'nfs', 'YES', 'NO'),
      targetDatastore: ds(21, 'nfs'),
      targetHostId: '10',
      live: true,
    }),
    /not qualified for live migration/
  )
  assert.equal(migration.migrationReadbackMatches(vm(), '10', '20'), true)
  assert.equal(migration.migrationReadbackMatches(vm(), '10', '21'), false)
})
