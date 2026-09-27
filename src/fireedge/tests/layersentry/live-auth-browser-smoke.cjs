#!/usr/bin/env node
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
/* eslint-disable import/no-extraneous-dependencies */
const assert = require('node:assert/strict')
const { chromium } = require('playwright')

const [baseUrl, username, password, role = 'customer'] = process.argv.slice(2)
assert.ok(baseUrl && username && password, 'base URL and credentials required')

const forbiddenBrand = /OpenNebula|Sunstone|KubeOne|OneKS/i
const errors = []
let browser

const assertProductPage = async (page, label) => {
  await page.locator('#root > *').first().waitFor({ state: 'visible' })
  const text = (await page.locator('body').innerText()).trim()
  assert.ok(text.length > 20, `${label} rendered a blank page`)
  assert.doesNotMatch(text, forbiddenBrand, `${label} leaked provider branding`)
  assert.doesNotMatch(
    page.url(),
    /\/undefined(?:\/|$)/,
    `${label} used undefined route`
  )

  return text
}

;(async () => {
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ locale: 'en-US' })
  const page = await context.newPage()
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })

  await page.goto(`${baseUrl}/layersentry`, { waitUntil: 'networkidle' })
  await assertProductPage(page, 'login')
  await page.locator('[name="user"]').fill(username)
  await page.locator('[name="token"]').fill(password)
  await page.locator('[data-cy="login-button"]').click()
  await page.getByText('Overview', { exact: true }).first().waitFor()
  const overview = await assertProductPage(page, `${role} overview`)
  assert.match(overview, /LayerSentry/)
  assert.match(overview, /Compute/)
  assert.match(overview, /Storage/)
  assert.match(overview, /Network/)
  assert.match(overview, /Protection/)
  assert.match(overview, /Operations/)

  for (const path of [
    '/layersentry/compute',
    '/layersentry/storage',
    '/layersentry/network',
    '/layersentry/protection/backup-plans',
    '/layersentry/operations',
    '/layersentry/settings',
  ]) {
    await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' })
    await assertProductPage(page, `${role} ${path}`)
  }

  if (role === 'customer') {
    await page.goto(`${baseUrl}/layersentry/infrastructure/hosts/0`, {
      waitUntil: 'networkidle',
    })
    const text = await assertProductPage(page, 'customer IDOR route')
    assert.doesNotMatch(text, /Host Detail|Storage & Devices/)
  }

  await context.clearCookies()
  await page.goto(`${baseUrl}/layersentry/compute`, {
    waitUntil: 'networkidle',
  })
  const expired = await assertProductPage(page, `${role} session expiry`)
  assert.match(expired, /Sign in/i)

  assert.deepEqual(
    errors,
    [],
    `unexpected browser errors:\n${errors.join('\n')}`
  )
})()
  .finally(async () => browser?.close())
  .catch((error) => {
    console.error(error.stack || error)
    process.exitCode = 1
  })
