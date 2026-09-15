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
const { test, before } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
let api

before(async () => {
  const source = readFileSync(
    resolve(__dirname, '../../src/modules/utils/layersentryStorage.js'),
    'utf8'
  )
  api = await import(
    'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
  )
})

test('iSCSI multipath requires two portals and a stable WWID', () => {
  assert.throws(
    () =>
      api.normalizeIscsiMultipath({
        LAYERSENTRY_ISCSI_PORTALS: ['10.0.0.10:3260'],
        LAYERSENTRY_ISCSI_TARGET_IQN: 'iqn.2026-09.example:one',
        LAYERSENTRY_ISCSI_WWID: '3600d0231000e2ee804a01313019a02e4',
      }),
    /at least two portals/
  )
  const value = api.normalizeIscsiMultipath({
    LAYERSENTRY_ISCSI_PORTALS: ['10.0.0.10:3260', '10.0.1.10:3260'],
    LAYERSENTRY_ISCSI_TARGET_IQN: 'iqn.2026-09.example:one',
    LAYERSENTRY_ISCSI_WWID: '3600d0231000e2ee804a01313019a02e4',
  })
  assert.equal(value.LAYERSENTRY_MULTIPATH_REQUIRED, 'YES')
  assert.match(value.LAYERSENTRY_ISCSI_PORTALS, /10\.0\.1\.10/)
})

test('RPM package plans include required SAN and LINSTOR components', () => {
  const san = api.storageInstallPlan(api.STORAGE_PROFILE.ISCSI_MULTIPATH, 'rpm')
  assert.ok(san.hosts.includes('device-mapper-multipath'))
  assert.ok(san.hosts.includes('iscsi-initiator-utils'))
  const sds = api.storageInstallPlan(api.STORAGE_PROFILE.LINSTOR, 'rpm')
  assert.ok(sds.frontend.includes('linstor-opennebula'))
  assert.ok(sds.hosts.includes('linbit-sds-satellite'))
  assert.ok(sds.hosts.includes('kmod-drbd'))
})

test('datastore wizard exposes native LVM, multipath and LINSTOR profiles', () => {
  const constants = readFileSync(
    resolve(__dirname, '../../src/modules/constants/datastore.js'),
    'utf8'
  )
  const steps = readFileSync(
    resolve(
      __dirname,
      '../../src/modules/resources/Datastore/Forms/CreateForm/Steps/index.js'
    ),
    'utf8'
  )
  assert.match(constants, /ISCSI_MULTIPATH/)
  assert.match(constants, /LINSTOR/)
  assert.match(constants, /FS_LVM\.value\]: DS_DISK_TYPES\.BLOCK/)
  assert.match(steps, /tmMad = ["']fs_lvm_ssh["']/)
  assert.match(steps, /tmMad = ["']linstor["']/)
  assert.match(steps, /LAYERSENTRY_STORAGE_PROFILE/)
})

test('LINSTOR requires a resource group and supports controller lists', () => {
  assert.throws(() => api.normalizeLinstor({}), /resource group/)
  assert.deepEqual(
    api.normalizeLinstor({
      LINSTOR_RESOURCE_GROUP: 'one-prod-rg',
      LINSTOR_CONTROLLERS: ['10.1.0.10:3370', '10.1.0.11:3370'],
    }),
    {
      LINSTOR_RESOURCE_GROUP: 'one-prod-rg',
      LINSTOR_CONTROLLERS: '10.1.0.10:3370,10.1.0.11:3370',
    }
  )
})
