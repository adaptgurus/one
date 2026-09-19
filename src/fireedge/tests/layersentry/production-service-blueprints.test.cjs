/* SPDX-License-Identifier: Apache-2.0 */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const babel = require('@babel/core')

const fireedgeRoot = path.join(__dirname, '../..')
const modelPath = path.join(
  fireedgeRoot,
  'src/client/apps/layersentry/serviceBlueprints.js'
)

const loadEsModuleAsCommonJs = (file) => {
  const source = fs.readFileSync(file, 'utf8')
  const { code } = babel.transformSync(source, {
    babelrc: false,
    configFile: false,
    presets: [
      [
        require.resolve('@babel/preset-env'),
        { targets: { node: '22' }, modules: 'commonjs' },
      ],
    ],
  })
  const module = { exports: {} }
  const fn = new Function(
    'module',
    'exports',
    'require',
    '__filename',
    '__dirname',
    code
  )
  fn(module, module.exports, require, file, path.dirname(file))
  return module.exports
}

const api = loadEsModuleAsCommonJs(modelPath)

const makeValid = (blueprint) => {
  const draft = api.createDraft(blueprint.id)
  draft.domain = 'prod.example.internal'
  draft.serviceFqdn = `${blueprint.id}.prod.example.internal`
  draft.serviceName = `${blueprint.id}-prod`

  const backup = api.getBackupProfile(blueprint)
  if (backup.mode === 'direct' && draft.backupEnabled) {
    draft.backupRepositoryRef = 'backup-repository-primary'
  }

  if (blueprint.id === 'airflow') {
    draft.airflowDagRef = 'git:platform/airflow-dags@release-2026-09'
  }
  if (blueprint.id === 'nginx' || blueprint.id === 'apache-httpd') {
    draft.webSourceRef = 'service:application-backend'
  }
  if (blueprint.id === 'alloy') {
    draft.dependencyRefs.telemetryTarget =
      'otel-gateway.prod.example.internal:4317'
  }

  return draft
}

test('production-service catalog has 27 fail-closed product families and 8 steps', () => {
  assert.equal(api.FALLBACK_BLUEPRINTS.length, 27)
  assert.equal(api.WIZARD_STEPS.length, 8)
  assert.deepEqual(api.WIZARD_STEPS, [
    'Choose Service',
    'Version & Deployment',
    'Capacity',
    'Storage',
    'Network & Availability',
    'Backup & Recovery',
    'Security & Observability',
    'Review',
  ])

  for (const blueprint of api.FALLBACK_BLUEPRINTS) {
    assert.equal(blueprint.productionSelectable, false)
    assert.equal(blueprint.qualification, 'NOT_TESTED')
    assert.equal(Object.hasOwn(blueprint, 'preferredOs'), false)
  }
})

test('all service/topology architecture plans have exact non-negative VM accounting', () => {
  for (const blueprint of api.FALLBACK_BLUEPRINTS) {
    const editions = blueprint.editions || [undefined]
    for (const edition of editions) {
      let seed = api.createDraft(blueprint.id)
      if (edition) seed.edition = edition
      const topologies = api.getTopologyOptions(seed, blueprint)

      for (const topology of topologies) {
        const draft = api.createDraft(blueprint.id)
        if (edition) draft.edition = edition
        draft.topology = topology
        Object.assign(
          draft,
          api.getDefaultDependencyState(draft, blueprint)
        )
        draft.storage = api.getStorageTemplate(draft, blueprint)

        const plan = api.getArchitecturePlan(draft, blueprint)
        assert.ok(
          Number.isInteger(plan.dedicated) && plan.dedicated >= 1,
          `${blueprint.id} / ${edition || '-'} / ${topology}: invalid VM total ${plan.dedicated}`
        )
        assert.ok(Array.isArray(plan.components))
        assert.ok(plan.components.length > 0)

        const sum = plan.components.reduce(
          (total, component) =>
            total +
            (Number.isFinite(Number(component.addsVms))
              ? Number(component.addsVms)
              : 0),
          0
        )
        assert.equal(
          sum,
          plan.dedicated,
          `${blueprint.id} / ${edition || '-'} / ${topology}: component VM sum ${sum} != total ${plan.dedicated}`
        )
      }
    }
  }
})

test('critical default production footprints include linked service dependencies', () => {
  const expected = {
    postgresql: 3,
    ferretdb: 5,
    keycloak: 6,
    superset: 10,
    airflow: 10,
    yugabytedb: 6,
    kafka: 6,
    grafana: 5,
    forgejo: 5,
    opensearch: 6,
  }

  for (const [id, count] of Object.entries(expected)) {
    const blueprint = api.getBlueprintById(id)
    const draft = api.createDraft(id)
    const plan = api.getArchitecturePlan(draft, blueprint)
    assert.equal(plan.dedicated, count, id)
  }
})

