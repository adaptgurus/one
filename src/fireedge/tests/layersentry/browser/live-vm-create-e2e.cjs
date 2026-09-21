/* SPDX-License-Identifier: Apache-2.0 */
const assert = require('node:assert/strict')
const fs = require('node:fs')

const required = (name) => {
  const value = process.env[name]
  assert.ok(value, `${name} is required`)
  return value
}

const playwrightModule = process.env.LAYERSENTRY_PLAYWRIGHT_MODULE || 'playwright'
const { chromium } = require(playwrightModule)

const baseUrl = required('LAYERSENTRY_BASE_URL').replace(/\/+$/, '') + '/'
const username = required('LAYERSENTRY_USERNAME')
const password = required('LAYERSENTRY_PASSWORD')
const templateName = required('LAYERSENTRY_VM_TEMPLATE_NAME')
const networkName = required('LAYERSENTRY_NETWORK_NAME')
const vmName =
  process.env.LAYERSENTRY_VM_NAME || `ls-ui-e2e-${Date.now().toString(36)}`
const evidencePath =
  process.env.LAYERSENTRY_EVIDENCE_PATH || 'layersentry-live-vm-e2e.json'

const route = (pathname) =>
  new URL(pathname.replace(/^\//, ''), baseUrl).toString()

const main = async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.LAYERSENTRY_CHROME_EXECUTABLE || undefined,
  })
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 1000 },
  })
  const page = await context.newPage()

  const pageErrors = []
  const consoleErrors = []
  const failedRequests = []
  const httpErrors = []
  const mutationRequests = []

  page.on('pageerror', (error) => pageErrors.push(String(error)))
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    if (
      /WebSocket connection to .*\/fireedge\/websockets\/hooks\/.*Invalid frame header/i.test(
        text
      )
    ) {
      return
    }
    consoleErrors.push(text)
  })
  page.on('requestfailed', (request) => {
    failedRequests.push({
      method: request.method(),
      url: request.url(),
      error: request.failure()?.errorText,
    })
  })
  page.on('response', (response) => {
    if (response.status() < 400 || /favicon/i.test(response.url())) return
    httpErrors.push({ status: response.status(), url: response.url() })
  })
  page.on('request', (request) => {
    if (request.method() === 'GET') return
    const body = request.postData() || ''
    if (/template\.instantiate/i.test(body)) {
      mutationRequests.push({
        method: request.method(),
        url: request.url(),
        bodyHasInstantiateCommand: true,
      })
    }
  })

  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
    await page.locator('input[autocomplete="username"]').fill(username)
    await page.locator('input[autocomplete="current-password"]').fill(password)
    await page.locator('[data-cy="login-button"]').click()
    await page.waitForFunction(
      () => !document.querySelector('[data-layersentry-login="true"]'),
      undefined,
      { timeout: 30000 }
    )

    // The login shell probes user/info before authentication. Those expected
    // 401s are not part of the authenticated qualification evidence.
    pageErrors.length = 0
    consoleErrors.length = 0
    failedRequests.length = 0
    httpErrors.length = 0

    await page.goto(route('compute'), { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Create VM', exact: true }).click()
    await page.getByText('Create virtual machine', { exact: true }).waitFor({
      timeout: 30000,
    })

    const templateCell = page.getByText(templateName, { exact: true }).first()
    await templateCell.waitFor({ timeout: 30000 })
    await templateCell.locator('xpath=ancestor::tr[1]').click()

    await page.waitForURL(/\/vm-template\/instantiate(?:\?|$)/, {
      timeout: 30000,
    })
    await assertNoCapabilityBlock(page)

    const vmNameInput = page.locator('[data-cy="information-name"]')
    await vmNameInput.waitFor({ timeout: 30000 })
    await vmNameInput.fill(vmName)
    await next(page)

    await page.locator('[data-cy="layersentry-vm-access-username"]').waitFor({
      timeout: 30000,
    })
    await next(page)

    const network = page.locator(
      '[data-cy="layersentry-network-networkId"]'
    )
    await network.waitFor({ timeout: 30000 })
    await network.fill(networkName)
    const option = page
      .locator('.dropdown-menu-option')
      .filter({ hasText: networkName })
      .first()
    await option.waitFor({ timeout: 30000 })
    await option.click()
    await next(page)

    await page.getByText('Backup and disaster recovery', { exact: true }).waitFor({
      timeout: 30000,
    })
    await next(page)

    await page.waitForURL(/\/(compute|vm)(?:\/|$|\?)/, {
      timeout: 60000,
    })

    assert.ok(
      mutationRequests.length > 0,
      'Browser never emitted a template.instantiate mutation request'
    )
    assert.equal(pageErrors.length, 0, `Page errors: ${pageErrors.join(' | ')}`)
    assert.equal(
      consoleErrors.length,
      0,
      `Console errors: ${consoleErrors.join(' | ')}`
    )

    const evidence = {
      status: 'PASS',
      baseUrl,
      vmName,
      templateName,
      networkName,
      finalUrl: page.url(),
      mutationRequests,
      pageErrors,
      consoleErrors,
      failedRequests,
      httpErrors,
    }
    fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2))
    process.stdout.write(JSON.stringify(evidence, null, 2) + '\n')
  } catch (error) {
    const bodyText = await page.locator('body').innerText().catch(() => '')
    const inputs = await page
      .locator('input')
      .evaluateAll((nodes) =>
        nodes.slice(0, 80).map((node) => ({
          name: node.getAttribute('name'),
          type: node.getAttribute('type'),
          dataCy: node.getAttribute('data-cy'),
          visible: Boolean(node.offsetWidth || node.offsetHeight || node.getClientRects().length),
        }))
      )
      .catch(() => [])
    const evidence = {
      status: 'FAIL',
      baseUrl,
      vmName,
      templateName,
      networkName,
      currentUrl: page.url(),
      mutationRequests,
      pageErrors,
      consoleErrors,
      failedRequests,
      httpErrors,
      bodyText: bodyText.slice(0, 6000),
      inputs,
      error: String(error?.stack || error),
    }
    fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2))
    throw error
  } finally {
    await browser.close()
  }
}

const next = async (page) => {
  const button = page.locator('[data-cy="stepper-next-button"]')
  await button.waitFor({ timeout: 30000 })
  await button.click()
}

const assertNoCapabilityBlock = async (page) => {
  const unavailable = page.locator('[data-layersentry-capability-unavailable]')
  assert.equal(
    await unavailable.count(),
    0,
    'LayerSentry capability guard blocked the VM instantiate handoff'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
