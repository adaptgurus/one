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
const { before, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')

let api

before(async () => {
  const source = readFileSync(
    resolve(
      __dirname,
      '../../src/client/apps/layersentry/layersentryNetworkCreation.js'
    ),
    'utf8'
  )
  api = await import(
    'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
  )
})

const blueprint = {
  ID: '4',
  NAME: 'qualified-fw-network',
  TEMPLATE: {
    LAYERSENTRY_APPROVED: 'YES',
    LAYERSENTRY_ENVIRONMENTS: 'DEV,UAT',
    VN_MAD: 'fw',
    BRIDGE: 'br0',
  },
}
const groups = [
  {
    ID: '11',
    NAME: 'dev-isolated',
    TEMPLATE: {
      LAYERSENTRY_APPROVED: 'YES',
      LAYERSENTRY_ISOLATION_POLICY: 'ISOLATED',
      LAYERSENTRY_ENVIRONMENTS: 'DEV,UAT',
      RULE: {
        PROTOCOL: 'UDP',
        RULE_TYPE: 'OUTBOUND',
        IP: '10.20.30.2',
        SIZE: '1',
        RANGE: '53',
      },
    },
  },
]
const request = {
  name: 'dev_app_network',
  description: 'Development application segment',
  environment: 'DEV',
  tier: 'APP',
  cidr: '10.20.30.0/24',
  gateway: '10.20.30.1',
  dns: '10.20.30.2 10.20.30.3',
  rangeStart: '10.20.30.20',
  rangeEnd: '10.20.30.39',
  isolationPolicy: 'ISOLATED',
  securityGroupId: '11',
}

test('simple network creation accepts only provider-approved native blueprints', () => {
  assert.equal(api.isLayerSentryNetworkBlueprint(blueprint), true)
  assert.equal(
    api.isLayerSentryNetworkBlueprint({ TEMPLATE: { VN_MAD: 'fw' } }),
    false
  )
  assert.equal(
    api.isLayerSentryNetworkBlueprint({
      TEMPLATE: { LAYERSENTRY_APPROVED: 'YES' },
    }),
    false
  )
})

test('communication policy requires an exact approved native Security Group', () => {
  assert.equal(
    api.isLayerSentrySecurityGroupCompatible(groups[0], 'ISOLATED', 'DEV'),
    true
  )
  assert.equal(
    api.isLayerSentrySecurityGroupCompatible(
      groups[0],
      'SAME_ENVIRONMENT',
      'DEV'
    ),
    false
  )
  assert.equal(
    api.isLayerSentrySecurityGroupCompatible(
      { ID: '12', TEMPLATE: { LAYERSENTRY_ISOLATION_POLICY: 'ISOLATED' } },
      'ISOLATED',
      'DEV'
    ),
    false
  )
  assert.equal(
    api.isLayerSentrySecurityGroupCompatible(
      {
        ...groups[0],
        TEMPLATE: {
          ...groups[0].TEMPLATE,
          RULE: { PROTOCOL: 'ALL', RULE_TYPE: 'OUTBOUND' },
        },
      },
      'ISOLATED',
      'DEV'
    ),
    false
  )
})

test('simple network overlay is bounded and leaves provider fields in blueprint', () => {
  const result = api.buildLayerSentryNetworkOverlay(
    request,
    blueprint,
    groups
  )

  assert.equal(result.name, 'dev_app_network')
  assert.equal(result.template.LAYERSENTRY_ENVIRONMENT, 'DEV')
  assert.equal(result.template.LAYERSENTRY_TIER, 'APP')
  assert.equal(result.template.NETWORK_ADDRESS, '10.20.30.0')
  assert.equal(result.template.NETWORK_MASK, '255.255.255.0')
  assert.deepEqual(result.template.AR, {
    TYPE: 'IP4',
    IP: '10.20.30.20',
    SIZE: '20',
  })
  assert.equal(result.template.SECURITY_GROUPS, '11')
  assert.equal(result.template.VN_MAD, undefined)
  assert.equal(result.template.BRIDGE, undefined)
  assert.equal(result.template.VLAN_ID, undefined)
})

test('simple network overlay rejects cross-environment and unknown firewall ownership', () => {
  assert.throws(
    () =>
      api.buildLayerSentryNetworkOverlay(
        { ...request, environment: 'PROD' },
        blueprint,
        groups
      ),
    /not approved for this environment/
  )
  assert.throws(
    () =>
      api.buildLayerSentryNetworkOverlay(
        { ...request, securityGroupId: '999' },
        blueprint,
        groups
      ),
    /available firewall rule set/
  )
})

test('simple network overlay rejects invalid or out-of-range addressing', () => {
  assert.throws(
    () =>
      api.buildLayerSentryNetworkOverlay(
        { ...request, cidr: '10.20.30.0/31' },
        blueprint,
        groups
      ),
    /between \/8 and \/30/
  )
  assert.throws(
    () =>
      api.buildLayerSentryNetworkOverlay(
        { ...request, rangeEnd: '10.20.31.20' },
        blueprint,
        groups
      ),
    /inside the CIDR/
  )
  assert.throws(
    () =>
      api.buildLayerSentryNetworkOverlay(
        { ...request, rangeStart: '10.20.30.40' },
        blueprint,
        groups
      ),
    /must not precede/
  )
})

test('network dialog uses typed template instantiation and authoritative readback', () => {
  const source = readFileSync(
    resolve(
      __dirname,
      '../../src/client/apps/layersentry/components/SimpleNetworkCreateDialog.js'
    ),
    'utf8'
  )

  assert.match(source, /useInstantiateVNTemplateMutation/)
  assert.match(source, /useUpdateVNetMutation/)
  assert.match(source, /useLazyGetVNetworkQuery/)
  assert.match(source, /buildLayerSentryNetworkOverlay/)
  assert.match(source, /jsonToXml\(request\.template\)/)
  assert.match(source, /authoritative readback is not yet complete/)
  assert.match(source, /observed\?\.TEMPLATE\?\.SECURITY_GROUPS/)
  assert.match(source, /observed\?\.VN_MAD/)
  assert.match(source, /observed\?\.AR_POOL\?\.AR/)
  assert.match(source, /A network with this name already exists/)
  assert.match(source, /Do not submit another create request/)
  assert.match(source, /SECURITY_GROUPS: request\.template\.SECURITY_GROUPS/)
  assert.match(
    source,
    /disabled=\{instantiateState\.isLoading \|\| updateState\.isLoading\}/
  )
  assert.doesNotMatch(source, /label="(?:VN_MAD|VLAN_ID|PHYDEV)"/)
})
