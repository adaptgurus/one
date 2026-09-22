/* SPDX-License-Identifier: Apache-2.0 */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const fireedgeRoot = path.join(__dirname, '../..')

test('federated remote declarations and production build targets stay in lockstep', () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(fireedgeRoot, 'package.json'), 'utf8')
  )
  const remotesConfig = fs.readFileSync(
    path.join(fireedgeRoot, 'etc', 'sunstone', 'remotes-config.yaml'),
    'utf8'
  )

  const declared = new Set(
    [...remotesConfig.matchAll(/^([A-Za-z][A-Za-z0-9]*Module):\s*$/gm)].map(
      ([, name]) => name
    )
  )

  const built = new Set()
  for (const [name, command] of Object.entries(packageJson.scripts ?? {})) {
    if (!name.startsWith('build:') || name === 'build:remotes') continue

    const match = String(command).match(
      /dist\/modules\/([A-Za-z][A-Za-z0-9]*Module)/
    )

    if (match) built.add(match[1])
  }

  assert.deepEqual(
    [...built].sort(),
    [...declared].sort(),
    'every configured remote must have a production build target and vice versa'
  )

  const aggregate = String(packageJson.scripts?.['build:remotes'] ?? '')
  assert.ok(aggregate, 'build:remotes script must exist')

  for (const [name, command] of Object.entries(packageJson.scripts ?? {})) {
    if (!name.startsWith('build:') || name === 'build:remotes') continue
    if (!/dist\/modules\/[A-Za-z][A-Za-z0-9]*Module/.test(String(command))) {
      continue
    }

    assert.ok(
      aggregate.includes('npm run ' + name),
      'build:remotes must invoke ' + name
    )
  }
})
