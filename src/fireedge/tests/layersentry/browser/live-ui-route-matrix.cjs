/* SPDX-License-Identifier: Apache-2.0 */
const assert = require('node:assert/strict')
const fs = require('node:fs')

const required = (name) => {
  const value = process.env[name]
  assert.ok(value, `${name} is required`)
  return value
}

const { chromium } = require(
  process.env.LAYERSENTRY_PLAYWRIGHT_MODULE || 'playwright'
)

const baseUrl = required('LAYERSENTRY_BASE_URL').replace(/\/+$/, '') + '/'
const username = required('LAYERSENTRY_USERNAME')
const password = required('LAYERSENTRY_PASSWORD')
const evidencePath =
  process.env.LAYERSENTRY_ROUTE_EVIDENCE_PATH ||
  'layersentry-live-route-matrix.json'

const defaultRoutes = [
  'overview',
  'compute',
  'compute/create',
  'compute/blueprints',
  'compute/affinity',
  'kubernetes',
  'kubernetes/create',
  'applications',
  'applications/deploy',
  'storage',
  'storage/images',
  'storage/files',
  'network',
  'network/templates',
  'network/routers',
  'security',
  'protection',
  'protection/backup-plans',
  'protection/recovery-points',
  'protection/site-recovery',
  'operations',
  'support',
  'settings',
  'infrastructure/hosts',
  'infrastructure/clusters',
  'infrastructure/storage',
  'infrastructure/backup-storage',
  'infrastructure/drivers',
  'infrastructure/zones',
  'infrastructure/providers',
  'access/users',
  'access/teams',
  'access/projects',
  'access/roles',
  'access/limits',
  'access/rules',
  'platform/images',
  'platform/templates',
  'platform/applications',
  'platform/service-templates',
  'platform/router-templates',
  'platform/marketplaces',
  'platform/marketplace-apps',
]

const routes = process.env.LAYERSENTRY_ROUTE_MATRIX
  ? process.env.LAYERSENTRY_ROUTE_MATRIX.split(',').map((v) => v.trim()).filter(Boolean)
  : defaultRoutes

const urlFor = (pathname) =>
  new URL(pathname.replace(/^\//, ''), baseUrl).toString()

const main = async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.LAYERSENTRY_CHROME_EXECUTABLE || undefined,
  })
  const context = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await context.newPage()
  const errors = []
  const failedRequests = []
  let currentRoute = 'login'

  page.on('pageerror', (error) => {
    errors.push({ route: currentRoute, type: 'pageerror', text: String(error) })
  })
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push({ route: currentRoute, type: 'console', text: message.text() })
    }
  })
  page.on('requestfailed', (request) => {
    failedRequests.push({
      route: currentRoute,
      method: request.method(),
      url: request.url(),
      error: request.failure()?.errorText,
    })
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

    const results = []
    for (const profile of [
      { name: 'desktop', width: 1440, height: 1000 },
      { name: 'mobile', width: 390, height: 844 },
    ]) {
      await page.setViewportSize({ width: profile.width, height: profile.height })

      for (const route of routes) {
        currentRoute = `${profile.name}:${route}`
        const errorStart = errors.length
        const failedStart = failedRequests.length
        const response = await page.goto(urlFor(route), {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        })
        await page.waitForTimeout(500)

        const state = await page.evaluate(() => {
          const bodyText = document.body?.innerText?.trim() || ''
          const blocked = Boolean(
            document.querySelector('[data-layersentry-capability-unavailable]')
          )
          const login = Boolean(
            document.querySelector('[data-layersentry-login="true"]')
          )
          const visibleButtons = Array.from(
            document.querySelectorAll('button')
          )
            .filter((button) => {
              const style = window.getComputedStyle(button)
              const rect = button.getBoundingClientRect()
              return (
                style.display !== 'none' &&
                style.visibility !== 'hidden' &&
                rect.width > 0 &&
                rect.height > 0
              )
            })
            .map((button) =>
              (button.innerText || button.getAttribute('aria-label') || '')
                .replace(/\s+/g, ' ')
                .trim()
            )
            .filter(Boolean)

          return {
            blocked,
            login,
            bodyLength: bodyText.length,
            overflowX:
              document.documentElement.scrollWidth >
              window.innerWidth + 2,
            visibleButtons: [...new Set(visibleButtons)].slice(0, 80),
          }
        })

        assert.equal(state.login, false, `Session returned to login on ${route}`)
        assert.ok(state.bodyLength > 20, `Blank/empty UI on ${route}`)

        results.push({
          profile: profile.name,
          route,
          httpStatus: response?.status(),
          finalUrl: page.url(),
          ...state,
          errors: errors.slice(errorStart),
          failedRequests: failedRequests.slice(failedStart),
        })
      }
    }

    const blockingErrors = errors.filter(
      ({ text }) =>
        !/ResizeObserver loop|favicon/i.test(text)
    )
    assert.equal(
      blockingErrors.length,
      0,
      `Browser runtime errors: ${JSON.stringify(blockingErrors)}`
    )

    const evidence = {
      status: 'PASS',
      baseUrl,
      testedAt: new Date().toISOString(),
      results,
      errors,
      failedRequests,
    }
    fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2))
    process.stdout.write(
      JSON.stringify({
        status: evidence.status,
        routes: results.length,
        blocked: results.filter(({ blocked }) => blocked).length,
        rendered: results.filter(({ blocked }) => !blocked).length,
        errors: errors.length,
        failedRequests: failedRequests.length,
      }) + '\n'
    )
  } catch (error) {
    fs.writeFileSync(
      evidencePath,
      JSON.stringify(
        {
          status: 'FAIL',
          baseUrl,
          currentRoute,
          errors,
          failedRequests,
          error: String(error?.stack || error),
        },
        null,
        2
      )
    )
    throw error
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