test('existing linked dependencies stop adding VMs but require explicit references', () => {
  const blueprint = api.getBlueprintById('keycloak')
  const draft = api.createDraft('keycloak')
  const dependency = api.getDependencySpecs(draft, blueprint)[0]

  assert.equal(api.getArchitecturePlan(draft, blueprint).dedicated, 6)

  draft.dependencyModes[dependency.key] = dependency.existingLabel
  assert.ok(api.getDependencyErrors(draft, blueprint).length > 0)

  draft.dependencyRefs[dependency.key] =
    'postgres-ha.prod.example.internal'
  assert.deepEqual(api.getDependencyErrors(draft, blueprint), [])
  assert.equal(api.getArchitecturePlan(draft, blueprint).dedicated, 3)
})

test('every catalog default can become a complete frontend-valid desired state', () => {
  for (const blueprint of api.FALLBACK_BLUEPRINTS) {
    const draft = makeValid(blueprint)
    const errors = api.validateDraft(draft, blueprint)
    assert.deepEqual(
      errors,
      [],
      `${blueprint.id}: ${errors.map((item) => item.message).join(' | ')}`
    )
  }
})

test('backup ownership is product-specific and never genericized', () => {
  for (const id of [
    'postgresql',
    'mysql-family',
    'redis',
    'opensearch',
    'openbao',
  ]) {
    const blueprint = api.getBlueprintById(id)
    const profile = api.getBackupProfile(blueprint)
    const draft = api.createDraft(id)
    assert.equal(profile.mode, 'direct', id)
    assert.equal(draft.backupEnabled, true, id)
  }

  for (const id of [
    'keycloak',
    'superset',
    'airflow',
    'grafana',
    'ferretdb',
  ]) {
    const blueprint = api.getBlueprintById(id)
    const profile = api.getBackupProfile(blueprint)
    const draft = api.createDraft(id)
    assert.equal(profile.mode, 'dependency', id)
    assert.equal(draft.backupEnabled, false, id)
  }

  for (const id of [
    'nginx',
    'apache-httpd',
    'tomcat',
    'rabbitmq',
    'kafka',
    'pulsar',
    'prometheus',
    'alloy',
  ]) {
    const blueprint = api.getBlueprintById(id)
    const profile = api.getBackupProfile(blueprint)
    const draft = api.createDraft(id)
    assert.equal(profile.mode, 'none', id)
    assert.equal(draft.backupEnabled, false, id)
  }
})

test('advanced network validation rejects bad static-IP, DNS and port input', () => {
  const blueprint = api.getBlueprintById('postgresql')
  const draft = makeValid(blueprint)

  draft.ipMode = 'Static'
  draft.staticIps = '10.0.0.10,not-an-ip,10.0.0.12'
  let errors = api.validateStep(4, draft, blueprint)
  assert.ok(errors.some(({ message }) => /IPv4\/IPv6/.test(message)))

  draft.staticIps = '10.0.0.10,10.0.0.11'
  errors = api.validateStep(4, draft, blueprint)
  assert.ok(errors.some(({ message }) => /exactly 3 address/.test(message)))

  draft.staticIps = '10.0.0.10,10.0.0.11,10.0.0.12'
  draft.dnsRegistration = 'Manual DNS records'
  draft.dnsTargetMode = 'Specify DNS target now'
  draft.dnsRecordType = 'A/AAAA'
  draft.dnsZone = 'prod.example.internal'
  draft.dnsTarget = 'not-an-address'
  errors = api.validateStep(4, draft, blueprint)
  assert.ok(errors.some(({ message }) => /A\/AAAA/.test(message)))

  draft.dnsTarget = '10.0.0.50'
  draft.portPolicy = 'Custom qualified port'
  draft.customPort = 70000
  errors = api.validateStep(4, draft, blueprint)
  assert.ok(errors.some(({ message }) => /between 1 and 65535/.test(message)))
})

