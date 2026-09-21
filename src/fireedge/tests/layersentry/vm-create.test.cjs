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
  assert.equal(
    api.isLayerSentryCustomerTemplate(template(3, 99), images),
    false
  )
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
    api.isLayerSentryCustomerTemplate(
      template(10, 0, { ONEKS: { TYPE: 'NodeGroup' } }),
      images
    ),
    false
  )
  assert.equal(
    api.isLayerSentryCustomerTemplate(
      template(11, 0, { VROUTER: 'YES' }),
      images
    ),
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
  assert.equal(
    api.isLayerSentryCloneSource({ ID: 54, USER_TEMPLATE: {} }),
    true
  )
  assert.equal(
    api.isLayerSentryCloneSource({
      ID: 48,
      USER_TEMPLATE: { ONEKS: { TYPE: 'NodeGroup' } },
    }),
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
  assert.equal(
    api.parseSavedTemplateId({ message: 'VM saved as template 72' }),
    72
  )
  assert.equal(api.parseSavedTemplateId({ id: 73 }), 73)
  assert.equal(api.parseSavedTemplateId({ ok: true }), undefined)
})

test('instantiate source uses explicit ID guard and strips access secrets from request', () => {
  const source = readFileSync(
    resolve(
      __dirname,
      '../../src/modules/containers/VmTemplates/Instantiate.js'
    ),
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
    resolve(
      __dirname,
      '../../src/modules/containers/VirtualMachines/Create.js'
    ),
    'utf8'
  )

  assert.match(source, /From template/)
  assert.match(source, /Clone existing VM/)
  assert.match(source, /isLayerSentryCustomerTemplate/)
  assert.match(source, /isLayerSentryCloneSource/)
  assert.match(source, /\?template=\$\{encodeURIComponent\(template\.ID\)\}/)
  assert.doesNotMatch(source, /columns=\{vmtemplateTable\.columns\(\)\}/)
})

test('cloud resource request creates only a simple data disk and selected network', () => {
  const result = api.applyLayerSentryCloudResources(
    { DISK: { IMAGE_ID: '0' } },
    {
      dataDiskEnabled: true,
      dataDiskSizeGb: 100,
      networkId: '0',
      ipAssignment: 'AUTO',
      networkQosEnabled: false,
    },
    { storageIopsSupported: false }
  )

  assert.equal(result.DISK.length, 2)
  assert.deepEqual(result.DISK[1], {
    TYPE: 'fs',
    SIZE: '102400',
    FORMAT: 'qcow2',
    DEV_PREFIX: 'vd',
    FS: 'ext4',
  })
  assert.deepEqual(result.NIC, [{ NETWORK_ID: '0', MODEL: 'virtio' }])
})

test('data-disk policy is OS-aware while hiding format and filesystem from customers', () => {
  const linux = api.getLayerSentryDataDiskPolicy({ NAME: 'Rocky Linux 9' })
  assert.equal(linux.osFamily, 'LINUX')
  assert.equal(linux.format, 'qcow2')
  assert.equal(linux.fs, 'ext4')
  assert.equal(linux.devPrefix, 'vd')

  const windows = api.getLayerSentryDataDiskPolicy({
    NAME: 'Windows Server 2025',
  })
  assert.equal(windows.osFamily, 'WINDOWS')
  assert.equal(windows.format, 'qcow2')
  assert.equal(windows.fs, undefined)

  const result = api.applyLayerSentryCloudResources(
    {},
    { dataDiskEnabled: true, dataDiskSizeGb: 20, networkId: '0' },
    { sourceTemplate: { NAME: 'Windows Server 2025' } }
  )
  assert.equal(result.DISK[0].FS, undefined)
  assert.equal(result.DISK[0].SIZE, '20480')
})

