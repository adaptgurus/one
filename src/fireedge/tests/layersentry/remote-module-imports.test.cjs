/* SPDX-License-Identifier: Apache-2.0 */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync, readdirSync, statSync } = require('node:fs')
const { join, relative, resolve } = require('node:path')

const root = resolve(__dirname, '../../src/modules')

const jsFiles = (dir) =>
  readdirSync(dir)
    .flatMap((name) => {
      const full = join(dir, name)
      return statSync(full).isDirectory() ? jsFiles(full) : [full]
    })
    .filter((file) => file.endsWith('.js'))

test('federated modules import useViews from FeaturesModule, never ComponentsModule', () => {
  const offenders = []

  for (const file of jsFiles(root)) {
    const source = readFileSync(file, 'utf8')
    const componentImports = source.matchAll(
      /import\s*\{([^}]*)\}\s*from\s*['"]@ComponentsModule['"]/g
    )

    for (const match of componentImports) {
      if (/\buseViews\b/.test(match[1])) {
        offenders.push(relative(root, file))
      }
    }
  }

  assert.deepEqual(offenders, [])
})

test('virtual machine details uses federated-safe useViews import', () => {
  const file = resolve(
    root,
    'containers/VirtualMachines/Details/single.js'
  )
  const source = readFileSync(file, 'utf8')

  assert.match(
    source,
    /import\s*\{[^}]*\buseViews\b[^}]*\}\s*from\s*['"]@FeaturesModule['"]/
  )
})
