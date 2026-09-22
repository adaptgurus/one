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
  if (draft.endpointMode === 'Existing load balancer') {
    draft.externalEndpoint = `vip://${blueprint.id}-prod`
  }
  const networkProfile = api.getNetworkProfile(draft, blueprint)
  if (networkProfile.customerTraffic) {
    draft.tlsCertificateRef = `secret://tests/${blueprint.id}/tls`
  }
  const credential = api.getCredentialProfile(blueprint)
  if (credential.required) {
    draft.credentialRef = `secret://tests/${blueprint.id}/credential`
  }

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
  for (const dependency of api.getDependencySpecs(draft, blueprint)) {
    draft.dependencyModes[dependency.key] = dependency.existingLabel
    draft.dependencyRefs[dependency.key] =
      dependency.kind === 'storage'
        ? `storage://${blueprint.id}/${dependency.key}`
        : `${dependency.key}.${blueprint.id}.prod.example.internal`
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

test('linked dependencies are reference-only and never add hidden VMs', () => {
  for (const id of [
    'ferretdb',
    'keycloak',
    'superset',
    'airflow',
    'grafana',
    'forgejo',
    'alloy',
  ]) {
    const blueprint = api.getBlueprintById(id)
    const draft = api.createDraft(id)
    const dependencies = api.getDependencySpecs(draft, blueprint)
    assert.ok(dependencies.length > 0, id)
    assert.ok(api.getDependencyErrors(draft, blueprint).length > 0, id)
    assert.equal(api.getArchitecturePlan(draft, blueprint).linkedDedicated, 0, id)
    for (const dependency of dependencies) {
      assert.deepEqual(api.getDependencyOptions(dependency), [dependency.existingLabel], id)
    }
  }
})

test('linked dependency references are mandatory and do not alter service-owned VM footprint', () => {
  const blueprint = api.getBlueprintById('keycloak')
  const draft = api.createDraft('keycloak')
  const dependency = api.getDependencySpecs(draft, blueprint)[0]
  const baseline = api.getArchitecturePlan(draft, blueprint).dedicated

  assert.ok(api.getDependencyErrors(draft, blueprint).length > 0)
  draft.dependencyModes[dependency.key] = dependency.existingLabel
  draft.dependencyRefs[dependency.key] = 'postgres-ha.prod.example.internal'
  assert.deepEqual(api.getDependencyErrors(draft, blueprint), [])
  assert.equal(api.getArchitecturePlan(draft, blueprint).dedicated, baseline)
  assert.equal(api.getArchitecturePlan(draft, blueprint).linkedDedicated, 0)
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

test('advanced network validation rejects bad static-IP and port input', () => {
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
  draft.portPolicy = 'Custom qualified port'
  draft.customPort = 70000
  errors = api.validateStep(4, draft, blueprint)
  assert.ok(errors.some(({ message }) => /between 1 and 65535/.test(message)))
})

test('production wizard exposes only the executable managed-repository package path', () => {
  const blueprint = api.getBlueprintById('postgresql')
  const draft = makeValid(blueprint)
  const compiled = api.compilePlatformDesiredState(draft, blueprint)
  assert.equal(compiled.package_source.mode, 'managed_online')
  assert.equal(compiled.package_source.allow_public_fallback, false)
  assert.equal(compiled.package_source.proxy_url, '')
  assert.equal(compiled.package_source.repo_url, '')
  assert.equal(compiled.package_source.bundle_id, '')
})

test('wizard compiles a durable backend desired state without customer OS or host placement', () => {
  const blueprint = api.getBlueprintById('nginx')
  const draft = makeValid(blueprint)
  draft.topology = 'Standalone'
  draft.ipMode = 'Static'
  draft.staticIps = '10.20.30.41'
  const desired = api.compilePlatformDesiredState(draft, blueprint)

  assert.equal(desired.blueprint_id, 'nginx')
  assert.equal(desired.deployment.node_count, 1)
  assert.equal(desired.network.nodes.length, 1)
  assert.equal(desired.network.nodes[0].ip, '10.20.30.41')
  assert.equal(
    desired.network.nodes[0].fqdn,
    'nginx-prod-01.prod.example.internal'
  )
  assert.equal(desired.package_source.allow_public_fallback, false)
  assert.equal(Object.hasOwn(desired, 'os_family'), false)
  assert.equal(Object.hasOwn(desired, 'image_id'), false)
  assert.equal(
    Object.hasOwn(desired.network.nodes[0], 'failure_domain'),
    false
  )
  assert.equal(desired.product_options.service_role, draft.webMode)
})

test('TLS and application credentials require existing secret references', () => {
  const blueprint = api.getBlueprintById('postgresql')
  const draft = makeValid(blueprint)

  draft.tlsCertificateRef = ''
  let errors = api.validateStep(6, draft, blueprint)
  assert.ok(errors.some(({ message }) => /secret:\/\/ certificate reference/.test(message)))

  draft.tlsCertificateRef = 'secret:tls/postgresql-prod'
  errors = api.validateStep(6, draft, blueprint)
  assert.ok(errors.some(({ message }) => /secret:\/\/ certificate reference/.test(message)))

  draft.tlsCertificateRef = 'secret://tls/postgresql-prod'
  draft.credentialRef = ''
  errors = api.validateStep(6, draft, blueprint)
  assert.ok(errors.some(({ message }) => /secret:\/\/ reference/.test(message)))

  draft.credentialRef = 'secret://service/postgresql-prod'
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
  assert.match(wizard, /TLS certificate secret:\/\/ reference/)
  assert.doesNotMatch(wizard, /Proxy auth secret:\/\/ reference|Local repository \/ mirror|Air-gapped bundle|HTTP\(S\) Proxy/)
  assert.match(wizard, /runAuthoritativeDeploy/)
  assert.match(wizard, /\$\{SERVICE_BLUEPRINT_API\}\/deploy/)
  assert.match(wizard, /idempotencyKey: deploymentKey/)
  assert.doesNotMatch(wizard, /managed certificate \/ internal PKI|Generate managed service credential/)
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


test('frontend native product-option ownership matches backend contract for all 27 families', () => {
  const expected = {
    postgresql: ['database_bootstrap','initial_databases','pgbouncer','pgbouncer_placement','pg_stat_statements','postgis','postgis_target','postgis_databases'],
    'mysql-family': ['database_bootstrap','database_name'],
    mariadb: ['database_bootstrap','database_name'],
    'mongodb-community': ['credential_scope_mode','database_name'],
    'percona-mongodb': ['credential_scope_mode','database_name'],
    ferretdb: ['database_name'],
    redis: ['persistence_policy'],
    valkey: ['persistence_policy'],
    clickhouse: ['database_bootstrap','database_name'],
    cassandra: ['keyspace_bootstrap','keyspace'],
    yugabytedb: ['api','namespace_bootstrap','database_or_namespace'],
    rabbitmq: ['vhost_mode','vhost','durability_profile'],
    kafka: ['topic_bootstrap','topic','durability_profile'],
    pulsar: ['metadata_store','namespace_bootstrap','tenant','namespace','configuration_store'],
    nginx: ['service_role','source_ref'],
    'apache-httpd': ['service_role','source_ref'],
    tomcat: ['deployment_mode','artifact_ref','session_mode'],
    keycloak: ['admin_exposure','admin_fqdn'],
    superset: ['secret_mode','secret_ref'],
    airflow: ['dag_ref','secret_mode','secret_ref'],
    openbao: ['seal_mode','seal_ref'],
    jenkins: ['agent_source','agent_ref'],
    forgejo: ['git_ssh','git_ssh_port'],
    opensearch: ['security_config_mode','security_config_ref'],
    prometheus: ['history_mode','history_ref','scrape_mode','scrape_ref','alerting_mode','alertmanager_ref'],
    grafana: ['datasource_mode','datasource_ref','session_mode','session_ref','alerting_ha_mode','alerting_ha_ref'],
    alloy: ['config_mode','config_ref'],
  }

  assert.equal(Object.keys(expected).length, 27)
  assert.deepEqual(Object.keys(api.NATIVE_PRODUCT_OPTION_BINDINGS).sort(), Object.keys(expected).sort())
  for (const [id, keys] of Object.entries(expected)) {
    assert.deepEqual(
      [
        ...Object.values(api.NATIVE_PRODUCT_OPTION_BINDINGS[id]),
        ...(api.NATIVE_PRODUCT_DERIVED_OPTION_KEYS[id] || []),
      ].sort(),
      [...keys].sort(),
      id
    )
  }
})

test('each application renders only unique fields from its native GUI contract', () => {
  for (const blueprint of api.FALLBACK_BLUEPRINTS) {
    const draft = api.createDraft(blueprint.id)
    const fields = api.getProductConfigFields(draft, blueprint)
    const allowedDraftKeys = new Set(
      Object.keys(api.NATIVE_PRODUCT_OPTION_BINDINGS[blueprint.id] || {})
    )
    const seen = new Set()
    for (const field of fields) {
      assert.ok(allowedDraftKeys.has(field.key), `${blueprint.id}: foreign GUI field ${field.key}`)
      assert.equal(seen.has(field.key), false, `${blueprint.id}: duplicate GUI field ${field.key}`)
      seen.add(field.key)
    }
  }
})

test('compiled desired state never leaks another application native fields', () => {
  const allBackendKeys = new Set([
    ...Object.values(api.NATIVE_PRODUCT_OPTION_BINDINGS).flatMap((bindings) =>
      Object.values(bindings)
    ),
    ...Object.values(api.NATIVE_PRODUCT_DERIVED_OPTION_KEYS).flat(),
  ])

  for (const blueprint of api.FALLBACK_BLUEPRINTS) {
    const draft = makeValid(blueprint)
    draft.pgStatStatements = true
    draft.sqlDbName = 'wrong_mysql_db'
    draft.kafkaTopic = 'wrong-kafka-topic'
    draft.grafanaSession = 'Existing Redis session store'
    draft.grafanaSessionRef = 'redis.foreign.internal'
    draft.airflowDagRef = 'git:foreign/dags@bad'

    const compiled = api.compilePlatformDesiredState(draft, blueprint)
    const allowed = new Set([
      ...Object.values(api.NATIVE_PRODUCT_OPTION_BINDINGS[blueprint.id] || {}),
      ...(api.NATIVE_PRODUCT_DERIVED_OPTION_KEYS[blueprint.id] || []),
    ])
    for (const key of Object.keys(compiled.product_options || {})) {
      assert.ok(allowed.has(key), `${blueprint.id}: foreign product option ${key}`)
      assert.ok(allBackendKeys.has(key), `${blueprint.id}: unknown product option ${key}`)
    }

    const safe = api.sanitizeDesign(draft, blueprint)
    const allowedDraftKeys = new Set(
      Object.keys(api.NATIVE_PRODUCT_OPTION_BINDINGS[blueprint.id] || {})
    )
    for (const [foreignId, bindings] of Object.entries(api.NATIVE_PRODUCT_OPTION_BINDINGS)) {
      if (foreignId === blueprint.id) continue
      for (const draftKey of Object.keys(bindings)) {
        if (!allowedDraftKeys.has(draftKey)) {
          assert.equal(Object.hasOwn(safe, draftKey), false, `${blueprint.id}: leaked ${draftKey}`)
        }
      }
    }
  }
})

test('dependency-native applications serialize immutable dependency references only', () => {
  for (const id of ['ferretdb','keycloak','superset','airflow','forgejo','grafana','alloy']) {
    const blueprint = api.getBlueprintById(id)
    const draft = makeValid(blueprint)
    const compiled = api.compilePlatformDesiredState(draft, blueprint)
    const specs = api.getDependencySpecs(draft, blueprint)
    assert.equal(compiled.dependencies.length, specs.length, id)
    for (const dependency of compiled.dependencies) {
      assert.ok(dependency.reference, `${id}: missing dependency reference`)
      assert.ok(['service','storage','external'].includes(dependency.kind), id)
    }
  }
})

test('NGINX and Apache reverse-proxy workflow exposes upstream reference exactly once', () => {
  for (const id of ['nginx', 'apache-httpd']) {
    const blueprint = api.getBlueprintById(id)
    const draft = api.createDraft(id)
    draft.webMode = 'Reverse proxy'
    const fields = api.getProductConfigFields(draft, blueprint)
    assert.equal(fields.filter(({ key }) => key === 'webSourceRef').length, 1, id)
  }
})

test('native discovery products do not expose generic load balancers that break client topology', () => {
  for (const id of ['mongodb-community', 'percona-mongodb', 'cassandra']) {
    const bp = api.getBlueprintById(id)
    const draft = api.createDraft(id)
    const options = api.getEndpointOptions(draft, bp)
    assert.equal(options.includes('Existing load balancer'), false, id)
  }
  for (const id of ['redis', 'valkey']) {
    const bp = api.getBlueprintById(id)
    const draft = api.createDraft(id)
    assert.notEqual(draft.topology, 'Standalone')
    assert.deepEqual(api.getEndpointOptions(draft, bp), ['Native Sentinel/Cluster discovery'])
    draft.topology = 'Standalone'
    assert.ok(api.getEndpointOptions(draft, bp).includes('Direct service endpoint'))
  }
  assert.deepEqual(
    api.getEndpointOptions(api.createDraft('kafka'), api.getBlueprintById('kafka')),
    ['Native bootstrap broker list']
  )
})

test('DR intent is owned by native DR topology and never by a generic switch', () => {
  for (const id of ['nginx', 'grafana', 'kafka', 'opensearch']) {
    const bp = api.getBlueprintById(id)
    const draft = api.createDraft(id)
    draft.drEnabled = true
    draft.drTarget = 'should-not-leak'
    const compiled = api.compilePlatformDesiredState(draft, bp)
    assert.equal(compiled.dr.enabled, false, id)
    assert.equal(compiled.dr.target_site, '', id)
  }

  const pg = api.getBlueprintById('postgresql')
  const pgDraft = makeValid(pg)
  pgDraft.topology = 'HA + DR'
  pgDraft.drTarget = 'secondary-site'
  pgDraft.rpoMinutes = 5
  pgDraft.rtoMinutes = 30
  const pgCompiled = api.compilePlatformDesiredState(pgDraft, pg)
  assert.equal(pgCompiled.dr.enabled, true)
  assert.equal(pgCompiled.dr.target_site, 'secondary-site')

  const yb = api.getBlueprintById('yugabytedb')
  const ybDraft = makeValid(yb)
  ybDraft.topology = 'xCluster DR: 3 TServers + 3 Masters per universe'
  ybDraft.drTarget = 'yb-secondary'
  assert.equal(api.compilePlatformDesiredState(ybDraft, yb).dr.enabled, true)
})

test('managed storage uses native mountpoints and backup repositories are not guest disks', () => {
  const forbiddenRoles = /backup repository|snapshot repository/i
  for (const bp of api.FALLBACK_BLUEPRINTS) {
    const draft = api.createDraft(bp.id)
    const storage = api.getStorageTemplate(draft, bp)
    for (const item of storage) {
      assert.equal(Boolean(item.dependency), false, `${bp.id}: storage dependency belongs in dependency/native option flow`)
      assert.match(item.mountpoint, /^\//, `${bp.id}: ${item.role} missing native mountpoint`)
      assert.equal(forbiddenRoles.test(item.role), false, `${bp.id}: backup target duplicated as guest storage`)
      assert.ok(['Single disk','Existing SAN / LUN','Existing mount'].includes(item.layout), `${bp.id}: unsupported layout ${item.layout}`)
    }
  }

  const pgDraft = makeValid(api.getBlueprintById('postgresql'))
  pgDraft.backupRepositoryRef = 'barman://primary'
  const compiled = api.compilePlatformDesiredState(pgDraft, api.getBlueprintById('postgresql'))
  assert.equal(compiled.backup.repository, 'barman://primary')
  assert.equal(compiled.storage.some(({ role }) => /backup|snapshot/i.test(role)), false)
})

test('stateless and dependency-owned applications do not expose fake persistent-data sizing', () => {
  for (const id of ['nginx','apache-httpd','tomcat','ferretdb','keycloak','superset','airflow','forgejo','grafana','alloy']) {
    const profile = api.getCapacityProfile(api.getBlueprintById(id))
    assert.equal(profile.data, false, id)
    assert.equal(profile.growth, false, id)
    const draft = api.createDraft(id)
    assert.equal(draft.expectedDataGiB, 0, id)
  }
})

test('compiled storage roles are stable machine-safe identifiers', () => {
  for (const id of ['postgresql','mysql-family','mongodb-community','redis','pulsar']) {
    const bp = api.getBlueprintById(id)
    const draft = makeValid(bp)
    const compiled = api.compilePlatformDesiredState(draft, bp)
    for (const volume of compiled.storage) {
      assert.match(volume.role, /^[a-z0-9]+(?:_[a-z0-9]+)*$/, `${id}: ${volume.role}`)
    }
  }
})

test('production wizard omits non-functional shared controls', () => {
  const wizard = fs.readFileSync(
    path.join(fireedgeRoot, 'src/client/apps/layersentry/pages/ProductionServiceWizard.js'),
    'utf8'
  )
  for (const forbidden of [
    'label="Environment"',
    'label="Availability"',
    'Monitoring enabled',
    'Central logging enabled',
    'label="OS access"',
    'label="Hardening profile"',
    'LayerSentry managed certificate / internal PKI',
    'Generate managed service credential',
    'Proxy username',
    'Proxy password',
    'Advanced storage placement',
    'LVM',
    'Striped managed disks',
    'Local repository / mirror',
    'Air-gapped bundle',
    'HTTP(S) Proxy',
    'DNS registration',
    'Manual DNS records',
    'Existing DNS workflow',
  ]) {
    assert.equal(wizard.includes(forbidden), false, forbidden)
  }
  assert.match(wizard, /Managed SSH-key bootstrap/)
  assert.match(wizard, /standard production hardening/)
  assert.match(wizard, /tuple-qualified monitoring\/logging/)
})

test('environment and backend policy are fixed to production semantics', () => {
  const bp = api.getBlueprintById('nginx')
  const draft = makeValid(bp)
  draft.environment = 'Development'
  const compiled = api.compilePlatformDesiredState(draft, bp)
  assert.equal(compiled.deployment.environment, 'production')
  assert.equal(compiled.security.ssh_auth, 'ssh_key_managed')
  assert.equal(compiled.security.hardening_profile, 'standard-production')
})

test('Alloy has no customer endpoint, service certificate or firewall port intent', () => {
  const bp = api.getBlueprintById('alloy')
  const draft = makeValid(bp)
  const profile = api.getNetworkProfile(draft, bp)
  assert.equal(profile.customerTraffic, false)
  const compiled = api.compilePlatformDesiredState(draft, bp)
  assert.equal(compiled.network.endpoint.mode, 'none')
  assert.equal(compiled.network.endpoint.fqdn, '')
  assert.equal(compiled.network.endpoint.backend_port, 0)
  assert.equal(compiled.security.tls, false)
  assert.equal(compiled.security.certificate_secret_ref, '')
})

test('PostgreSQL workflow does not advertise unimplemented dedicated auxiliary VMs', () => {
  const bp = api.getBlueprintById('postgresql')
  const draft = api.createDraft('postgresql')
  const fields = api.getProductConfigFields(draft, bp)
  const serialized = JSON.stringify(fields)
  assert.doesNotMatch(serialized, /Dedicated 3-node etcd|Dedicated HA pair|Dedicated Barman VM/)
  assert.deepEqual(
    fields.find(({ key }) => key === 'pgbouncerPlacement').options,
    ['On PostgreSQL nodes', 'Disabled']
  )
  const plan = api.getArchitecturePlan(draft, bp)
  assert.equal(plan.linkedDedicated, 0)
  assert.equal(plan.dedicated, 3)
  assert.ok(plan.shared.some((item) => /etcd DCS/.test(item)))
})

test('advertised endpoint options are executable or explicit external/native references only', () => {
  const forbidden = /LayerSentry managed|Dedicated Patroni|MySQL Router HA|MaxScale HA|Pulsar Proxy HA/
  for (const bp of api.FALLBACK_BLUEPRINTS) {
    const draft = api.createDraft(bp.id)
    for (const endpoint of api.getEndpointOptions(draft, bp)) {
      assert.doesNotMatch(endpoint, forbidden, `${bp.id}: ${endpoint}`)
    }
  }
})

test('native discovery compiles without a synthetic service FQDN or VIP', () => {
  for (const id of ['mongodb-community','percona-mongodb','redis','valkey','cassandra','yugabytedb','rabbitmq','kafka','pulsar','opensearch']) {
    const bp = api.getBlueprintById(id)
    const draft = makeValid(bp)
    if (id === 'redis' || id === 'valkey') {
      assert.notEqual(draft.topology, 'Standalone')
    }
    const profile = api.getNetworkProfile(draft, bp)
    assert.equal(profile.nativeDiscovery, true, id)
    const compiled = api.compilePlatformDesiredState(draft, bp)
    assert.equal(compiled.network.endpoint.mode, 'native_discovery', id)
    assert.equal(compiled.network.endpoint.fqdn, '', id)
    assert.equal(compiled.network.endpoint.vip, '', id)
    assert.ok(compiled.network.endpoint.backend_port > 0, id)
  }
})

test('compiled native storage role IDs match backend blueprint ownership', () => {
  const expected = {
    postgresql: ['data', 'wal'],
    'mysql-family': ['data', 'redo_binlog'],
    mariadb: ['data', 'redo_binlog'],
    'mongodb-community': ['data', 'journal'],
    'percona-mongodb': ['data', 'journal'],
    redis: ['persistence_data'],
    valkey: ['persistence_data'],
    clickhouse: ['data'],
    cassandra: ['data', 'commit_log'],
    yugabytedb: ['tablet_data', 'wal', 'master_metadata'],
    rabbitmq: ['message_data'],
    kafka: ['broker_data'],
    pulsar: ['bookkeeper_journal', 'bookkeeper_ledger'],
    openbao: ['raft_data'],
    jenkins: ['jenkins_home'],
    opensearch: ['index_data'],
    prometheus: ['tsdb'],
  }

  for (const [id, roles] of Object.entries(expected)) {
    const bp = api.getBlueprintById(id)
    const draft = makeValid(bp)
    const compiled = api.compilePlatformDesiredState(draft, bp)
    assert.deepEqual(
      compiled.storage.map(({ role }) => role),
      roles,
      id
    )
  }
})

test('runtime service-blueprint catalog mirrors all frontend families and stays fail-closed', () => {
  const serverCatalogPath = path.join(
    fireedgeRoot,
    'src/server/routes/api/serviceblueprints/catalog.js'
  )
  const serverCatalog = require(serverCatalogPath)
  const runtimeItems = serverCatalog.getCatalog()

  assert.equal(runtimeItems.length, api.FALLBACK_BLUEPRINTS.length)
  assert.deepEqual(
    runtimeItems.map(({ id }) => id).sort(),
    api.FALLBACK_BLUEPRINTS.map(({ id }) => id).sort()
  )

  for (const item of runtimeItems) {
    const frontend = api.getBlueprintById(item.id)
    assert.ok(frontend, item.id)
    assert.equal(item.productionSelectable, false, item.id)
    assert.equal(item.executionBackendQualified, false, item.id)
    assert.equal(item.qualification, 'NOT_TESTED', item.id)
    assert.ok(item.versions.length > 0, item.id)
    for (const version of item.versions) {
      assert.ok(
        frontend.versions.includes(version),
        `${item.id}: runtime version ${version} must exist in frontend catalog`
      )
    }
  }
})

test('FireEdge registers authenticated production-service catalog, preflight and deploy routes', () => {
  const apiIndex = fs.readFileSync(
    path.join(fireedgeRoot, 'src/server/routes/api/index.js'),
    'utf8'
  )
  const routesSource = fs.readFileSync(
    path.join(
      fireedgeRoot,
      'src/server/routes/api/serviceblueprints/routes.js'
    ),
    'utf8'
  )
  const functionsSource = fs.readFileSync(
    path.join(
      fireedgeRoot,
      'src/server/routes/api/serviceblueprints/functions.js'
    ),
    'utf8'
  )

  assert.match(apiIndex, /'serviceblueprints'/)
  assert.match(routesSource, /path: basepath/)
  assert.match(routesSource, /preflight/)
  assert.match(routesSource, /deploy/)
  assert.ok(
    (routesSource.match(/auth: true/g) || []).length >= 3,
    'all production-service API routes must require authentication'
  )
  assert.match(functionsSource, /platformRequest/)
  assert.match(functionsSource, /\/v1\/vm-services\/capabilities/)
  assert.match(functionsSource, /\/v1\/vm-services\/preflight/)
  assert.doesNotMatch(functionsSource, /findQualifiedTuple/)
  assert.match(functionsSource, /\/v1\/vm-services\/deploy/)
  assert.match(functionsSource, /idempotencyKey/)
  assert.doesNotMatch(functionsSource, /productionSelectable:\s*true/)
})

test('runtime catalog endpoint path matches the production-service frontend API contract', () => {
  const frontendSource = fs.readFileSync(modelPath, 'utf8')
  const routesSource = fs.readFileSync(
    path.join(
      fireedgeRoot,
      'src/server/routes/api/serviceblueprints/routes.js'
    ),
    'utf8'
  )

  assert.match(
    frontendSource,
    /SERVICE_BLUEPRINT_API = '\/api\/v1\/service-blueprints'/
  )
  assert.match(routesSource, /const basepath = '\/v1\/service-blueprints'/)
})


test('wizard unwraps FireEdge runtime catalog responses and calls authoritative preflight', () => {
  const wizard = fs.readFileSync(
    path.join(
      fireedgeRoot,
      'src/client/apps/layersentry/pages/ProductionServiceWizard.js'
    ),
    'utf8'
  )

  assert.match(wizard, /const responseData = payload\?\.data \?\? payload/)
  assert.match(wizard, /\$\{SERVICE_BLUEPRINT_API\}\/preflight/)
  assert.match(wizard, /method: 'POST'/)
  assert.match(wizard, /credentials: 'same-origin'/)
  assert.match(wizard, /desiredState: sanitizeDesign\(draft, blueprint\)/)
  assert.match(
    wizard,
    /platformDesiredState: compilePlatformDesiredState\(draft, blueprint\)/
  )
  assert.match(wizard, /SERVICE_BLUEPRINT_PREFLIGHT_UNAVAILABLE/)
  assert.match(wizard, /Authoritative preflight blocked/)
  assert.match(wizard, /Ansible role available/)
  assert.match(wizard, /sourceRoleAvailable/)
  assert.match(wizard, /supportedBlueprints/)
  assert.match(wizard, /preflightState\.status !== 'passed'/)
  assert.doesNotMatch(
    wizard,
    /!blueprint\?\.productionSelectable\s*\|\|\s*!validated/
  )
})


test('runtime service-blueprint handlers delegate tuple authority and fail closed', async () => {
  const Module = require('node:module')
  const previousNodePath = process.env.NODE_PATH
  process.env.NODE_PATH = [
    path.join(fireedgeRoot, 'src'),
    previousNodePath,
  ]
    .filter(Boolean)
    .join(path.delimiter)
  Module._initPaths()

  const platformPath = path.join(
    fireedgeRoot,
    'src/server/routes/api/serviceblueprints/platform.js'
  )
  const functionsPath = path.join(
    fireedgeRoot,
    'src/server/routes/api/serviceblueprints/functions.js'
  )
  const platform = require(platformPath)
  const originalPlatformRequest = platform.platformRequest
  let observedPlatformRequest

  platform.platformRequest = async (request) => {
    observedPlatformRequest = request
    if (request.path === '/v1/vm-services/capabilities') {
      return {
        durableStoreReady: true,
        providerMutationEnabled: true,
        deploymentEnabled: true,
        supportedBlueprints: api.FALLBACK_BLUEPRINTS.map(({ id }) => id),
      }
    }
    if (request.path === '/v1/vm-services/deploy') {
      return {
        accepted: true,
        replay: false,
        operation_id: 'op-test',
        service_id: request.data.service_id,
        stage: 'DRAFT',
        status: 'PENDING',
      }
    }
    const error = new Error('tuple not promoted')
    error.response = {
      status: 409,
      data: {
        deployable: false,
        blockers: [
          {
            code: 'SERVICE_BLUEPRINT_TUPLE_NOT_PROMOTED',
            message: 'The exact tuple is not promoted.',
          },
        ],
      },
    }
    throw error
  }
  delete require.cache[require.resolve(functionsPath)]

  try {
    const handlers = require(functionsPath)

    const invoke = (handler, params = {}) => {
      const res = { locals: {} }
      let nextCount = 0
      handler(res, () => {
        nextCount += 1
      }, params)
      assert.equal(nextCount, 1)

      return res.locals.httpCode
    }
    const invokeAsync = (handler, params = {}) =>
      new Promise((resolve, reject) => {
        const res = { locals: {} }
        let nextCount = 0
        try {
          handler(
            res,
            () => {
              nextCount += 1
              try {
                assert.equal(nextCount, 1)
                resolve(res.locals.httpCode)
              } catch (error) {
                reject(error)
              }
            },
            params
          )
        } catch (error) {
          reject(error)
        }
      })

    const catalogResponse = await invokeAsync(handlers.list)
    assert.equal(catalogResponse.id, 200)
    assert.equal(catalogResponse.data.failClosed, true)
    assert.equal(catalogResponse.data.items.length, 27)
    assert.equal(catalogResponse.data.capabilities.available, true)
    assert.equal(catalogResponse.data.capabilities.supportedBlueprints.length, 27)
    assert.ok(
      catalogResponse.data.items.every(
        ({ sourceRoleAvailable }) => sourceRoleAvailable === true
      )
    )

    const postgresql = api.getBlueprintById('postgresql')
    const validDraft = makeValid(postgresql)
    const validDesiredState = api.sanitizeDesign(validDraft)
    const validPlatformDesiredState = api.compilePlatformDesiredState(
      validDraft,
      postgresql
    )

    const blockedPreflight = await invokeAsync(handlers.preflight, {
      blueprintId: 'postgresql',
      version: '18',
      topology: '3-node HA',
      desiredState: validDesiredState,
      platformDesiredState: validPlatformDesiredState,
    })
    assert.equal(blockedPreflight.id, 409)
    assert.equal(blockedPreflight.data.deployable, false)
    assert.equal(
      blockedPreflight.data.blockers[0].code,
      'SERVICE_BLUEPRINT_TUPLE_NOT_PROMOTED'
    )
    assert.equal(observedPlatformRequest.method, 'POST')
    assert.equal(observedPlatformRequest.path, '/v1/vm-services/preflight')
    assert.deepEqual(
      observedPlatformRequest.data.desired_state,
      validPlatformDesiredState
    )

    const badVersion = invoke(handlers.preflight, {
      blueprintId: 'postgresql',
      version: '999',
      topology: '3-node HA',
      desiredState: validDesiredState,
    })
    assert.equal(badVersion.id, 409)
    assert.equal(
      badVersion.data.blockers[0].code,
      'SERVICE_BLUEPRINT_VERSION_NOT_PUBLISHED'
    )

    const secretLeak = invoke(handlers.preflight, {
      blueprintId: 'postgresql',
      version: '18',
      topology: '3-node HA',
      desiredState: {
        ...validDesiredState,
        proxyPassword: 'raw-secret-must-never-be-persisted',
      },
    })
    assert.equal(secretLeak.id, 400)
    assert.equal(
      secretLeak.data.blockers[0].code,
      'SERVICE_BLUEPRINT_DESIRED_STATE_INVALID'
    )
    assert.ok(
      secretLeak.data.validationErrors.some(
        ({ code }) => code === 'DESIRED_STATE_CONTAINS_SECRET'
      )
    )

    const deployResponse = await invokeAsync(handlers.deploy, {
      blueprintId: 'postgresql',
      version: '18',
      topology: '3-node HA',
      serviceId: 'postgres-prod',
      idempotencyKey: 'idem-test-1',
      desiredState: validDesiredState,
      platformDesiredState: validPlatformDesiredState,
    })
    assert.equal(deployResponse.id, 200)
    assert.equal(deployResponse.data.accepted, true)
    assert.equal(deployResponse.data.operation_id, 'op-test')
    assert.equal(observedPlatformRequest.method, 'POST')
    assert.equal(observedPlatformRequest.path, '/v1/vm-services/deploy')
    assert.equal(observedPlatformRequest.idempotencyKey, 'idem-test-1')
    assert.equal(observedPlatformRequest.data.service_id, 'postgres-prod')
    assert.deepEqual(
      observedPlatformRequest.data.desired_state,
      validPlatformDesiredState
    )
  } finally {
    platform.platformRequest = originalPlatformRequest
    delete require.cache[require.resolve(functionsPath)]
    process.env.NODE_PATH = previousNodePath
    Module._initPaths()
  }
})

test('exact tuple registry starts empty and validates immutable promotion records', () => {
  const tuples = require(path.join(
    fireedgeRoot,
    'src/server/routes/api/serviceblueprints/tuples.js'
  ))

  assert.deepEqual(tuples.PROMOTED_TUPLES, [])
  assert.equal(
    tuples.findQualifiedTuple({
      blueprintId: 'postgresql',
      version: '18',
      topology: '3-node HA',
    }),
    undefined
  )

  const qualified = {
    id: 'postgresql-18.6-rocky9-x86_64-v1',
    blueprintId: 'postgresql',
    version: '18',
    edition: '',
    topology: '3-node HA',
    exactApplicationVersion: '18.6',
    osFamily: 'rocky9',
    imageId: 'image-123',
    imageDigest:
      'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    architecture: 'x86_64',
    sourceSha: '0123456789abcdef',
    dependencyLock: 'lock-2026-09-20',
    qualification: 'QUALIFIED',
    executionBackend: 'oneflow+ansible-v1',
  }

  assert.deepEqual(tuples.validateTupleDefinition(qualified), [])

  const unsafe = {
    ...qualified,
    architecture: 'arm64',
    qualification: 'NOT_TESTED',
    imageDigest: 'floating-latest',
  }
  const errors = tuples.validateTupleDefinition(unsafe)
  assert.ok(errors.some((message) => /x86_64/.test(message)))
  assert.ok(errors.some((message) => /QUALIFIED/.test(message)))
  assert.ok(errors.some((message) => /SHA-256/.test(message)))
})

test('private platform bridge uses immutable OpenNebula UID and keeps mutation fail-closed', async (t) => {
  const Module = require('node:module')
  const http = require('node:http')
  const previousNodePath = process.env.NODE_PATH
  process.env.NODE_PATH = [
    path.join(fireedgeRoot, 'src'),
    previousNodePath,
  ]
    .filter(Boolean)
    .join(path.delimiter)
  Module._initPaths()

  let server
  try {
    const platform = require(path.join(
      fireedgeRoot,
      'src/server/routes/api/serviceblueprints/platform.js'
    ))

    assert.throws(
      () => platform.validatePlatformUrl('http://10.20.30.40:9444'),
      /must use HTTPS/
    )
    assert.equal(
      platform.validatePlatformUrl('http://127.0.0.1:9444').hostname,
      '127.0.0.1'
    )
    assert.equal(
      platform.validatePlatformUrl('https://platform.example.internal:9444')
        .protocol,
      'https:'
    )

    const gatewayToken = 'g'.repeat(40)
    let observed
    server = http.createServer((req, res) => {
      observed = {
        method: req.method,
        url: req.url,
        token: req.headers['x-layersentry-gateway-token'],
        user: req.headers['x-layersentry-user'],
        uid: req.headers['x-layersentry-uid'],
        oneadmin: req.headers['x-layersentry-oneadmin'],
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          capability: {
            durableStoreReady: true,
            providerMutationEnabled: false,
            deploymentEnabled: false,
          },
        })
      )
    })
    await new Promise((resolve) =>
      server.listen(0, '127.0.0.1', resolve)
    )
    t.after(
      () =>
        new Promise((resolve) => {
          server.close(resolve)
        })
    )

    const oneConnection = (user, password) => {
      assert.equal(user, 'tester')
      assert.equal(password, 'session-only-value')

      return ({ action, parameters, callback }) => {
        assert.equal(action, 'user.info')
        assert.deepEqual(parameters, [-1, false])
        callback(null, {
          USER: {
            ID: '42',
            NAME: 'tester',
          },
        })
      }
    }

    const address = server.address()
    const response = await platform.platformRequest(
      {
        method: 'GET',
        path: '/v1/vm-services/capabilities',
      },
      {
        user: 'tester',
        password: 'session-only-value',
      },
      oneConnection,
      {
        baseURL: `http://127.0.0.1:${address.port}`,
        gatewayToken,
        timeout: 2_000,
      }
    )

    assert.equal(response.capability.durableStoreReady, true)
    assert.equal(response.capability.providerMutationEnabled, false)
    assert.equal(response.capability.deploymentEnabled, false)
    assert.deepEqual(observed, {
      method: 'GET',
      url: '/v1/vm-services/capabilities',
      token: gatewayToken,
      user: 'tester',
      uid: '42',
      oneadmin: 'false',
    })

    const defaultsSource = fs.readFileSync(
      path.join(
        fireedgeRoot,
        'src/server/utils/constants/defaults.js'
      ),
      'utf8'
    )
    assert.match(
      defaultsSource,
      /\[appName\]: \['layersentry_platform_gateway_token'\]/
    )
  } finally {
    process.env.NODE_PATH = previousNodePath
    Module._initPaths()
  }
})