test('accelerated provider network becomes an automatic PCI NIC without raw PCI input', () => {
  const network = {
    ID: '9',
    NAME: 'LowLatency-LAN',
    TEMPLATE: {
      LAYERSENTRY_NETWORK_MODE: 'SRIOV',
      LAYERSENTRY_PCI_CLASS: '0200',
      LAYERSENTRY_PCI_VENDOR: '15b3',
    },
  }
  const result = api.applyLayerSentryCloudResources(
    {},
    { networkId: '9', ipAssignment: 'AUTO', networkQosEnabled: false },
    { network }
  )

  assert.equal(result.NIC, undefined)
  assert.deepEqual(result.PCI, [
    { TYPE: 'NIC', NETWORK: 'LowLatency-LAN', CLASS: '0200', VENDOR: '15b3' },
  ])
  assert.throws(
    () =>
      api.applyLayerSentryCloudResources(
        {},
        { networkId: '9', networkQosEnabled: true, networkSpeedMbps: 500 },
        { network }
      ),
    /not available on this accelerated network/
  )
})

test('storage IOPS is accepted only for provider-approved storage', () => {
  const request = {
    dataDiskEnabled: true,
    dataDiskSizeGb: 50,
    storageIopsEnabled: true,
    storageIops: 7000,
    networkId: '0',
  }

  const blocked = api.applyLayerSentryCloudResources({}, request, {
    storageIopsSupported: false,
  })
  assert.equal(blocked.DISK[0].TOTAL_IOPS_SEC, undefined)

  const allowed = api.applyLayerSentryCloudResources({}, request, {
    storageIopsSupported: true,
  })
  assert.equal(allowed.DISK[0].TOTAL_IOPS_SEC, '7000')
})

test('network speed is translated to symmetric OpenNebula bandwidth QoS', () => {
  const result = api.applyLayerSentryCloudResources(
    {},
    {
      networkId: '0',
      ipAssignment: 'STATIC',
      staticIp: '10.10.10.141',
      networkQosEnabled: true,
      networkSpeedMbps: 500,
    }
  )

  assert.equal(result.NIC[0].IP, '10.10.10.141')
  assert.equal(result.NIC[0].INBOUND_AVG_BW, '62500')
  assert.equal(result.NIC[0].OUTBOUND_AVG_BW, '62500')
  assert.equal(result.NIC[0].PCI, undefined)
})

test('cloud resource request rejects invalid network and static IP values', () => {
  assert.throws(
    () => api.applyLayerSentryCloudResources({}, { networkId: 'not-an-id' }),
    /valid LayerSentry network/
  )
  assert.throws(
    () =>
      api.applyLayerSentryCloudResources(
        {},
        { networkId: '0', ipAssignment: 'STATIC', staticIp: '999.1.1.1' }
      ),
    /valid static IPv4/
  )
})

test('cloud view hides provider-only VM controls and derives CPU at two-to-one', () => {
  const templateView = readFileSync(
    resolve(__dirname, '../../etc/sunstone/views/cloud/vm-template-tab.yaml'),
    'utf8'
  )
  const vmView = readFileSync(
    resolve(__dirname, '../../etc/sunstone/views/cloud/vm-tab.yaml'),
    'utf8'
  )

  assert.match(templateView, /hide_cpu: true/)
  assert.match(templateView, /cpu_factor: 0\.5/)
  assert.match(templateView, /ownership: false/)
  assert.match(templateView, /vm_group: false/)
  assert.match(templateView, /network: false/)
  assert.match(templateView, /storage: false/)
  assert.match(templateView, /placement: false/)
  assert.match(templateView, /sched_action: false/)
  assert.match(templateView, /booting: false/)
  assert.match(vmView, /pci:\n\s+enabled: false/)
  assert.match(vmView, /sched_actions:\n\s+enabled: false/)
})

test('cloud instantiate flow is customer-only and strips helper data', () => {
  const steps = readFileSync(
    resolve(
      __dirname,
      '../../src/modules/resources/VmTemplate/Forms/InstantiateForm/Steps/index.js'
    ),
    'utf8'
  )
  const basic = readFileSync(
    resolve(
      __dirname,
      '../../src/modules/resources/VmTemplate/Forms/InstantiateForm/Steps/BasicConfiguration/schema.js'
    ),
    'utf8'
  )
  const instantiate = readFileSync(
    resolve(
      __dirname,
      '../../src/modules/containers/VmTemplates/Instantiate.js'
    ),
    'utf8'
  )

  assert.match(steps, /selfService.*AccessConfiguration/s)
  assert.match(steps, /selfService.*CloudResources/s)
  assert.match(steps, /selfService.*CloudOptionalServices/s)
  assert.match(steps, /!selfService.*ExtraConfiguration/s)
  assert.match(basic, /'name', 'instances'/)
  assert.match(basic, /required\('Enter a VM name'\)/)
  assert.match(instantiate, /applyLayerSentryCloudResources/)
  assert.match(instantiate, /useLazyGetVNetworkQuery/)
  assert.match(instantiate, /delete requestTemplate\.resources/)
  assert.match(instantiate, /delete requestTemplate\.services/)
})


