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
const cidrFile = resolve(
  fireedgeRoot,
  'src/modules/resources/VirtualNetwork/Forms/CreateForm/cidr.js'
)

const loadEsmSourceAsCommonJs = (file) => {
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

const { parseIpv4Cidr, ipv4CidrFromNetwork } = loadEsmSourceAsCommonJs(cidrFile)

test('LayerSentry IPv4 CIDR compiles to native OpenNebula context', () => {
  assert.deepEqual(parseIpv4Cidr('10.20.30.17/24'), {
    cidr: '10.20.30.0/24',
    networkAddress: '10.20.30.0',
    networkMask: '255.255.255.0',
    prefixLength: 24,
  })

  assert.deepEqual(parseIpv4Cidr('192.0.2.15/32'), {
    cidr: '192.0.2.15/32',
    networkAddress: '192.0.2.15',
    networkMask: '255.255.255.255',
    prefixLength: 32,
  })

  assert.deepEqual(parseIpv4Cidr('203.0.113.7/0'), {
    cidr: '0.0.0.0/0',
    networkAddress: '0.0.0.0',
    networkMask: '0.0.0.0',
    prefixLength: 0,
  })
})

test('LayerSentry IPv4 CIDR rejects invalid networks and masks', () => {
  for (const value of [
    '',
    '10.0.0.1',
    '10.0.0.1/33',
    '10.0.0.999/24',
    '10.0.0.1/-1',
    '10.0.0.1/24/extra',
  ]) {
    assert.equal(parseIpv4Cidr(value), undefined, value)
  }

  assert.equal(
    ipv4CidrFromNetwork('10.20.30.0', '255.255.255.0'),
    '10.20.30.0/24'
  )
  assert.equal(
    ipv4CidrFromNetwork('10.20.30.17', '255.255.255.0'),
    '10.20.30.0/24'
  )
  assert.equal(ipv4CidrFromNetwork('10.20.30.0', '255.0.255.0'), undefined)
})

test('Virtual Network create form wires CIDR without replacing native APIs', () => {
  const steps = readFileSync(
    resolve(
      fireedgeRoot,
      'src/modules/resources/VirtualNetwork/Forms/CreateForm/Steps/index.js'
    ),
    'utf8'
  )
  const context = readFileSync(
    resolve(
      fireedgeRoot,
      'src/modules/resources/VnTemplate/Forms/CreateForm/Steps/Configuration/context/schema.js'
    ),
    'utf8'
  )

  assert.match(steps, /isVnet:\s*true/)
  assert.match(steps, /parseIpv4Cidr\(extra\?\.NETWORK_CIDR\)/)
  assert.match(steps, /extra\.NETWORK_ADDRESS = cidr\.networkAddress/)
  assert.match(steps, /extra\.NETWORK_MASK = cidr\.networkMask/)
  assert.match(steps, /delete extra\.NETWORK_CIDR/)
  assert.match(context, /name:\s*'NETWORK_CIDR'/)
  assert.match(context, /label:\s*'IPv4 CIDR'/)
})
