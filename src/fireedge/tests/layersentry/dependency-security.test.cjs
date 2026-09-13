/* SPDX-License-Identifier: Apache-2.0 */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const fireedgeRoot = path.join(__dirname, '../..')
const pkg = JSON.parse(
  fs.readFileSync(path.join(fireedgeRoot, 'package.json'), 'utf8')
)
const lock = JSON.parse(
  fs.readFileSync(path.join(fireedgeRoot, 'package-lock.json'), 'utf8')
)
const logoSource = fs.readFileSync(
  path.join(fireedgeRoot, 'src/server/utils/logo.js'),
  'utf8'
)

const locked = (name) => lock.packages?.[`node_modules/${name}`]?.version

test('FireEdge dependency security contract remains on qualified versions', () => {
  assert.equal(pkg.engines?.node, '>=22')

  const runtime = {
    '@babel/core': '7.29.7',
    'babel-loader': '9.2.1',
    compression: '1.8.2',
    'copy-webpack-plugin': '14.0.0',
    'fast-xml-parser': '5.11.1',
    'http-proxy-middleware': '3.0.7',
    jimp: '1.6.1',
    morgan: '1.12.1',
    'terser-webpack-plugin': '5.6.1',
    uuid: '11.1.1',
    'webpack-cli': '5.1.4',
    yaml: '1.10.3',
  }

  for (const [name, version] of Object.entries(runtime)) {
    assert.equal(pkg.dependencies?.[name], version, `${name} manifest drift`)
    assert.equal(locked(name), version, `${name} lock drift`)
  }

  assert.equal(
    pkg.devDependencies?.['eslint-import-resolver-webpack'],
    '0.13.11'
  )
  assert.equal(pkg.devDependencies?.['webpack-dev-middleware'], '5.3.4')
  assert.equal(locked('eslint-import-resolver-webpack'), '0.13.11')
  assert.equal(locked('webpack-dev-middleware'), '5.3.4')
  assert.equal(locked('flatted'), '3.4.4')
  assert.equal(locked('js-yaml'), '3.15.2')
  assert.equal(pkg.overrides?.qs, '6.16.0')
  assert.equal(
    pkg.overrides?.['eslint-config-opennebula']?.['@babel/core'],
    '7.29.7'
  )
})

test('Jimp v1 logo handling cannot regress to removed APIs', () => {
  assert.match(
    logoSource,
    /const \{ Jimp, JimpMime \} = require\('jimp'\)/
  )
  assert.match(logoSource, /getBuffer\(JimpMime\.png\)/)
  assert.match(logoSource, /resize\(\{ w: 32, h: 32 \}\)/)
  assert.doesNotMatch(
    logoSource,
    /getBufferAsync|Jimp\.MIME_PNG|resize\(32,\s*32\)/
  )
})
