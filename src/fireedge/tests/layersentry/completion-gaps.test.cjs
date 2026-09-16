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
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const YAML = require('yaml')

const root = resolve(__dirname, '../..')
const read = (...parts) => readFileSync(resolve(root, ...parts), 'utf8')
const readView = (view, file) =>
  YAML.parse(read('etc/sunstone/views', view, file))
test('OpenNebula 7.4.1 VM view additions are enabled for intended roles', () => {
  for (const view of ['admin', 'user', 'groupadmin', 'cloud']) {
    const vm = readView(view, 'vm-tab.yaml')
    assert.equal(vm['info-tabs'].vm_group.enabled, true, `${view}: vm_group`)
    assert.equal(vm['info-tabs'].vm_group.actions['vmgroup-add'], true)
    assert.equal(vm['info-tabs'].vm_group.actions['vmgroup-del'], true)
    assert.equal(vm['info-tabs'].exec.enabled, true, `${view}: exec`)
    assert.equal(vm['info-tabs'].exec.actions.exec, true)
    assert.equal(vm['info-tabs'].exec.actions['exec-retry'], true)
    assert.equal(vm['info-tabs'].exec.actions['exec-cancel'], true)
  }
  assert.equal(readView('admin', 'vm-tab.yaml').filters.cluster, true)
  assert.equal(readView('admin', 'host-tab.yaml').filters.cluster, true)
})

test('groupadmin VM operations use current action keys', () => {
  const source = read('etc/sunstone/views/groupadmin/vm-tab.yaml')
  for (const stale of [
    'migrate_live:',
    'resize_capacity:',
    'snapshot_disk_create:',
    'attach_nic:',
    'sched_action_create:',
  ]) assert.doesNotMatch(source, new RegExp(stale))
  for (const current of [
    'live-migrate:',
    'disk-snapshot-create:',
    'nic-attach:',
    'sched-add:',
  ]) assert.match(source, new RegExp(current))
})
test('LayerSentry exposes native project zone and view context switching', () => {
  const source = read('src/client/apps/layersentry/components/ContextSelectors.js')
  assert.match(source, /useChangeAuthGroupMutation/)
  assert.match(source, /changeZone/)
  assert.match(source, /changeView/)
  assert.match(source, /useGetSunstoneAvailableViewsQuery/)
  const shell = read('src/client/apps/layersentry/components/PortalShell.js')
  assert.match(shell, /<ContextSelectors \/>/)
})

test('Marketplace Apps discovery follows authorized endpoints', () => {
  const portal = read('src/client/apps/layersentry/Portal.js')
  const navigation = read('src/client/apps/layersentry/navigation.js')
  assert.match(portal, /canMarketplaceApps/)
  assert.match(portal, /authorizedPaths\.has\('\/marketplace-app'\)/)
  assert.match(navigation, /Appliance Catalog/)
  assert.match(navigation, /capabilities\.marketplaceApps/)
})

test('Hook command registry preserves delete and update separately', () => {
  const command = read('src/server/utils/constants/commands/hook.js')
  assert.match(command, /HOOK_DELETE = 'hook\.delete'/)
  assert.match(command, /HOOK_UPDATE = 'hook\.update'/)
  assert.match(command, /\[HOOK_DELETE\]: \{[\s\S]*?httpMethod: DELETE/)
  assert.match(command, /\[HOOK_UPDATE\]: \{[\s\S]*?httpMethod: PUT/)
})

test('administrator Hook lifecycle has an authenticated LayerSentry surface', () => {
  const portal = read('src/client/apps/layersentry/Portal.js')
  const navigation = read('src/client/apps/layersentry/navigation.js')
  const workspace = read('src/client/apps/layersentry/pages/HooksWorkspace.js')
  assert.match(navigation, /INFRA_HOOKS/)
  assert.match(navigation, /Automation Hooks/)
  assert.match(portal, /PRODUCT_PATHS\.INFRA_HOOKS/)
  for (const action of ['allocateHook', 'updateHook', 'deleteHook', 'renameHook', 'lockHook', 'unlockHook', 'retryHook']) {
    assert.match(workspace, new RegExp(action))
  }
})

test('context switching remains available in the mobile LayerSentry shell', () => {
  const shell = read('src/client/apps/layersentry/components/PortalShell.js')
  const selectors = read(
    'src/client/apps/layersentry/components/ContextSelectors.js'
  )
  assert.match(shell, /ContextSelectors mobile/)
  assert.match(selectors, /mobile \? \{ xs: 'grid', md: 'none' \}/)
})

test('Hook execution logs use the native hooklog RPC contract', () => {
  const commands = read('src/server/utils/constants/commands/hook.js')
  const api = read('src/modules/features/OneApi/hook.js')
  const workspace = read('src/client/apps/layersentry/pages/HooksWorkspace.js')
  assert.match(commands, /min_ts/)
  assert.match(commands, /max_ts/)
  assert.match(commands, /hook_id/)
  assert.match(commands, /rc_hook/)
  assert.match(api, /useGetHookLogQuery/)
  assert.match(workspace, /Execution log/)
  assert.match(workspace, /selectedId === undefined/)
})

test('native OpenNebula resource-scope filtering remains available', () => {
  const selectors = read(
    'src/client/apps/layersentry/components/ContextSelectors.js'
  )
  assert.match(selectors, /FILTER_POOL/)
  assert.match(selectors, /layersentry-scope-selector/)
  assert.match(selectors, /Current project/)
  assert.match(selectors, /My resources & projects/)
  assert.match(selectors, /All visible resources/)
})
