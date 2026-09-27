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
const { chromium } = require('playwright')
const assert = require('node:assert/strict')

const baseUrl = process.argv[2]
assert.ok(baseUrl, 'base URL is required')

const errors = []
const unexpectedResponses = []
let browser
;(async () => {
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      !message.text().includes('401 (Unauthorized)')
    ) {
      errors.push(`console: ${message.text()}`)
    }
  })
  page.on('response', (response) => {
    if (response.status() !== 401) return
    const url = new URL(response.url())
    if (!url.pathname.startsWith('/fireedge/api/')) {
      unexpectedResponses.push(`${response.status()} ${url.pathname}`)
    }
  })

  for (const path of [
    '',
    '/',
    '/layersentry',
    '/layersentry/compute',
    '/layersentry/infrastructure/hosts',
    '/undefined/',
  ]) {
    await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' })
    try {
      await page
        .locator('#root > *')
        .first()
        .waitFor({ state: 'visible', timeout: 15000 })
    } catch (error) {
      const bodyText = (await page.locator('body').innerText()).trim()
      throw new Error(
        `${path || '/'} did not mount: ${error.message}; body=${JSON.stringify(
          bodyText.slice(0, 1000)
        )}; browser=${JSON.stringify(errors)}`
      )
    }
    const text = (await page.locator('body').innerText()).trim()
    assert.ok(text.length > 20, `${path || '/'} rendered a blank page`)
    assert.doesNotMatch(
      text,
      /OpenNebula|Sunstone|KubeOne|OneKS/i,
      `${path || '/'} leaked provider branding`
    )
    assert.doesNotMatch(
      page.url(),
      /\/undefined(?:\/|$)/,
      `${path || '/'} retained an undefined route`
    )
  }

  assert.deepEqual(
    errors,
    [],
    `unexpected browser errors:\n${errors.join('\n')}`
  )
  assert.deepEqual(
    unexpectedResponses,
    [],
    `unexpected unauthorized resources:\n${unexpectedResponses.join('\n')}`
  )
})()
  .finally(async () => browser?.close())
  .catch((error) => {
    console.error(error.stack || error)
    process.exitCode = 1
  })
