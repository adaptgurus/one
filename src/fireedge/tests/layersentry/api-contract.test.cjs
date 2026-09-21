/* ------------------------------------------------------------------------- *
 * Copyright 2002-2026, OpenNebula Project, OpenNebula Systems               *
 * ------------------------------------------------------------------------- */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')

const root = resolve(__dirname, '../..')
const read = (...parts) => readFileSync(resolve(root, ...parts), 'utf8')

const commandBlock = (source, action) => {
  const marker = `[${action}]: {`
  const start = source.indexOf(marker)
  assert.notEqual(start, -1, `Missing command ${action}`)
  const end = source.indexOf('\n    [', start + marker.length)

  return source.slice(start, end === -1 ? source.length : end)
}

const expectCommand = (source, action, method, params = []) => {
  const block = commandBlock(source, action)
  assert.match(block, new RegExp(`httpMethod:\\s*${method}`), action)

  for (const [name, from] of params) {
    assert.match(
      block,
      new RegExp(`${name}:\\s*\\{[\\s\\S]*?from:\\s*${from}`),
      `${action}.${name}`
    )
  }
}

const expectClientAction = (source, endpoint, action) => {
  assert.match(
    source,
    new RegExp(
      `${endpoint}: builder\\.(?:query|mutation)\\(\\{[\\s\\S]*?Actions\\.${action}`
    ),
    `${endpoint} -> ${action}`
  )
}

test('all generated OpenNebula XML-RPC API routes require a valid session', () => {
  const xmlrpc = read('src/server/routes/entrypoints/Api/xmlrpc.js')
  const middleware = read('src/server/routes/entrypoints/Api/middlewares.js')

  assert.match(xmlrpc, /Object\.keys\(commands\)\.forEach/)
  assert.match(xmlrpc, /validateSession\(\{ req, res, next \}\)/)
  assert.match(middleware, /validateAuth\(req\)/)
  assert.match(middleware, /httpCodes\.unauthorized/)
  assert.match(middleware, /validateUser\(user, password\)/)
  assert.match(middleware, /data: 'expired'/)
})

test('critical VM lifecycle API contracts keep their methods and data sources', () => {
  const source = read('src/server/utils/constants/commands/vm.js')

  expectCommand(source, 'VM_ALLOCATE', 'PUT', [['template', 'postBody']])
  expectCommand(source, 'VM_ACTION', 'PUT', [
    ['action', 'postBody'],
    ['id', 'resource'],
  ])
  expectCommand(source, 'VM_RESIZE', 'PUT', [
    ['id', 'resource'],
    ['template', 'postBody'],
    ['enforce', 'postBody'],
  ])
  expectCommand(source, 'VM_DISK_ATTACH', 'PUT', [
    ['id', 'resource'],
    ['template', 'postBody'],
  ])
  expectCommand(source, 'VM_DISK_DETACH', 'PUT', [
    ['id', 'resource'],
    ['disk', 'postBody'],
  ])
  expectCommand(source, 'VM_DISK_RESIZE', 'PUT', [
    ['id', 'resource'],
    ['disk', 'postBody'],
    ['size', 'postBody'],
  ])
  expectCommand(source, 'VM_NIC_ATTACH', 'PUT', [
    ['id', 'resource'],
    ['template', 'postBody'],
  ])
  expectCommand(source, 'VM_NIC_DETACH', 'PUT', [
    ['id', 'resource'],
    ['nic', 'postBody'],
  ])
  expectCommand(source, 'VM_BACKUP', 'POST', [
    ['id', 'resource'],
    ['dsId', 'postBody'],
    ['reset', 'postBody'],
  ])
  expectCommand(source, 'VM_INFO', 'GET', [['id', 'resource']])
  expectCommand(source, 'VM_POOL_INFO_EXTENDED', 'GET')
})