test('VM source selection hands off to the qualified instantiate route', () => {
  const create = readFileSync(
    resolve(
      __dirname,
      '../../src/modules/containers/VirtualMachines/Create.js'
    ),
    'utf8'
  )
  const capabilities = readFileSync(
    resolve(
      __dirname,
      '../../src/client/apps/layersentry/capabilities.js'
    ),
    'utf8'
  )

  assert.match(create, /PATH\.TEMPLATE\.VMS\.INSTANTIATE/)
  assert.match(
    capabilities,
    /\['\/vm-template\/instantiate', CAPABILITY_IDS\.VM_CREATE\]/
  )
})


test('Compute workspace exposes one Create VM action', () => {
  const compute = readFileSync(
    resolve(
      __dirname,
      '../../src/client/apps/layersentry/pages/ComputeWorkspace.js'
    ),
    'utf8'
  )

  assert.equal((compute.match(/>\s*Create VM\s*</g) || []).length, 1)
  assert.match(compute, /CAPABILITY_IDS\.VM_CREATE/)
})


test('hidden schema field types never return undefined from FieldComponent', () => {
  const formWithSchema = readFileSync(
    resolve(
      __dirname,
      '../../src/modules/components/composed/Forms/FormWithSchema/index.js'
    ),
    'utf8'
  )
  const resources = readFileSync(
    resolve(
      __dirname,
      '../../src/modules/resources/VmTemplate/Forms/InstantiateForm/Steps/CloudResources/schema.js'
    ),
    'utf8'
  )

  assert.match(resources, /type:\s*storageIopsSupported\(vmTemplate\)\s*\?\s*enabledSwitch\s*:\s*INPUT_TYPES\.HIDDEN/)
  assert.match(
    formWithSchema,
    /type\s*===\s*INPUT_TYPES\.HIDDEN\s*\|\|\s*htmlType\s*===\s*INPUT_TYPES\.HIDDEN/
  )
  assert.match(formWithSchema, /if \(isHidden\) return null/)
})


test('cloud network options are resolved from the React resource step', () => {
  const schema = readFileSync(
    resolve(
      __dirname,
      '../../src/modules/resources/VmTemplate/Forms/InstantiateForm/Steps/CloudResources/schema.js'
    ),
    'utf8'
  )
  const content = readFileSync(
    resolve(
      __dirname,
      '../../src/modules/resources/VmTemplate/Forms/InstantiateForm/Steps/CloudResources/index.js'
    ),
    'utf8'
  )

  assert.doesNotMatch(schema, /useGetVNetworksQuery/)
  assert.match(schema, /const NETWORK_ID = \(networks = \[\]\)/)
  assert.match(schema, /SECTIONS\(vmTemplate, networks\)/)
  assert.match(content, /VnAPI\.useGetVNetworksQuery\(\)/)
  assert.match(content, /SECTIONS\(vmTemplate, networks\)/)
})


test('controlled dropdown keeps MUI open state synchronized', () => {
  const dropdown = readFileSync(
    resolve(
      __dirname,
      '../../src/modules/components/primitives/Dropdown/Default/index.js'
    ),
    'utf8'
  )

  assert.match(dropdown, /open=\{open\}/)
  assert.match(dropdown, /onOpen=\{\(\) => setOpen\(true\)\}/)
  assert.match(dropdown, /onClose=\{\(\) => setOpen\(false\)\}/)
  assert.doesNotMatch(dropdown, /setOpen\(\(prev\) => !prev\)/)
})