test('proxy credentials are optional, proxy URL is validated and password is sanitized', () => {
  const blueprint = api.getBlueprintById('postgresql')
  const draft = makeValid(blueprint)
  draft.internetAccess = 'HTTP(S) Proxy'
  draft.proxyUrl = 'proxy-without-scheme'
  let errors = api.validateStep(6, draft, blueprint)
  assert.ok(errors.some(({ message }) => /valid http:\/\//.test(message)))

  draft.proxyUrl = 'http://proxy.example.internal:3128'
  draft.proxyUsername = ''
  draft.proxyPassword = ''
  errors = api.validateStep(6, draft, blueprint)
  assert.deepEqual(errors, [])

  draft.proxyPassword = 'sensitive-value'
  const safe = api.sanitizeDesign(draft)
  assert.equal(Object.hasOwn(safe, 'proxyPassword'), false)
  assert.equal(safe.proxyPasswordPresent, true)
  assert.equal(JSON.stringify(safe).includes('sensitive-value'), false)
})

test('TLS and application credentials use references instead of raw secret fields', () => {
  const blueprint = api.getBlueprintById('postgresql')
  const draft = makeValid(blueprint)
  const credential = api.getCredentialProfile(blueprint)

  draft.tlsCertificateMode = 'Existing certificate / secret reference'
  draft.tlsCertificateRef = ''
  let errors = api.validateStep(6, draft, blueprint)
  assert.ok(errors.some(({ message }) => /certificate\/secret reference/.test(message)))

  draft.tlsCertificateRef = 'secret:tls/postgresql-prod'
  draft.credentialMode = credential.existing
  draft.credentialRef = ''
  errors = api.validateStep(6, draft, blueprint)
  assert.ok(errors.some(({ message }) => /existing secret reference/.test(message)))

  draft.credentialRef = 'secret:service/postgresql-prod'
  assert.deepEqual(api.validateStep(6, draft, blueprint), [])
})

test('product-specific advanced choices block incomplete designs', () => {
  {
    const blueprint = api.getBlueprintById('postgresql')
    const draft = makeValid(blueprint)
    draft.postgis = true
    draft.postgisTarget = 'Existing/restored database(s)'
    draft.postgisDatabases = ''
    const errors = api.validateStep(1, draft, blueprint)
    assert.ok(errors.some(({ message }) => /PostGIS/.test(message)))
  }

  {
    const blueprint = api.getBlueprintById('airflow')
    const draft = makeValid(blueprint)
    draft.airflowDagRef = ''
    const errors = api.validateStep(1, draft, blueprint)
    assert.ok(errors.some(({ message }) => /DAG source/.test(message)))
  }

  {
    const blueprint = api.getBlueprintById('redis')
    const draft = makeValid(blueprint)
    draft.kvPersistence = 'Cache-only (no durability)'
    draft.backupEnabled = true
    const errors = api.validateStep(1, draft, blueprint)
    assert.ok(errors.some(({ message }) => /Cache-only/.test(message)))
  }
})

test('portal routes Applications deploy to the production-service wizard', () => {
  const portal = fs.readFileSync(
    path.join(
      fireedgeRoot,
      'src/client/apps/layersentry/Portal.js'
    ),
    'utf8'
  )
  const wizard = fs.readFileSync(
    path.join(
      fireedgeRoot,
      'src/client/apps/layersentry/pages/ProductionServiceWizard.js'
    ),
    'utf8'
  )

  assert.match(portal, /component={ProductionServiceWizard}/)
  assert.match(wizard, /WIZARD_STEPS/)
  assert.match(wizard, /Required dependency plan/)
  assert.match(wizard, /TLS certificate source/)
  assert.match(wizard, /Proxy password \(optional\)/)
  assert.match(wizard, /const DEPLOYMENT_ACTION_AVAILABLE = false/)
  assert.match(wizard, /!DEPLOYMENT_ACTION_AVAILABLE/)
  assert.doesNotMatch(wizard, /preferredOs|LayerSentry selected OS|Rocky Linux|Ubuntu 24\.04/)
})

test('production-service wizard uses LayerSentry theme tokens only', () => {
  const wizard = fs.readFileSync(
    path.join(
      fireedgeRoot,
      'src/client/apps/layersentry/pages/ProductionServiceWizard.js'
    ),
    'utf8'
  )
  assert.doesNotMatch(
    wizard,
    /#[0-9a-fA-F]{6}\b/,
    'wizard colors must come from LayerSentry theme tokens'
  )
})

test('every service family declares explicit recovery ownership', () => {
  for (const blueprint of api.FALLBACK_BLUEPRINTS) {
    const profile = api.getBackupProfile(blueprint)
    assert.ok(
      ['direct', 'dependency', 'none'].includes(profile.mode),
      `${blueprint.id}: invalid recovery ownership mode`
    )
    assert.ok(profile.engine, `${blueprint.id}: missing recovery engine`)
    assert.ok(profile.note, `${blueprint.id}: missing recovery qualification note`)
  }
})


test('implemented React wizard renders the 27-family catalog and blocks incomplete progression', async () => {
  const Module = require('node:module')
  const { JSDOM } = require('jsdom')
  const React = require('react')
  const ReactDOM = require('react-dom')
  const { act } = require('react-dom/test-utils')
  const { MemoryRouter } = require('react-router-dom')

  const sourceRoot = path.join(fireedgeRoot, 'src')
  const previousNodePath = process.env.NODE_PATH
  process.env.NODE_PATH = previousNodePath
    ? sourceRoot + path.delimiter + previousNodePath
    : sourceRoot
  Module._initPaths()

  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://layersentry.test/applications/deploy',
  })
  const previousGlobals = {
    window: global.window,
    document: global.document,
    navigator: global.navigator,
    HTMLElement: global.HTMLElement,
    Node: global.Node,
    getComputedStyle: global.getComputedStyle,
    ResizeObserver: global.ResizeObserver,
    fetch: global.fetch,
    requestAnimationFrame: global.requestAnimationFrame,
    cancelAnimationFrame: global.cancelAnimationFrame,
  }

  dom.window.matchMedia =
    dom.window.matchMedia ||
    (() => ({
      matches: false,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return false
      },
    }))
  dom.window.scrollTo = () => {}

  global.window = dom.window
  global.document = dom.window.document
  global.navigator = dom.window.navigator
  global.HTMLElement = dom.window.HTMLElement
  global.Node = dom.window.Node
  global.getComputedStyle = dom.window.getComputedStyle.bind(dom.window)
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  global.requestAnimationFrame = (callback) => setTimeout(callback, 0)
  global.cancelAnimationFrame = (id) => clearTimeout(id)
  global.fetch = async () => {
    throw new Error('runtime catalog intentionally unavailable in UI smoke test')
  }

  const originalLoader = require.extensions['.js']
  const originalModuleLoad = Module._load
  Module._load = function (request, parent, isMain) {
    if (request === 'client/apps/layersentry/navigation') {
      return { PRODUCT_PATHS: { APPLICATIONS: '/applications' } }
    }

    return originalModuleLoad.call(this, request, parent, isMain)
  }
  require.extensions['.js'] = (module, filename) => {
    if (filename.startsWith(sourceRoot)) {
      const source = fs.readFileSync(filename, 'utf8')
      const { code } = babel.transformSync(source, {
        babelrc: false,
        configFile: false,
        presets: [
          [
            require.resolve('@babel/preset-env'),
            { targets: { node: '22' }, modules: 'commonjs' },
          ],
          [require.resolve('@babel/preset-react'), { runtime: 'automatic' }],
        ],
      })
      module._compile(code, filename)

      return
    }

    originalLoader(module, filename)
  }

  try {
    const wizardPath = path.join(
      sourceRoot,
      'client/apps/layersentry/pages/ProductionServiceWizard.js'
    )
    delete require.cache[require.resolve(wizardPath)]
    const wizardModule = require(wizardPath)
    const ProductionServiceWizard = wizardModule.default || wizardModule
    const root = document.getElementById('root')

    await act(async () => {
      ReactDOM.render(
        React.createElement(
          MemoryRouter,
          { initialEntries: ['/applications/deploy'] },
          React.createElement(ProductionServiceWizard)
        ),
        root
      )
      await Promise.resolve()
    })

    assert.equal(
      document.querySelectorAll('[data-testid^="service-"]').length,
      27,
      'all 27 service cards must render in the implemented React wizard'
    )
    assert.match(root.textContent, /Choose a production service/)
    assert.doesNotMatch(
      root.textContent,
      /Rocky Linux|Ubuntu 24\.04|LayerSentry selected OS/
    )

    const clickNext = async () => {
      const button = [...document.querySelectorAll('button')].find((item) =>
        /Next/.test(item.textContent)
      )
      assert.ok(button, 'Next button must be present')
      await act(async () => {
        button.dispatchEvent(
          new dom.window.MouseEvent('click', {
            bubbles: true,
            cancelable: true,
          })
        )
        await Promise.resolve()
      })
    }

    await clickNext()
    assert.match(root.textContent, /Version & Deployment/)
    const footprint = document.querySelector('[data-testid="vm-footprint"]')
    assert.ok(footprint, 'VM footprint must be rendered on deployment step')
    assert.match(footprint.textContent, /PostgreSQL/)
    assert.match(footprint.textContent, /Patroni/)
    assert.match(footprint.textContent, /3\s*new dedicated VMs/)

    await clickNext()
    assert.match(root.textContent, /Capacity/)

    await clickNext()
    assert.match(root.textContent, /Storage/)

    await clickNext()
    assert.match(root.textContent, /Network & Availability/)

    await clickNext()
    assert.match(
      root.textContent,
      /Configuration required/,
      'network step must fail closed when DNS domain/FQDN are missing'
    )
    assert.match(
      root.textContent,
      /Network & Availability/,
      'wizard must remain on the invalid step'
    )
    assert.doesNotMatch(root.textContent, /Backup & Recovery\s*Application-aware/)
  } finally {
    require.extensions['.js'] = originalLoader
    Module._load = originalModuleLoad
    process.env.NODE_PATH = previousNodePath
    Module._initPaths()
    ReactDOM.unmountComponentAtNode(document.getElementById('root'))
    dom.window.close()

    for (const [key, value] of Object.entries(previousGlobals)) {
      if (value === undefined) delete global[key]
      else global[key] = value
    }
  }
})
