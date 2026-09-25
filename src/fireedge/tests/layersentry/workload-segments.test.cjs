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
const { dirname, resolve } = require('node:path')
const Module = require('node:module')
const babel = require('@babel/core')

const fireedgeRoot = resolve(__dirname, '../..')
const modelFile = resolve(
  fireedgeRoot,
  'src/client/apps/layersentry/networkSegments.js'
)

const loadEsModuleAsCommonJs = (file) => {
  const source = readFileSync(file, 'utf8')
  const { code } = babel.transformSync(source, {
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

  return compiled.exports
}

const api = loadEsModuleAsCommonJs(modelFile)

const validSegment = (overrides = {}) => ({
  ...api.createSegmentDraft({ environment: 'prod', tier: 'web' }),
  name: 'prod_web_network',
  vlanId: '220',
  cidr: '10.20.20.0/24',
  gateway: '10.20.20.1',
  dns: '10.20.20.53',
  firstIp: '10.20.20.10',
  rangeSize: '50',
  ...overrides,
})

test('standard workload set creates Web App and DB segments', () => {
  const segments = api.createStandardSegmentSet('uat')

  assert.deepEqual(
    segments.map(({ name }) => name),
    ['uat_web_network', 'uat_app_network', 'uat_db_network']
  )
  assert.ok(segments.every(({ mode }) => mode === api.SEGMENT_MODES.VLAN))
  assert.ok(segments.every(({ parent }) => parent === 'br0'))
})

test('workload-segment validation accepts a non-overlapping production batch', () => {
  const segments = [
    validSegment(),
    validSegment({
      name: 'prod_app_network',
      tier: 'app',
      vlanId: '221',
      cidr: '10.20.21.0/24',
      gateway: '10.20.21.1',
      dns: '10.20.21.53',
      firstIp: '10.20.21.10',
    }),
    validSegment({
      name: 'prod_db_network',
      tier: 'db',
      vlanId: '222',
      cidr: '10.20.22.0/24',
      gateway: '10.20.22.1',
      dns: '10.20.22.53',
      firstIp: '10.20.22.10',
    }),
  ]

  const result = api.validateWorkloadSegments(segments)

  assert.equal(result.valid, true)
  assert.deepEqual(result.batchErrors, [])
  assert.ok(result.rowErrors.every((errors) => !Object.keys(errors).length))
})

test('workload-segment validation rejects overlapping CIDRs and duplicate VLANs', () => {
  const result = api.validateWorkloadSegments([
    validSegment(),
    validSegment({
      name: 'prod_app_network',
      tier: 'app',
      vlanId: '220',
      cidr: '10.20.20.128/25',
      gateway: '10.20.20.129',
      firstIp: '10.20.20.140',
      rangeSize: '10',
    }),
  ])

  assert.equal(result.valid, false)
  assert.match(result.rowErrors[0].cidr, /overlaps/)
  assert.match(result.rowErrors[1].cidr, /overlaps/)
  assert.match(result.rowErrors[0].vlanId, /unique/)
  assert.match(result.rowErrors[1].vlanId, /unique/)
})

test('workload-segment validation refuses an IP range outside usable CIDR', () => {
  const result = api.validateWorkloadSegments([
    validSegment({
      cidr: '192.0.2.0/29',
      gateway: '192.0.2.1',
      firstIp: '192.0.2.6',
      rangeSize: '2',
    }),
  ])

  assert.equal(result.valid, false)
  assert.match(result.rowErrors[0].firstIp, /fit inside usable CIDR/)
})

test('VLAN segment compiles to native OpenNebula 802.1Q VNet attributes', () => {
  const template = api.compileWorkloadSegment(validSegment())

  assert.deepEqual(template, {
    NAME: 'prod_web_network',
    VN_MAD: '802.1Q',
    NETWORK_ADDRESS: '10.20.20.0',
    NETWORK_MASK: '255.255.255.0',
    GATEWAY: '10.20.20.1',
    DNS: '10.20.20.53',
    LAYERSENTRY_SEGMENT: 'YES',
    LAYERSENTRY_ENVIRONMENT: 'prod',
    LAYERSENTRY_TIER: 'web',
    AR: {
      TYPE: 'IP4',
      IP: '10.20.20.10',
      SIZE: '50',
    },
    PHYDEV: 'br0',
    VLAN_ID: '220',
  })
})

test('bridge segment preserves custom bridge and tagged VLAN policy', () => {
  const template = api.compileWorkloadSegment(
    validSegment({
      mode: api.SEGMENT_MODES.BRIDGE,
      bridge: 'br-workloads',
      taggedVlans: '220-222,230',
      vlanId: '',
    })
  )

  assert.equal(template.VN_MAD, 'bridge')
  assert.equal(template.BRIDGE, 'br-workloads')
  assert.equal(template.VLAN_TAGGED_ID, '220-222,230')
  assert.equal(template.PHYDEV, undefined)
  assert.equal(template.VLAN_ID, undefined)
})

test('LayerSentry UI exposes multi-segment workflow and native allocation', () => {
  const page = readFileSync(
    resolve(
      fireedgeRoot,
      'src/client/apps/layersentry/pages/WorkloadSegmentsWizard.js'
    ),
    'utf8'
  )
  const workspace = readFileSync(
    resolve(
      fireedgeRoot,
      'src/client/apps/layersentry/pages/NetworkWorkspace.js'
    ),
    'utf8'
  )
  const portal = readFileSync(
    resolve(fireedgeRoot, 'src/client/apps/layersentry/Portal.js'),
    'utf8'
  )
  const capabilities = readFileSync(
    resolve(fireedgeRoot, 'src/client/apps/layersentry/capabilities.js'),
    'utf8'
  )

  for (const label of [
    'Create workload segments',
    'Add segment',
    'VLAN ID',
    'IPv4 CIDR',
    'Gateway',
    'DNS',
    'First workload IP',
    'IP count',
  ]) {
    assert.ok(page.includes(label), `missing GUI field: ${label}`)
  }

  assert.match(page, /VnAPI\.useAllocateVnetMutation\(\)/)
  assert.match(page, /jsonToXml\(compileWorkloadSegment\(segment\)\)/)
  assert.match(page, /for \(const segment of segments\)/)
  assert.doesNotMatch(page, /useRemoveVNetMutation/)
  assert.match(page, /does not automatically\s+delete them/)
  assert.match(workspace, /Create workload segments/)
  assert.match(workspace, /Create .* Web\/App\/DB segments/)
  assert.match(portal, /path="\/network\/segments\/create"/)
  assert.match(
    capabilities,
    /\['\/network\/segments\/create', CAPABILITY_IDS\.NETWORK_CREATE\]/
  )
})
