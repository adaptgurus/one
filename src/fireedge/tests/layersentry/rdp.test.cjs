/* SPDX-License-Identifier: Apache-2.0 */
const { test } = require('node:test')
const assert = require('node:assert/strict')

const defaults = require('../../src/server/utils/constants/defaults')

test('RDP mapping omits fields that make mstsc reject the generated file', () => {
  assert.equal(defaults.keysRDP.password, undefined)
  assert.equal(defaults.keysRDP['server-layout'], undefined)
})

test('RDP audio input uses the Windows integer property type', () => {
  assert.equal(
    defaults.keysRDP['enable-audio-input']?.key,
    'redirectaudiocapture:i:'
  )
})

test('typical Guacamole RDP settings cannot recreate invalid password or keyboard lines', () => {
  const connection = {
    hostname: '10.0.0.25',
    port: 3389,
    username: 'customer',
    password: '',
    'server-layout': 'en-us-qwerty',
    'enable-audio-input': true,
  }

  const lines = Object.entries(connection).flatMap(([name, value]) => {
    const mapping = defaults.keysRDP[name]
    if (!mapping) return []

    return [`${mapping.key}${value ?? mapping.value ?? ''}`]
  })

  assert.equal(lines.some((line) => line.startsWith('password 51:b:')), false)
  assert.equal(lines.some((line) => line.startsWith('keyboard layout:')), false)
  assert.equal(
    lines.some((line) => line.startsWith('redirectaudiocapture:i:')),
    true
  )
})
