/* SPDX-License-Identifier: Apache-2.0 */
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const remotesConfig = path.join(root, 'etc', 'sunstone', 'remotes-config.yaml')
const distModules = path.join(root, 'dist', 'modules')

const source = fs.readFileSync(remotesConfig, 'utf8')
const remotes = [...source.matchAll(/^([A-Za-z][A-Za-z0-9]*Module):\s*$/gm)].map(
  ([, name]) => name
)

if (remotes.length === 0) {
  throw new Error('No federated remotes declared in remotes-config.yaml')
}

const seen = new Set()
for (const remote of remotes) {
  if (seen.has(remote)) {
    throw new Error(`Duplicate remote declaration: ${remote}`)
  }
  seen.add(remote)

  const entry = path.join(distModules, remote, 'remoteEntry.js')
  if (!fs.existsSync(entry)) {
    throw new Error(`Missing federated remote artifact: ${entry}`)
  }

  const stat = fs.statSync(entry)
  if (!stat.isFile() || stat.size < 100) {
    throw new Error(`Invalid federated remote artifact: ${entry}`)
  }

  const prefix = fs.readFileSync(entry, 'utf8').slice(0, 512)
  if (/^\s*<!doctype html/i.test(prefix) || /^\s*<html/i.test(prefix)) {
    throw new Error(`Federated remote resolved to HTML instead of JavaScript: ${entry}`)
  }

  if (!prefix.includes(remote)) {
    throw new Error(
      `Federated remote entry does not identify expected container ${remote}: ${entry}`
    )
  }
}

process.stdout.write(
  `Federation artifact verification PASS: ${remotes.length} remotes\n`
)
