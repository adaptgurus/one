/* SPDX-License-Identifier: Apache-2.0 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { resolve } = require('node:path')

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

const layerSentrySourceRoot =
  process.env.LAYERSENTRY_SOURCE_ROOT ||
  resolve(__dirname, '../../../src/client/apps/layersentry')

const readLayerSentrySource = (name) =>
  fs.readFileSync(resolve(layerSentrySourceRoot, name), 'utf8')

const deriveDefaultRoutes = () => {
  const navigation = readLayerSentrySource('navigation.js')
  const portal = readLayerSentrySource('Portal.js')
  const productBlock =
    navigation.match(
      /export const PRODUCT_PATHS = Object\.freeze\(\{([\s\S]*?)\}\)/
    )?.[1] || ''
  const productPaths = new Map(
    [...productBlock.matchAll(/^\s*([A-Z0-9_]+):\s*'([^']+)'/gm)].map(
      ([, key, value]) => [key, value]
    )
  )
  const routeKeys = new Set()

  for (const source of [navigation, portal]) {
    for (const match of source.matchAll(/\bpath(?:=\{|:)\s*PRODUCT_PATHS\.([A-Z0-9_]+)/g)) {
      routeKeys.add(match[1])
    }
  }

  const directPaths = [
    ...portal.matchAll(/\bpath="([^"]+)"/g),
    ...portal.matchAll(/\bcreateTo:\s*'([^']+)'/g),
  ].map(([, value]) => value)

  return [
    ...new Set(
      [
        ...[...routeKeys].map((key) => productPaths.get(key)).filter(Boolean),
        ...directPaths,
      ]
        .filter((value) => value?.startsWith('/'))
        .map((value) => value.replace(/^\/+/, ''))
    ),
  ].sort()
}

const defaultRoutes = deriveDefaultRoutes()

const routes = process.env.LAYERSENTRY_ROUTE_MATRIX
  ? process.env.LAYERSENTRY_ROUTE_MATRIX.split(',').map((v) => v.trim()).filter(Boolean)
  : defaultRoutes

const expectBaselineFailClosed =
  process.env.LAYERSENTRY_EXPECT_BASELINE_FAIL_CLOSED === '1'
const baselineRenderedRoutes = new Set([
  'overview',
  'compute',
  'compute/blueprints',
  'compute/affinity',
  'search',
  'support',
  'settings',
])

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
  const httpErrors = []
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
  page.on('response', (response) => {
    if (response.status() < 400) return
    if (/favicon/i.test(response.url())) return

    httpErrors.push({
      route: currentRoute,
      status: response.status(),
      url: response.url(),
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

    // Ignore expected unauthenticated bootstrap probes from the login screen.
    errors.length = 0
    failedRequests.length = 0
    httpErrors.length = 0

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
        const httpStart = httpErrors.length
        const response = await page.goto(urlFor(route), {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        })
        await page.waitForFunction(
          () => {
            const bodyText = document.body?.innerText?.trim() || ''
            return (
              bodyText.length > 20 ||
              Boolean(
                document.querySelector(
                  '[data-layersentry-capability-unavailable]'
                )
              ) ||
              Boolean(
                document.querySelector('[data-layersentry-login="true"]')
              )
            )
          },
          undefined,
          { timeout: 30000 }
        )

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

        if (expectBaselineFailClosed) {
          assert.equal(
            state.blocked,
            !baselineRenderedRoutes.has(route),
            `Unexpected capability visibility on ${route}`
          )
          if (route === 'compute') {
            assert.equal(
              state.visibleButtons.includes('Create VM'),
              false,
              'Create VM must remain hidden in the normal fail-closed profile'
            )
          }
        }

        results.push({
          profile: profile.name,
          route,
          httpStatus: response?.status(),
          finalUrl: page.url(),
          ...state,
          errors: errors.slice(errorStart),
          failedRequests: failedRequests.slice(failedStart),
          httpErrors: httpErrors.slice(httpStart),
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
      httpErrors,
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
        httpErrors: httpErrors.length,
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
          httpErrors,
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
