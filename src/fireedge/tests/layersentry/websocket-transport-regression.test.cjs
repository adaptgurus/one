/* SPDX-License-Identifier: Apache-2.0 */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '../..')
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8')

test('OpenNebula hooks do not advertise the unqualified WebSocket upgrade', () => {
  const server = read('src/server/routes/websockets/opennebula/index.js')
  const client = read('src/modules/features/OneApi/socket.js')

  assert.match(server, /allowUpgrades:\s*false/)
  assert.match(server, /Socket\.IO[\s\S]*long-polling/)
  assert.match(client, /createWebsocket\(SOCKETS\.HOOKS/)
  assert.match(client, /socket\.open\(\)/)
})