test('template, image, network and backup APIs keep production CRUD contracts', () => {
  const template = read('src/server/utils/constants/commands/template.js')
  const image = read('src/server/utils/constants/commands/image.js')
  const network = read('src/server/utils/constants/commands/vn.js')
  const backup = read('src/server/utils/constants/commands/backupjobs.js')

  expectCommand(template, 'TEMPLATE_INSTANTIATE', 'PUT', [
    ['id', 'resource'],
    ['name', 'postBody'],
    ['template', 'postBody'],
  ])
  expectCommand(template, 'TEMPLATE_CLONE', 'POST', [
    ['id', 'resource'],
    ['name', 'postBody'],
  ])
  expectCommand(template, 'TEMPLATE_DELETE', 'DELETE', [['id', 'resource']])

  expectCommand(image, 'IMAGE_ALLOCATE', 'POST', [
    ['template', 'postBody'],
    ['datastore', 'postBody'],
  ])
  expectCommand(image, 'IMAGE_DELETE', 'DELETE', [['id', 'resource']])
  expectCommand(image, 'IMAGE_RESTORE', 'POST', [
    ['id', 'resource'],
    ['datastore', 'postBody'],
  ])

  expectCommand(network, 'VN_POOL_INFO', 'GET')
  expectCommand(network, 'VN_ALLOCATE', 'POST', [['template', 'postBody']])
  expectCommand(network, 'VN_DELETE', 'DELETE', [['id', 'resource']])

  expectCommand(backup, 'BACKUPJOB_POOL_INFO', 'GET')
  expectCommand(backup, 'BACKUPJOB_ALLOCATE', 'POST', [['template', 'postBody']])
  expectCommand(backup, 'BACKUPJOB_BACKUP', 'PUT', [['id', 'resource']])
  expectCommand(backup, 'BACKUPJOB_CANCEL', 'PUT', [['id', 'resource']])
  expectCommand(backup, 'BACKUPJOB_RETRY', 'PUT', [['id', 'resource']])
})

test('LayerSentry client mutations stay bound to the corresponding OpenNebula actions', () => {
  const vm = read('src/modules/features/OneApi/vm.js')
  const template = read('src/modules/features/OneApi/vmTemplate.js')
  const image = read('src/modules/features/OneApi/image.js')
  const backup = read('src/modules/features/OneApi/backupjobs.js')

  for (const [endpoint, action] of [
    ['allocateVm', 'VM_ALLOCATE'],
    ['actionVm', 'VM_ACTION'],
    ['resize', 'VM_RESIZE'],
    ['attachDisk', 'VM_DISK_ATTACH'],
    ['detachDisk', 'VM_DISK_DETACH'],
    ['resizeDisk', 'VM_DISK_RESIZE'],
    ['attachNic', 'VM_NIC_ATTACH'],
    ['detachNic', 'VM_NIC_DETACH'],
    ['backup', 'VM_BACKUP'],
  ]) {
    expectClientAction(vm, endpoint, action)
  }

  expectClientAction(template, 'instantiateTemplate', 'TEMPLATE_INSTANTIATE')
  expectClientAction(template, 'cloneTemplate', 'TEMPLATE_CLONE')
  expectClientAction(template, 'removeTemplate', 'TEMPLATE_DELETE')

  expectClientAction(image, 'allocateImage', 'IMAGE_ALLOCATE')
  expectClientAction(image, 'removeImage', 'IMAGE_DELETE')
  expectClientAction(image, 'restoreBackup', 'IMAGE_RESTORE')

  expectClientAction(backup, 'allocateBackupJob', 'BACKUPJOB_ALLOCATE')
  expectClientAction(backup, 'startBackupJob', 'BACKUPJOB_BACKUP')
  expectClientAction(backup, 'cancelBackupJob', 'BACKUPJOB_CANCEL')
  expectClientAction(backup, 'retryBackupJob', 'BACKUPJOB_RETRY')
})

test('LayerSentry keeps mutation and data-safety API exposure fail closed', () => {
  const capabilities = read('src/client/apps/layersentry/capabilities.js')

  for (const capability of [
    'VM_CREATE',
    'STORAGE_DISK_ATTACH',
    'STORAGE_DISK_RESIZE',
    'STORAGE_DISK_DETACH',
    'STORAGE_IMAGE_DELETE',
    'NETWORK_CREATE',
    'BACKUP_RECOVERY_CREATE',
  ]) {
    assert.match(
      capabilities,
      new RegExp(`CAPABILITY_IDS\\.${capability}`),
      capability
    )
  }

  assert.match(capabilities, /const MUTATING_CAPABILITIES = new Set/)
  assert.match(capabilities, /const DATA_SAFETY_REQUIRED = new Set/)
  assert.match(
    capabilities,
    /DATA_SAFETY_REQUIRED\.has\(capabilityId\)[\s\S]*capability\.dataSafety !== true/
  )
  assert.match(
    capabilities,
    /MUTATING_CAPABILITIES\.has\(capabilityId\)[\s\S]*isCapabilityEnabled/
  )
})
