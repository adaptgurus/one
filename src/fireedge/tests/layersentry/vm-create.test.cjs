/* SPDX-License-Identifier: Apache-2.0 */
const { test, before } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')

let api

before(async () => {
  const source = readFileSync(
    resolve(__dirname, '../../src/modules/utils/layersentryVmCreation.js'),
    'utf8'
  )
  api = await import(
    'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
  )
})

const images = [
  { ID: 0, NAME: 'Rocky-9', FORMAT: 'qcow2', TYPE: 'OS' },
  { ID: 1, NAME: 'Alpine', FORMAT: 'qcow2', TYPE: 'OS' },
  { ID: 2, NAME: 'Raw image', FORMAT: 'raw', TYPE: 'OS' },
]

const template = (id, imageId, extra = {}) => ({
  ID: id,
  NAME: `template-${id}`,
  TEMPLATE: {
    HYPERVISOR: 'kvm',
    OS: { ARCH: 'x86_64' },
    DISK: { IMAGE_ID: String(imageId) },
    ...extra,
  },
})

test('OpenNebula template ID zero is a valid creation source', () => {
  assert.equal(api.hasTemplateId(0), true)
  assert.equal(api.hasTemplateId('0'), true)
  assert.equal(api.hasTemplateId(undefined), false)
  assert.equal(api.hasTemplateId(null), false)
  assert.equal(api.hasTemplateId(''), false)
})

test('customer template filter keeps only qcow2 KVM/x86_64 OS templates', () => {
  assert.equal(api.isLayerSentryCustomerTemplate(template(0, 0), images), true)
  assert.equal(api.isLayerSentryCustomerTemplate(template(1, 1), images), true)
  assert.equal(api.isLayerSentryCustomerTemplate(template(2, 2), images), false)
  assert.equal(api.isLayerSentryCustomerTemplate(template(3, 99), images), false)
  assert.equal(
    api.isLayerSentryCustomerTemplate(
      template(4, 0, { HYPERVISOR: 'vcenter' }),
      images
    ),
    false
  )
  assert.equal(
    api.isLayerSentryCustomerTemplate(
      template(5, 0, { OS: { ARCH: 'aarch64' } }),
      images
    ),
    false
  )
})

test('provider managed OneKS and virtual-router templates never enter VM create', () => {
  assert.equal(
    api.isLayerSentryCustomerTemplate(template(10, 0, { ONEKS: { TYPE: 'NodeGroup' } }), images),
    false
  )
  assert.equal(
    api.isLayerSentryCustomerTemplate(template(11, 0, { VROUTER: 'YES' }), images),
    false
  )
  assert.equal(
    api.isLayerSentryCustomerTemplate(
      template(12, 0, { CONTEXT: { ONEAPP_ONEKS_CLUSTER_NAME: 'cluster' } }),
      images
    ),
    false
  )
})

test('guest access defaults never emit a plain-text password', () => {
  const context = api.buildLayerSentryGuestContext(
    {
      NETWORK: 'NO',
      PASSWORD: 'old-plain',
      CRYPTED_PASSWORD: 'old-crypt',
      KEEP_ME: 'yes',
    },
    {
      username: 'clouduser',
      password: 'CorrectHorseBatteryStaple!',
      useAccountKey: true,
      sshPublicKey: 'ssh-ed25519 AAAATEST user@example',
    }
  )

  assert.equal(context.USERNAME, 'clouduser')
  assert.equal(context.NETWORK, 'YES')
  assert.equal(context.SET_HOSTNAME, '$NAME')
  assert.equal(context.GROW_FS, '/')
  assert.equal(context.KEEP_ME, 'yes')
  assert.equal(context.PASSWORD, undefined)
  assert.equal(context.CRYPTED_PASSWORD, undefined)
  assert.equal(
    Buffer.from(context.PASSWORD_BASE64, 'base64').toString('utf8'),
    'CorrectHorseBatteryStaple!'
  )
  assert.match(context.SSH_PUBLIC_KEY, /\$USER\[SSH_PUBLIC_KEY\]/)
  assert.match(context.SSH_PUBLIC_KEY, /ssh-ed25519 AAAATEST/)
})

test('blank password removes inherited password and defaults username to root', () => {
  const context = api.buildLayerSentryGuestContext(
    { PASSWORD_BASE64: 'stale', SSH_PUBLIC_KEY: 'stale-key' },
    { useAccountKey: false }
  )

  assert.equal(context.USERNAME, 'root')
  assert.equal(context.PASSWORD_BASE64, undefined)
  assert.equal(context.SSH_PUBLIC_KEY, undefined)
})

test('LayerSentry VM defaults force virtio networking without deleting template context', () => {
  const result = api.applyLayerSentryVmDefaults(
    {
      CONTEXT: { KEEP: 'yes' },
      NIC_DEFAULT: { FILTER: 'clean-traffic' },
    },
    { username: 'root' }
  )

  assert.equal(result.CONTEXT.KEEP, 'yes')
  assert.equal(result.CONTEXT.NETWORK, 'YES')
  assert.equal(result.NIC_DEFAULT.MODEL, 'virtio')
  assert.equal(result.NIC_DEFAULT.FILTER, 'clean-traffic')
})

test('clone source filter excludes OneKS and virtual-router VMs', () => {
  assert.equal(api.isLayerSentryCloneSource({ ID: 54, USER_TEMPLATE: {} }), true)
  assert.equal(
    api.isLayerSentryCloneSource({ ID: 48, USER_TEMPLATE: { ONEKS: { TYPE: 'NodeGroup' } } }),
    false
  )
  assert.equal(api.isLayerSentryCloneSource({ ID: 42, VROUTER_ID: 3 }), false)
})

test('full native VM clone is allowed only in POWEROFF state', () => {
  assert.equal(api.canCloneVm({ STATE: 8 }), true)
  assert.equal(api.canCloneVm({ STATE: '8' }), true)
  assert.equal(api.canCloneVm({ STATE: 3 }), false)
})

test('save-as-template response parser accepts common API message shapes', () => {
  assert.equal(api.parseSavedTemplateId('Template ID: 71'), 71)
  assert.equal(api.parseSavedTemplateId({ message: 'VM saved as template 72' }), 72)
  assert.equal(api.parseSavedTemplateId({ id: 73 }), 73)
  assert.equal(api.parseSavedTemplateId({ ok: true }), undefined)
})

test('instantiate source uses explicit ID guard and strips access secrets from request', () => {
  const source = readFileSync(
    resolve(__dirname, '../../src/modules/containers/VmTemplates/Instantiate.js'),
    'utf8'
  )

  assert.match(source, /hasTemplateId\(templateId\)/)
  assert.doesNotMatch(source, /if\s*\(\s*!templateId/)
  assert.match(source, /delete requestTemplate\.access/)
  assert.match(source, /applyLayerSentryVmDefaults/)
  assert.match(source, /URLSearchParams\(location\.search\)/)
  assert.match(source, /queryTemplateId/)
})

test('VM create selector is separated into approved templates and VM clone tabs', () => {
  const source = readFileSync(
    resolve(__dirname, '../../src/modules/containers/VirtualMachines/Create.js'),
    'utf8'
  )

  assert.match(source, /From template/)
  assert.match(source, /Clone existing VM/)
  assert.match(source, /isLayerSentryCustomerTemplate/)
  assert.match(source, /isLayerSentryCloneSource/)
  assert.match(source, /\?template=\$\{encodeURIComponent\(template\.ID\)\}/)
  assert.doesNotMatch(source, /columns=\{vmtemplateTable\.columns\(\)\}/)
})
