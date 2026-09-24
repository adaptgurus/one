/* SPDX-License-Identifier: Apache-2.0 */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '../..')
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8')

test('OpenNebula hook client uses the qualified polling transport', () => {
  const client = read('src/modules/features/OneApi/socket.js')
  const server = read('src/server/routes/websockets/opennebula/index.js')

  assert.match(client, /transports:\s*\['polling'\]/)
  assert.match(client, /Socket\.IO's authenticated long-polling transport/)
  assert.match(client, /createWebsocket\(SOCKETS\.HOOKS/)
  assert.match(client, /socket\.open\(\)/)
  assert.doesNotMatch(server, /allowUpgrades:\s*false/)
})
