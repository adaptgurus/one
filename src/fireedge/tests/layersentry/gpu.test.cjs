/* SPDX-License-Identifier: Apache-2.0 */
const { test, before } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')

let getPublishedGpuProfiles
let resolvePublishedGpuRequest

before(async () => {
  const source = readFileSync(
    resolve(__dirname, '../../src/modules/utils/layersentryGpu.js'),
    'utf8'
  )
  const module = await import(
    'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
  )
  getPublishedGpuProfiles = module.getPublishedGpuProfiles
  resolvePublishedGpuRequest = module.resolvePublishedGpuRequest
})

const template = {
  LAYERSENTRY_GPU_PROFILES: [
    {
      ID: 'nvidia-dedicated',
      LABEL: 'NVIDIA GPU - Dedicated',
      CLASS: '0302',
      VENDOR: '10DE',
      MAX_COUNT: '4',
      SHORT_ADDRESS: '81:00.0',
    },
    {
      ID: 'l40s-2b',
      LABEL: 'NVIDIA L40S 2B',
      CLASS: '0302',
      VENDOR: '10de',
      DEVICE: '26b9',
      PROFILE: '1146 (NVIDIA L40S-2B)',
      MAX_COUNT: '2',
    },
  ],
}

test('published profiles expose scheduler constraints but never physical PCI addresses', () => {
  const profiles = getPublishedGpuProfiles(template)
  assert.equal(profiles.length, 2)
  assert.deepEqual(profiles[0].pci, { CLASS: '0302', VENDOR: '10de' })
  assert.equal(profiles[0].pci.SHORT_ADDRESS, undefined)
  assert.equal(profiles[0].maxCount, 4)
})

test('vGPU profile is converted to the native OpenNebula PCI request shape', () => {
  const result = resolvePublishedGpuRequest(
    { PROFILE_ID: 'l40s-2b', COUNT: 2 },
    template
  )
  assert.equal(result.valid, true)
  assert.equal(result.requested, true)
  assert.deepEqual(result.pci, [
    {
      CLASS: '0302',
      VENDOR: '10de',
      DEVICE: '26b9',
      PROFILE: '1146 (NVIDIA L40S-2B)',
    },
    {
      CLASS: '0302',
      VENDOR: '10de',
      DEVICE: '26b9',
      PROFILE: '1146 (NVIDIA L40S-2B)',
    },
  ])
})

test('tampered profile identifier fails closed', () => {
  const result = resolvePublishedGpuRequest(
    { PROFILE_ID: 'admin-secret-device', COUNT: 1 },
    template
  )
  assert.equal(result.valid, false)
  assert.equal(result.reason, 'PROFILE_NOT_PUBLISHED')
  assert.deepEqual(result.pci, [])
})

test('request cannot exceed the provider-published count', () => {
  const result = resolvePublishedGpuRequest(
    { PROFILE_ID: 'l40s-2b', COUNT: 3 },
    template
  )
  assert.equal(result.valid, false)
  assert.equal(result.reason, 'COUNT_OUT_OF_RANGE')
})

test('non-GPU PCI classes and invalid profile IDs are never published', () => {
  const profiles = getPublishedGpuProfiles({
    LAYERSENTRY_GPU_PROFILES: [
      { ID: 'network-card', CLASS: '0200', VENDOR: '8086' },
      { ID: '../bad', CLASS: '0302', VENDOR: '10de' },
    ],
  })
  assert.deepEqual(profiles, [])
})

test('empty request is valid and does not invent a GPU', () => {
  assert.deepEqual(resolvePublishedGpuRequest({}, template), {
    valid: true,
    requested: false,
    pci: [],
  })
})
