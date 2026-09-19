/* ------------------------------------------------------------------------- *
 * LayerSentry VM service blueprint presentation and validation model.
 *
 * This module is deliberately fail-closed. The local catalog is a UX fallback
 * only; no local entry is deployable until the authoritative backend promotes
 * an exact immutable product/version/topology/OS tuple.
 * ------------------------------------------------------------------------- */
/* eslint-disable jsdoc/require-jsdoc */

export const SERVICE_BLUEPRINT_API = '/api/v1/service-blueprints'

export const WIZARD_STEPS = [
  'Choose Service',
  'Version & Deployment',
  'Capacity',
  'Storage',
  'Network & Availability',
  'Backup & Recovery',
  'Security & Observability',
  'Review',
]

const catalogItem = (input) => ({
  qualification: 'NOT_TESTED',
  productionSelectable: false,
  ...input,
})

export const FALLBACK_BLUEPRINTS = [
  catalogItem({
    id: 'postgresql',
    category: 'Databases & Data',
    name: 'PostgreSQL',
    icon: 'PG',
    description: 'Relational database with Patroni HA and application-aware recovery.',
    versions: ['16', '17', '18'],
    topologies: ['Standalone', '3-node HA', '5-node HA', 'HA + DR'],
    recommendedTopology: '3-node HA',
    workloads: ['OLTP', 'OLAP', 'Mixed'],
    defaultPort: 5432,
    supportsPitr: true,
  }),
  catalogItem({
    id: 'mysql-family',
    category: 'Databases & Data',
    name: 'MySQL Family',
    icon: 'MY',
    description: 'MySQL Community and Percona production patterns.',
    versions: ['8.4 LTS', '9.7 LTS'],
    editions: [
      'MySQL Community',
      'Percona Server for MySQL',
      'Percona XtraDB Cluster',
    ],
    topologies: ['Standalone', '3-node InnoDB Cluster', '5-node InnoDB Cluster', 'ClusterSet DR'],
    recommendedTopology: '3-node InnoDB Cluster',
    workloads: ['OLTP', 'OLAP', 'Mixed'],
    defaultPort: 3306,
    supportsPitr: true,
  }),
  catalogItem({
    id: 'mariadb',
    category: 'Databases & Data',
    name: 'MariaDB Community',
    icon: 'MA',
    description: 'MariaDB with Galera quorum and asynchronous DR patterns.',
    versions: ['11.4 LTS', '11.8 LTS'],
    topologies: ['Standalone', '3-node Galera', '5-node Galera', '3-node Galera + asynchronous DR'],
    recommendedTopology: '3-node Galera',
    workloads: ['OLTP', 'Mixed'],
    defaultPort: 3306,
    supportsPitr: true,
  }),
  catalogItem({
    id: 'mongodb-community',
    category: 'Databases & Data',
    name: 'MongoDB Community',
    icon: 'MO',
    description: 'Replica-set and explicitly sized sharded MongoDB Community patterns.',
    versions: ['7.0', '8.0'],
    topologies: [
      '3-node Replica Set',
      '5-node Replica Set',
      'Sharded: 2 shards × 3 + 3 config + 2 mongos',
      'Sharded: 3 shards × 3 + 3 config + 2 mongos',
    ],
    recommendedTopology: '3-node Replica Set',
    workloads: ['Transactional', 'Document', 'Mixed'],
    defaultPort: 27017,
    supportsPitr: false,
  }),
  catalogItem({
    id: 'percona-mongodb',
    category: 'Databases & Data',
    name: 'Percona Server for MongoDB',
    icon: 'PM',
    description: 'Mongo-compatible community distribution with PBM recovery.',
    versions: ['7.0', '8.0'],
    topologies: [
      '3-node Replica Set',
      '5-node Replica Set',
      'Sharded: 2 shards × 3 + 3 config + 2 mongos',
      'Sharded: 3 shards × 3 + 3 config + 2 mongos',
    ],
    recommendedTopology: '3-node Replica Set',
    workloads: ['Transactional', 'Document', 'Mixed'],
    defaultPort: 27017,
    supportsPitr: true,
  }),
  catalogItem({
    id: 'ferretdb',
    category: 'Databases & Data',
    name: 'FerretDB',
    icon: 'FD',
    description: 'MongoDB-compatible frontend backed by PostgreSQL/DocumentDB.',
    versions: ['2.7'],
    topologies: ['1 FerretDB frontend', '2 FerretDB frontends (HA)'],
    recommendedTopology: '2 FerretDB frontends (HA)',
    workloads: ['Document', 'Mixed'],
    defaultPort: 27017,
    supportsPitr: true,
  }),
  catalogItem({
    id: 'redis',
    category: 'Databases & Data',
    name: 'Redis Open Source',
    icon: 'RD',
    description: 'In-memory service with explicit persistence and Sentinel/Cluster patterns.',
    versions: ['7.4', '8.2'],
    topologies: [
      'Standalone',
      'Sentinel HA (3 data nodes + 3 co-located Sentinels)',
      '6-node Cluster (3 primaries + 3 replicas)',
    ],
    recommendedTopology: 'Sentinel HA (3 data nodes + 3 co-located Sentinels)',
    workloads: ['Cache', 'Session', 'Mixed'],
    defaultPort: 6379,
    supportsPitr: false,
  }),
  catalogItem({
    id: 'valkey',
    category: 'Databases & Data',
    name: 'Valkey',
    icon: 'VK',
    description: 'Open-source in-memory data platform with Sentinel/Cluster patterns.',
    versions: ['8.1', '9.0'],
    topologies: [
      'Standalone',
      'Sentinel HA (3 data nodes + 3 co-located Sentinels)',
      '6-node Cluster (3 primaries + 3 replicas)',
    ],
    recommendedTopology: 'Sentinel HA (3 data nodes + 3 co-located Sentinels)',
    workloads: ['Cache', 'Session', 'Mixed'],
    defaultPort: 6379,
    supportsPitr: false,
  }),
  catalogItem({
    id: 'clickhouse',
    category: 'Databases & Data',
    name: 'ClickHouse',
    icon: 'CH',
    description: 'Columnar analytics database with dedicated Keeper quorum.',
    versions: ['26.3 LTS', '26.8 LTS'],
    topologies: ['Standalone', '3 data nodes + 3 Keeper', '2 shards × 2 replicas + 3 Keeper'],
    recommendedTopology: '3 data nodes + 3 Keeper',
    workloads: ['Analytics', 'Events', 'Mixed'],
    defaultPort: 9440,
    supportsPitr: false,
  }),
  catalogItem({
    id: 'cassandra',
    category: 'Databases & Data',
    name: 'Apache Cassandra',
    icon: 'CA',
    description: 'Distributed wide-column database with explicit RF/DC placement.',
    versions: ['5.0'],
    topologies: ['3-node Cluster (RF=3)', '5-node Cluster (RF=3)', 'Multi-DC: 3 nodes per DC minimum'],
    recommendedTopology: '3-node Cluster (RF=3)',
    workloads: ['Write-heavy', 'Mixed'],
    defaultPort: 9042,
    supportsPitr: false,
  }),
  catalogItem({
    id: 'yugabytedb',
    category: 'Databases & Data',
    name: 'YugabyteDB',
    icon: 'YB',
    description: 'Distributed SQL with dedicated persistent masters.',
    versions: ['2025.2 LTS'],
    topologies: [
      '3 TServers + 3 dedicated Masters (RF3)',
      '5 TServers + 3 dedicated Masters (RF3)',
      '3-region RF3: 3 TServers + 3 dedicated Masters',
      'xCluster DR: 3 TServers + 3 Masters per universe',
    ],
    recommendedTopology: '3 TServers + 3 dedicated Masters (RF3)',
    workloads: ['OLTP', 'Distributed SQL', 'Mixed'],
    defaultPort: 5433,
    supportsPitr: true,
  }),
  catalogItem({
    id: 'rabbitmq',
    category: 'Messaging & Streaming',
    name: 'RabbitMQ',
    icon: 'RQ',
    description: 'Message broker with quorum queues and federation DR.',
    versions: ['4.3'],
    topologies: ['3-node Quorum Cluster', '5-node Quorum Cluster', 'Federation DR: 3 + 3 nodes'],
    recommendedTopology: '3-node Quorum Cluster',
    workloads: ['Messaging', 'Task queues', 'Mixed'],
    defaultPort: 5671,
    supportsPitr: false,
  }),
  catalogItem({
    id: 'kafka',
    category: 'Messaging & Streaming',
    name: 'Apache Kafka',
    icon: 'KF',
    description: 'KRaft event streaming with dedicated brokers and controllers.',
    versions: ['4.3'],
    topologies: ['3 brokers + 3 controllers', '5 brokers + 3 controllers', '3 brokers + 5 controllers'],
    recommendedTopology: '3 brokers + 3 controllers',
    workloads: ['Streaming', 'Events', 'Mixed'],
    defaultPort: 9093,
    supportsPitr: false,
  }),
  catalogItem({
    id: 'pulsar',
    category: 'Messaging & Streaming',
    name: 'Apache Pulsar',
    icon: 'PS',
    description: 'Messaging/streaming with explicit metadata and BookKeeper ownership.',
    versions: ['4.0 LTS'],
    topologies: [
      'Production Cluster (3 broker+bookie + 3 metadata)',
      'Multi-cluster DR (2 × production cluster)',
    ],
    recommendedTopology: 'Production Cluster (3 broker+bookie + 3 metadata)',
    workloads: ['Streaming', 'Messaging', 'Mixed'],
    defaultPort: 6651,
    supportsPitr: false,
  }),
  catalogItem({
    id: 'nginx',
    category: 'Web & Application',
    name: 'NGINX OSS',
    icon: 'NG',
    description: 'Web/reverse-proxy service with explicit upstream/content ownership.',
    versions: ['1.30 stable'],
    topologies: ['Standalone', 'HA Reverse Proxy Pair'],
    recommendedTopology: 'HA Reverse Proxy Pair',
    workloads: ['Web', 'Reverse proxy'],
    defaultPort: 443,
    supportsPitr: false,
  }),
  catalogItem({
    id: 'apache-httpd',
    category: 'Web & Application',
    name: 'Apache HTTP Server',
    icon: 'AH',
    description: 'HTTP service with explicit content/upstream ownership.',
    versions: ['2.4'],
    topologies: ['Standalone', 'HA Pair'],
    recommendedTopology: 'HA Pair',
    workloads: ['Web', 'Static content'],
    defaultPort: 443,
    supportsPitr: false,
  }),
  catalogItem({
    id: 'tomcat',
    category: 'Web & Application',
    name: 'Apache Tomcat',
    icon: 'TC',
    description: 'Java application runtime with immutable artifact input.',
    versions: ['10.1', '11'],
    topologies: ['Standalone', 'Load Balanced Pair', '3-node Load Balanced'],
    recommendedTopology: 'Load Balanced Pair',
    workloads: ['Java web', 'API'],
    defaultPort: 8443,
    supportsPitr: false,
  }),
  catalogItem({
    id: 'keycloak',
    category: 'Web & Application',
    name: 'Keycloak',
    icon: 'KC',
    description: 'Identity service with external SQL dependency and private admin surface.',
    versions: ['26.7'],
    topologies: ['Standalone', '3-node HA Cluster'],
    recommendedTopology: '3-node HA Cluster',
    workloads: ['Identity', 'Authentication'],
    defaultPort: 8443,
    supportsPitr: true,
  }),
  catalogItem({
    id: 'superset',
    category: 'Web & Application',
    name: 'Apache Superset',
    icon: 'SS',
    description: 'BI platform with external metadata DB and distributed workers.',
    versions: ['6.1'],
    topologies: ['Standalone', 'Distributed'],
    recommendedTopology: 'Distributed',
    workloads: ['BI', 'Analytics'],
    defaultPort: 8088,
    supportsPitr: true,
  }),
  catalogItem({
    id: 'airflow',
    category: 'Web & Application',
    name: 'Apache Airflow',
    icon: 'AF',
    description: 'Workflow orchestration with explicit DAG, metadata, broker and log ownership.',
    versions: ['3.1'],
    topologies: ['Standalone', 'Distributed Celery'],
    recommendedTopology: 'Distributed Celery',
    workloads: ['Scheduling', 'Data workflows'],
    defaultPort: 8080,
    supportsPitr: true,
  }),
  catalogItem({
    id: 'openbao',
    category: 'DevOps & Security',
    name: 'OpenBao',
    icon: 'OB',
    description: 'Secrets management with integrated Raft storage.',
    versions: ['2.6'],
    topologies: ['Standalone', '3-node Raft', '5-node Raft'],
    recommendedTopology: '5-node Raft',
    workloads: ['Secrets', 'PKI'],
    defaultPort: 8200,
    supportsPitr: false,
  }),
  catalogItem({
    id: 'jenkins',
    category: 'DevOps & Security',
    name: 'Jenkins',
    icon: 'JE',
    description: 'Controller plus replaceable build agents.',
    versions: ['2.568 LTS'],
    topologies: ['Controller + 2 agents', 'Controller + 4 agents'],
    recommendedTopology: 'Controller + 2 agents',
    workloads: ['CI', 'Automation'],
    defaultPort: 8080,
    supportsPitr: false,
  }),
  catalogItem({
    id: 'forgejo',
    category: 'DevOps & Security',
    name: 'Forgejo',
    icon: 'FG',
    description: 'Git forge with external SQL and durable repository/object state.',
    versions: ['15 LTS'],
    topologies: ['Standalone', 'HA Pair'],
    recommendedTopology: 'HA Pair',
    workloads: ['Git hosting', 'Collaboration'],
    defaultPort: 443,
    supportsPitr: true,
  }),
  catalogItem({
    id: 'opensearch',
    category: 'Search & Observability',
    name: 'OpenSearch',
    icon: 'OS',
    description: 'Search/analytics with dedicated cluster managers and data nodes.',
    versions: ['3.8'],
    topologies: ['3 managers + 3 data', '3 managers + 6 data'],
    recommendedTopology: '3 managers + 3 data',
    workloads: ['Search', 'Logs', 'Analytics'],
    defaultPort: 9200,
    supportsPitr: false,
  }),
  catalogItem({
    id: 'prometheus',
    category: 'Search & Observability',
    name: 'Prometheus',
    icon: 'PR',
    description: 'Metrics collection with explicit alerting and scrape ownership.',
    versions: ['3.13 LTS'],
    topologies: ['Standalone', 'HA Pair'],
    recommendedTopology: 'HA Pair',
    workloads: ['Metrics', 'Monitoring'],
    defaultPort: 9090,
    supportsPitr: false,
  }),
  catalogItem({
    id: 'grafana',
    category: 'Search & Observability',
    name: 'Grafana OSS',
    icon: 'GF',
    description: 'Visualization/alerting with external SQL for HA.',
    versions: ['12.4', '13.2'],
    topologies: ['Standalone', 'HA Pair'],
    recommendedTopology: 'HA Pair',
    workloads: ['Dashboards', 'Alerting'],
    defaultPort: 3000,
    supportsPitr: true,
  }),
  catalogItem({
    id: 'alloy',
    category: 'Search & Observability',
    name: 'Grafana Alloy',
    icon: 'AL',
    description: 'Telemetry collector with versioned configuration ownership.',
    versions: ['1.19'],
    topologies: ['Node Collector', '3-node Clustered Collectors'],
    recommendedTopology: '3-node Clustered Collectors',
    workloads: ['Telemetry', 'Collection'],
    defaultPort: 12345,
    supportsPitr: false,
  }),
]

const PRODUCT_DEFAULTS = {
  sqlBootstrap: 'Create initial application database',
  sqlDbName: 'appdb',
  mongoScopeMode: 'Create application credential scope',
  mongoDbName: 'appdb',
  ferretDbName: 'appdb',
  kvPersistence: 'AOF + RDB (recommended)',
  clickBootstrap: 'Create initial database',
  clickDbName: 'appdb',
  cassBootstrap: 'Create initial keyspace',
  cassKeyspace: 'appks',
  ybApi: 'YSQL',
  ybBootstrap: 'Create initial database / namespace',
  ybDbName: 'appdb',
  rabbitVhostMode: 'Create application virtual host',
  rabbitVhost: '/app',
  kafkaTopicMode: 'Application creates topics explicitly (recommended)',
  kafkaTopic: '',
  kafkaDurability: 'RF=3 / min ISR=2 baseline',
  pulsarMetadata: 'Oxia (recommended for new clusters)',
  pulsarNamespaceMode: 'Create tenant + namespace',
  pulsarTenant: 'app',
  pulsarNamespace: 'default',
  pulsarConfigStore: 'Qualified shared/config metadata store',
  webMode: 'Reverse proxy',
  webSourceRef: '',
  tomcatDeploy: 'Runtime only',
  tomcatArtifactRef: '',
  keycloakAdminMode: 'Private/admin network only',
  keycloakAdminFqdn: '',
  supersetSecretMode: 'LayerSentry managed SECRET_KEY',
  supersetSecretRef: '',
  airflowDagRef: '',
  airflowSecretMode: 'LayerSentry managed Fernet/signing secrets',
  airflowSecretRef: '',
  baoSealMode: 'Shamir operator unseal',
  baoSealRef: '',
  jenkinsAgentSource: 'LayerSentry managed agent image/profile',
  jenkinsAgentRef: '',
  forgejoSsh: 'Enabled',
  forgejoSshPort: 22,
  openSearchSecurity: 'LayerSentry managed security configuration',
  openSearchSecurityRef: '',
  promScrapeMode: 'Configure scrape targets later',
  promScrapeRef: '',
  promAlerting: 'Provision 3-node Alertmanager',
  promAlertRef: '',
  grafanaDatasourceMode: 'Configure datasources later',
  grafanaDatasourceRef: '',
  grafanaSession: 'Sticky load-balancer sessions (recommended)',
  grafanaSessionRef: '',
  grafanaAlertHa: 'Memberlist (recommended)',
  grafanaAlertRef: '',
  alloyConfig: 'LayerSentry managed versioned configuration',
  alloyConfigRef: '',
  pgStatStatements: true,
  pgStatTarget: 'Initial database(s)',
  pgStatDatabases: '',
  postgis: false,
  postgisTarget: 'Initial database(s)',
  postgisDatabases: '',
  databaseBootstrap: 'Create initial database(s) during deployment',
  initialDatabases: 'appdb',
  dcsPlacement: 'Shared LayerSentry etcd DCS',
  pgbouncerPlacement: 'On PostgreSQL nodes',
  barmanPlacement: 'Shared Barman service',
}

const COMMON_DEFAULTS = {
  edition: '',
  version: '',
  topology: '',
  environment: 'Production',
  workload: 'General',
  capacityPreset: 'Medium',
  vcpu: 8,
  memoryGiB: 32,
  expectedDataGiB: 500,
  expectedConnections: 1000,
  expectedGrowthPercent: 25,
  serviceName: '',
  domain: '',
  serviceFqdn: '',
  ipMode: 'Automatic',
  staticIps: '',
  availability: 'Separate failure domains',
  endpointMode: '',
  externalEndpoint: '',
  portPolicy: 'Use product default',
  customPort: '',
  dnsRegistration: 'Automatic',
  dnsWorkflowRef: '',
  dnsZone: '',
  dnsRecordType: 'A/AAAA',
  dnsTtl: 300,
  dnsTargetMode: 'Use generated service endpoint',
  dnsTarget: '',
  backupEnabled: true,
  retentionDays: 30,
  pitr: false,
  pitrWindowHours: 72,
  backupRepositoryRef: '',
  drEnabled: false,
  drTarget: '',
  rpoMinutes: 15,
  rtoMinutes: 60,
  tls: true,
  monitoring: true,
  logging: true,
  accessMode: 'SSH key / managed access',
  hardeningProfile: 'Standard production hardening',
  packageSourceMode: 'Managed repositories',
  repoUrl: '',
  bundleId: '',
  internetAccess: 'Direct Internet',
  proxyUrl: '',
  proxyUsername: '',
  proxyPassword: '',
  proxyNoProxy: 'localhost,127.0.0.1,.internal',
  proxyCaRef: '',
  placementPolicy: 'Spread across qualified failure domains',
  dedicatedPool: '',
  storage: [],
  advancedOpen: {
    product: false,
    storage: false,
    network: false,
    backup: false,
    security: false,
  },
}

export const getBlueprintById = (id, catalog = FALLBACK_BLUEPRINTS) =>
  catalog.find(({ id: itemId }) => itemId === id)

const endpointDefaults = {
  postgresql: 'LayerSentry managed PostgreSQL endpoint',
  'mysql-family': 'LayerSentry managed MySQL endpoint',
  mariadb: 'LayerSentry managed MariaDB endpoint',
  'mongodb-community': 'Native multi-host / replica-set discovery',
  'percona-mongodb': 'Native multi-host / replica-set discovery',
  ferretdb: 'LayerSentry managed FerretDB endpoint',
  redis: 'Native Sentinel/Cluster discovery',
  valkey: 'Native Sentinel/Cluster discovery',
  clickhouse: 'Native multi-host client list',
  cassandra: 'Native multi-host client list',
  yugabytedb: 'LayerSentry managed YSQL/YCQL endpoint',
  rabbitmq: 'LayerSentry managed RabbitMQ endpoint',
  kafka: 'Native bootstrap broker list',
  pulsar: 'Pulsar Proxy HA pair',
  nginx: 'LayerSentry managed web endpoint',
  'apache-httpd': 'LayerSentry managed web endpoint',
  tomcat: 'LayerSentry managed web endpoint',
  keycloak: 'LayerSentry managed web endpoint',
  superset: 'LayerSentry managed web endpoint',
  airflow: 'LayerSentry managed web endpoint',
  openbao: 'LayerSentry managed OpenBao endpoint',
  jenkins: 'LayerSentry managed web endpoint',
  forgejo: 'LayerSentry managed web endpoint',
  opensearch: 'LayerSentry managed OpenSearch endpoint',
  prometheus: 'LayerSentry managed web endpoint',
  grafana: 'LayerSentry managed web endpoint',
  alloy: 'No customer service endpoint',
}

export const getTopologyOptions = (draft, blueprint) => {
  if (!blueprint) return []
  if (blueprint.id !== 'mysql-family') return blueprint.topologies

  if (draft.edition === 'Percona Server for MySQL') {
    return [
      'Standalone',
      '3-node Group Replication',
      '5-node Group Replication',
      '3-node Group Replication + asynchronous DR',
    ]
  }

  if (draft.edition === 'Percona XtraDB Cluster') {
    return [
      '3-node PXC',
      '5-node PXC',
      '3-node PXC + asynchronous DR',
    ]
  }

  return [
    'Standalone',
    '3-node InnoDB Cluster',
    '5-node InnoDB Cluster',
    'ClusterSet DR',
  ]
}

export const getRecommendedTopology = (draft, blueprint) => {
  if (!blueprint) return ''
  if (blueprint.id === 'mysql-family') {
    if (draft.edition === 'Percona Server for MySQL') {
      return '3-node Group Replication'
    }
    if (draft.edition === 'Percona XtraDB Cluster') return '3-node PXC'
  }
  return blueprint.recommendedTopology || blueprint.topologies[0]
}

export const getEndpointOptions = (draft, blueprint) => {
  if (!blueprint) return []

  if (blueprint.id === 'mysql-family') {
    if (draft.topology === 'Standalone') {
      return ['Direct service endpoint', 'Existing load balancer']
    }
    return [
      'MySQL Router HA pair',
      'Existing load balancer',
      'LayerSentry managed MySQL endpoint',
    ]
  }

  const options = {
    postgresql: [
      'LayerSentry managed PostgreSQL endpoint',
      'Existing load balancer',
      'Dedicated Patroni-aware endpoint pair',
    ],
    mariadb: [
      'LayerSentry managed MariaDB endpoint',
      'Existing load balancer',
      'MariaDB MaxScale HA pair',
    ],
    'mongodb-community': [
      'Native multi-host / replica-set discovery',
      'Existing load balancer',
    ],
    'percona-mongodb': [
      'Native multi-host / replica-set discovery',
      'Existing load balancer',
    ],
    ferretdb: ['LayerSentry managed FerretDB endpoint', 'Existing load balancer'],
    redis: ['Native Sentinel/Cluster discovery', 'Existing load balancer'],
    valkey: ['Native Sentinel/Cluster discovery', 'Existing load balancer'],
    clickhouse: [
      'Native multi-host client list',
      'LayerSentry managed ClickHouse endpoint',
      'Existing load balancer',
    ],
    cassandra: ['Native multi-host client list', 'Existing load balancer'],
    yugabytedb: [
      'LayerSentry managed YSQL/YCQL endpoint',
      'Native multi-host client list',
      'Existing load balancer',
    ],
    rabbitmq: [
      'LayerSentry managed RabbitMQ endpoint',
      'Native node list',
      'Existing load balancer',
    ],
    kafka: ['Native bootstrap broker list'],
    pulsar: ['Pulsar Proxy HA pair', 'Native broker service URL', 'Existing load balancer'],
    nginx: ['LayerSentry managed web endpoint', 'Existing load balancer'],
    'apache-httpd': ['LayerSentry managed web endpoint', 'Existing load balancer'],
    tomcat: ['LayerSentry managed web endpoint', 'Existing load balancer'],
    keycloak: ['LayerSentry managed web endpoint', 'Existing load balancer'],
    superset: ['LayerSentry managed web endpoint', 'Existing load balancer'],
    airflow: ['LayerSentry managed web endpoint', 'Existing load balancer'],
    openbao: ['LayerSentry managed OpenBao endpoint', 'Existing load balancer'],
    jenkins: ['LayerSentry managed web endpoint', 'Existing load balancer'],
    forgejo: ['LayerSentry managed web endpoint', 'Existing load balancer'],
    opensearch: ['LayerSentry managed OpenSearch endpoint', 'Native node list', 'Existing load balancer'],
    prometheus: ['LayerSentry managed web endpoint', 'Existing load balancer'],
    grafana: ['LayerSentry managed web endpoint', 'Existing load balancer'],
    alloy: ['No customer service endpoint'],
  }

  return options[blueprint.id] || ['Existing load balancer']
}

const vol = (
  role,
  scope,
  sizeGiB,
  storagePool = 'Production Block Pool',
  layout = 'Single disk'
) => ({
  role,
  scope,
  sizeGiB,
  storagePool,
  layout,
  attachmentRef: '',
  mountpoint: '',
})

const dependency = (role, scope, required = true) => ({
  role,
  scope,
  sizeGiB: '',
  storagePool: 'External / linked dependency',
  layout: 'Dependency reference',
  attachmentRef: '',
  mountpoint: '',
  dependency: true,
  required,
})

const dataSize = (draft) => Math.max(20, Number(draft.expectedDataGiB) || 100)
const backupSize = (draft) => Math.max(50, Math.ceil(dataSize(draft) * 1.2))
const logSize = (draft) => Math.max(20, Math.ceil(dataSize(draft) * 0.2))

export const getStorageTemplate = (draft, blueprint) => {
  if (!blueprint) return []
  const d = dataSize(draft)
  const b = backupSize(draft)
  const l = logSize(draft)

  switch (blueprint.id) {
    case 'postgresql':
      return [
        vol('Data', 'Per PostgreSQL VM', d),
        vol('WAL', 'Per PostgreSQL VM', l),
        vol('Backup repository', 'Shared recovery repository', b, 'Backup Repository', 'Repository-managed'),
      ]
    case 'mysql-family':
    case 'mariadb':
      return [
        vol('Data', 'Per database VM', d),
        vol('Redo / binary log', 'Per database VM', l),
        vol('Backup repository', 'Shared recovery repository', b, 'Backup Repository', 'Repository-managed'),
      ]
    case 'mongodb-community':
    case 'percona-mongodb':
      return [
        vol('Data', 'Per data-bearing MongoDB VM', d),
        vol('Journal', 'Per data-bearing MongoDB VM', l),
        vol('Backup repository', 'Shared recovery repository', b, 'Backup Repository', 'Repository-managed'),
      ]
    case 'ferretdb':
      return [
        vol('PostgreSQL/DocumentDB data', 'Per backend database VM', d),
        vol('PostgreSQL WAL', 'Per backend database VM', l),
        vol('Backup repository', 'Backend recovery repository', b, 'Backup Repository', 'Repository-managed'),
      ]
    case 'redis':
    case 'valkey':
      return [
        vol('Persistence data (RDB/AOF)', 'Per data node', d),
        vol('Backup repository', 'Shared recovery repository', b, 'Backup Repository', 'Repository-managed'),
      ]
    case 'clickhouse':
      return [
        vol('ClickHouse data', 'Per data node', d),
        vol('Backup repository', 'Shared recovery repository', b, 'Backup Repository', 'Repository-managed'),
      ]
    case 'cassandra':
      return [
        vol('Data', 'Per Cassandra node', d),
        vol('Commit log', 'Per Cassandra node', l),
        vol('Backup repository', 'Shared recovery repository', b, 'Backup Repository', 'Repository-managed'),
      ]
    case 'yugabytedb':
      return [
        vol('Tablet data', 'Per YB-TServer VM', d),
        vol('WAL', 'Per YB-TServer VM', l),
        vol('YB-Master metadata', 'Per dedicated YB-Master VM', 20),
        vol('Backup repository', 'Shared recovery repository', b, 'Backup Repository', 'Repository-managed'),
      ]
    case 'rabbitmq':
      return [vol('Persistent message data', 'Per RabbitMQ VM', d)]
    case 'kafka':
      return [vol('Broker log / data', 'Per Kafka broker VM', d)]
    case 'pulsar':
      return [
        vol('BookKeeper journal', 'Per bookie VM', l),
        vol('BookKeeper ledgers', 'Per bookie VM', d),
        ...(draft.pulsarConfigStore === 'Dedicated 3-node configuration store'
          ? [vol('Configuration metadata state', 'Per configuration-store VM', 20)]
          : []),
      ]
    case 'nginx':
    case 'apache-httpd':
    case 'tomcat':
      return []
    case 'keycloak':
      return [dependency('HA relational database', 'Required external PostgreSQL/MySQL dependency')]
    case 'superset':
      return [
        dependency('Metadata database', 'External PostgreSQL/MySQL dependency'),
        ...(draft.topology === 'Distributed'
          ? [dependency('Async broker/results backend', 'External Redis/RabbitMQ/results dependency')]
          : []),
      ]
    case 'airflow':
      return [
        dependency('Metadata database', 'Required external PostgreSQL/MySQL dependency'),
        ...(draft.topology === 'Distributed Celery'
          ? [
              dependency('Queue broker', 'External Redis/RabbitMQ dependency'),
              dependency('Task log / artifact storage', 'Shared durable backend for distributed recovery'),
            ]
          : []),
      ]
    case 'openbao':
      return [
        vol('Raft integrated-storage data', 'Per OpenBao server', Math.max(20, Math.min(d, 200))),
        vol('Raft snapshot repository', 'Shared recovery repository', Math.max(50, b), 'Backup Repository', 'Repository-managed'),
      ]
    case 'jenkins':
      return [
        vol('JENKINS_HOME', 'Controller persistent state', d),
        vol('Backup repository', 'Shared recovery repository', b, 'Backup Repository', 'Repository-managed'),
      ]
    case 'forgejo':
      return [
        vol('Repositories / attachments / LFS', 'Shared service storage', d, 'Shared Capacity Pool', 'Shared filesystem/object storage'),
        dependency('Relational database', 'External PostgreSQL/MySQL dependency'),
        vol('Backup repository', 'Shared recovery repository', b, 'Backup Repository', 'Repository-managed'),
      ]
    case 'opensearch':
      return [
        vol('Index data', 'Per OpenSearch data VM', d),
        vol('Snapshot repository', 'Shared recovery repository', b, 'Backup Repository', 'Repository-managed'),
      ]
    case 'prometheus':
      return [
        vol('Local TSDB', 'Per Prometheus VM', d),
        ...(draft.promAlerting === 'Provision 3-node Alertmanager'
          ? [vol('Alertmanager local state', 'Per Alertmanager VM', 10)]
          : []),
        dependency('Optional long-term storage', 'Remote-write / Thanos-compatible backend when selected', false),
      ]
    case 'grafana':
      return [
        dependency('External SQL database', 'Required for production HA; SQLite is not used for HA'),
      ]
    case 'alloy':
      return [
        dependency('Telemetry destination', 'Remote-write / OTLP / Loki destination owns durable telemetry'),
      ]
    default:
      return [vol('Data', 'Per service VM', d)]
  }
}

const component = (name, placement, instances, addsVms, note) => ({
  name,
  placement,
  instances,
  addsVms,
  note,
})

const plan = (
  dedicated,
  components,
  shared = [],
  mainNodes = dedicated,
  mainLabel = 'Service nodes',
  minimum = false
) => ({
  dedicated,
  components,
  shared,
  mainNodes,
  mainLabel,
  minimum,
  addressableNodes: typeof dedicated === 'number' ? dedicated : null,
})

const addEndpoint = (draft, currentPlan) => {
  const map = {
    'Dedicated Patroni-aware endpoint pair': ['Patroni-aware endpoint', 2],
    'MySQL Router HA pair': ['MySQL Router', 2],
    'MariaDB MaxScale HA pair': ['MariaDB MaxScale', 2],
    'Pulsar Proxy HA pair': ['Pulsar Proxy', 2],
  }

  if (map[draft.endpointMode]) {
    const [name, count] = map[draft.endpointMode]
    currentPlan.components.push(
      component(
        name,
        'Dedicated endpoint VMs',
        count,
        count,
        'This endpoint selection consumes dedicated VMs and is included in the footprint.'
      )
    )
    currentPlan.dedicated += count
    currentPlan.addressableNodes = currentPlan.dedicated
  } else if (
    draft.endpointMode &&
    draft.endpointMode.indexOf('LayerSentry managed') === 0
  ) {
    currentPlan.shared.push(
      'LayerSentry managed endpoint (implementation-resolved and not counted as an application VM)'
    )
  }

  return currentPlan
}

export const getArchitecturePlan = (draft, blueprint) => {
  if (!blueprint) return plan(0, [])
  const id = blueprint.id
  const topology = draft.topology || ''

  if (id === 'postgresql') {
    const dbNodes =
      topology === 'Standalone'
        ? 1
        : topology === '5-node HA'
        ? 5
        : topology === 'HA + DR'
        ? 6
        : 3
    const dcs =
      topology !== 'Standalone' && draft.dcsPlacement === 'Dedicated 3-node etcd'
        ? 3
        : 0
    const proxy = draft.pgbouncerPlacement === 'Dedicated HA pair' ? 2 : 0
    const barman =
      draft.backupEnabled && draft.barmanPlacement === 'Dedicated Barman VM'
        ? 1
        : 0
    const shared = []
    if (
      topology !== 'Standalone' &&
      draft.dcsPlacement === 'Shared LayerSentry etcd DCS'
    ) {
      shared.push('shared qualified etcd DCS')
    }
    if (
      draft.backupEnabled &&
      draft.barmanPlacement === 'Shared Barman service'
    ) {
      shared.push('shared Barman backup service')
    }
    const components = [
      component(
        'PostgreSQL',
        topology === 'HA + DR'
          ? '3 primary-site + 3 DR database VMs'
          : 'Dedicated database VMs',
        dbNodes,
        dbNodes,
        'Each HA/DR database VM stores its own database replica.'
      ),
      component(
        'Patroni',
        'Runs on each PostgreSQL VM',
        dbNodes,
        0,
        'Patroni is software on the database VMs, not a separate VM.'
      ),
    ]
    if (topology !== 'Standalone') {
      components.push(
        component(
          'etcd DCS',
          draft.dcsPlacement,
          draft.dcsPlacement === 'Dedicated 3-node etcd' ? 3 : '3/5 shared',
          dcs,
          'Consensus/DCS is separate from PostgreSQL replication.'
        )
      )
    }
    if (draft.pgbouncerPlacement !== 'Disabled') {
      components.push(
        component(
          'PgBouncer',
          draft.pgbouncerPlacement,
          draft.pgbouncerPlacement === 'Dedicated HA pair' ? 2 : dbNodes,
          proxy,
          'Connection pooling is independent of the database replica count.'
        )
      )
    }
    if (draft.backupEnabled && draft.barmanPlacement !== 'Disabled') {
      components.push(
        component(
          'Barman',
          draft.barmanPlacement,
          draft.barmanPlacement === 'Dedicated Barman VM' ? 1 : 'shared',
          barman,
          'Remote application-aware backup/WAL/PITR service.'
        )
      )
    }
    return addEndpoint(
      draft,
      plan(
        dbNodes + dcs + proxy + barman,
        components,
        shared,
        topology === 'HA + DR' ? 3 : dbNodes,
        'PostgreSQL',
        topology === 'HA + DR'
      )
    )
  }

  if (id === 'mysql-family') {
    let nodes = 1
    let minimum = false
    let name = 'MySQL Server'
    let note = 'Exact replication mode is edition-qualified.'
    if (draft.edition === 'Percona XtraDB Cluster') {
      nodes = topology.indexOf('5-node') === 0 ? 5 : 3
      if (topology.indexOf('DR') >= 0) {
        nodes = 6
        minimum = true
      }
      name = 'Percona XtraDB Cluster'
      note = 'Galera quorum remains local; DR is asynchronous and separate.'
    } else if (draft.edition === 'Percona Server for MySQL') {
      nodes =
        topology === 'Standalone'
          ? 1
          : topology.indexOf('5-node') === 0
          ? 5
          : topology.indexOf('DR') >= 0
          ? 6
          : 3
      minimum = topology.indexOf('DR') >= 0
      name = 'Percona Server for MySQL'
      note = 'Group Replication is the production HA baseline for this profile.'
    } else {
      nodes =
        topology === 'Standalone'
          ? 1
          : topology.indexOf('5-node') === 0
          ? 5
          : topology.indexOf('DR') >= 0
          ? 6
          : 3
      minimum = topology.indexOf('DR') >= 0
      name = 'MySQL Community'
      note = 'InnoDB Cluster uses Group Replication; ClusterSet DR is separate.'
    }
    return addEndpoint(
      draft,
      plan(
        nodes,
        [component(name, 'Database VMs', nodes, nodes, note)],
        [],
        minimum ? 3 : nodes,
        name,
        minimum
      )
    )
  }

  if (id === 'mariadb') {
    const dr = topology.indexOf('DR') >= 0
    const nodes = dr ? 6 : topology.indexOf('5-node') === 0 ? 5 : topology === 'Standalone' ? 1 : 3
    return addEndpoint(
      draft,
      plan(
        nodes,
        [
          component(
            'MariaDB',
            dr ? 'Primary Galera + asynchronous DR cluster' : 'Galera database VMs',
            nodes,
            nodes,
            'Synchronous Galera quorum remains site-local.'
          ),
        ],
        [],
        dr ? 3 : nodes,
        'MariaDB',
        dr
      )
    )
  }

  if (id === 'mongodb-community' || id === 'percona-mongodb') {
    const product =
      id === 'percona-mongodb'
        ? 'Percona Server for MongoDB'
        : 'MongoDB Community'
    if (topology.indexOf('Sharded') === 0) {
      const shards = topology.indexOf('3 shards') >= 0 ? 3 : 2
      const shardNodes = shards * 3
      const total = shardNodes + 3 + 2
      return plan(
        total,
        [
          component(
            'Shard replica sets',
            String(shards) + ' shards × 3 data-bearing members',
            shardNodes,
            shardNodes,
            'Each shard is a three-member replica set.'
          ),
          component(
            'Config server replica set',
            'Dedicated config-server VMs',
            3,
            3,
            'Config metadata remains a separate replica set.'
          ),
          component(
            'mongos routers',
            'Dedicated query-router VMs',
            2,
            2,
            'Stateless client routing tier.'
          ),
        ],
        [],
        shardNodes,
        product
      )
    }
    const nodes = topology.indexOf('5-node') === 0 ? 5 : 3
    return plan(
      nodes,
      [
        component(
          product,
          'Replica-set data-bearing members',
          nodes,
          nodes,
          'Odd voting membership with independent replicas.'
        ),
      ],
      [],
      nodes,
      product
    )
  }

  if (id === 'ferretdb') {
    const ha = topology.indexOf('2 FerretDB') === 0
    const frontend = ha ? 2 : 1
    const backend = ha ? 3 : 1
    return addEndpoint(
      draft,
      plan(
        frontend + backend,
        [
          component(
            'FerretDB',
            'Stateless MongoDB-wire frontend VMs',
            frontend,
            frontend,
            'Frontends are replaceable.'
          ),
          component(
            'PostgreSQL + DocumentDB',
            'Linked authoritative backend VMs',
            backend,
            backend,
            'Backup/PITR/DR primarily protect this backend.'
          ),
        ],
        [],
        frontend,
        'FerretDB'
      )
    )
  }

  if (id === 'redis' || id === 'valkey') {
    const name = id === 'redis' ? 'Redis' : 'Valkey'
    if (topology.indexOf('Cluster') >= 0) {
      return plan(
        6,
        [
          component(
            name,
            '3 primaries + 3 replicas',
            6,
            6,
            'Cluster-aware clients discover native slot ownership.'
          ),
        ],
        [],
        6,
        name
      )
    }
    if (topology.indexOf('Sentinel') >= 0) {
      return plan(
        3,
        [
          component(
            name,
            '1 primary + 2 replicas',
            3,
            3,
            'Data nodes use asynchronous replication.'
          ),
          component(
            'Sentinel',
            'One co-located Sentinel per independent VM',
            3,
            0,
            'Three independent Sentinel processes decide failover.'
          ),
        ],
        [],
        3,
        name
      )
    }
    return plan(
      1,
      [component(name, 'Standalone service VM', 1, 1, 'No HA.')],
      [],
      1,
      name
    )
  }

  if (id === 'clickhouse') {
    if (topology === 'Standalone') {
      return plan(
        1,
        [component('ClickHouse', 'Standalone data VM', 1, 1, 'No replication quorum.')],
        [],
        1,
        'ClickHouse'
      )
    }
    const dataNodes = topology.indexOf('2 shards') === 0 ? 4 : 3
    return plan(
      dataNodes + 3,
      [
        component(
          'ClickHouse data nodes',
          topology.indexOf('2 shards') === 0
            ? '2 shards × 2 replicas'
            : '3 replicated data VMs',
          dataNodes,
          dataNodes,
          'Data replicas are separate from coordination.'
        ),
        component(
          'ClickHouse Keeper',
          'Dedicated Raft quorum VMs',
          3,
          3,
          'Three Keeper voters isolate coordination from data load.'
        ),
      ],
      [],
      dataNodes,
      'ClickHouse data'
    )
  }

  if (id === 'cassandra') {
    const nodes =
      topology.indexOf('Multi-DC') === 0
        ? 6
        : topology.indexOf('5-node') === 0
        ? 5
        : 3
    return plan(
      nodes,
      [
        component(
          'Cassandra',
          topology.indexOf('Multi-DC') === 0
            ? '3 nodes per DC minimum'
            : String(nodes) + '-node ring',
          nodes,
          nodes,
          'NetworkTopologyStrategy and rack/DC placement are topology inputs.'
        ),
      ],
      [],
      nodes,
      'Cassandra',
      topology.indexOf('Multi-DC') === 0
    )
  }

  if (id === 'yugabytedb') {
    const xcluster = topology.indexOf('xCluster DR') === 0
    const tservers = xcluster
      ? 6
      : topology.indexOf('5 TServers') === 0
      ? 5
      : 3
    const masters = xcluster ? 6 : 3
    return addEndpoint(
      draft,
      plan(
        tservers + masters,
        [
          component(
            'YB-TServer',
            xcluster ? '3 TServers per universe' : 'Dedicated data-serving VMs',
            tservers,
            tservers,
            'Tablet replicas follow the RF/failure-domain policy.'
          ),
          component(
            'YB-Master',
            xcluster
              ? '3 dedicated persistent masters per universe'
              : 'Dedicated persistent master VMs',
            masters,
            masters,
            'Production master quorum is counted separately from TServers.'
          ),
        ],
        [],
        xcluster ? 3 : tservers,
        'YB-TServer',
        xcluster
      )
    )
  }

  if (id === 'rabbitmq') {
    const dr = topology.indexOf('Federation DR') === 0
    const nodes = dr ? 6 : topology.indexOf('5-node') === 0 ? 5 : 3
    return addEndpoint(
      draft,
      plan(
        nodes,
        [
          component(
            'RabbitMQ',
            dr ? 'Two 3-node clusters for federation DR' : String(nodes) + '-node cluster',
            nodes,
            nodes,
            'Quorum queues require majority availability.'
          ),
        ],
        [],
        dr ? 3 : nodes,
        'RabbitMQ',
        dr
      )
    )
  }

  if (id === 'kafka') {
    const brokers = topology.indexOf('5 brokers') === 0 ? 5 : 3
    const controllers = topology.indexOf('5 controllers') >= 0 ? 5 : 3
    return plan(
      brokers + controllers,
      [
        component(
          'Kafka brokers',
          'Dedicated broker VMs',
          brokers,
          brokers,
          'Critical production keeps broker and controller roles separate.'
        ),
        component(
          'KRaft controllers',
          'Dedicated metadata quorum VMs',
          controllers,
          controllers,
          'Use an odd 3/5 controller quorum.'
        ),
      ],
      [],
      brokers,
      'Kafka brokers'
    )
  }

  if (id === 'pulsar') {
    const sites = topology.indexOf('Multi-cluster DR') === 0 ? 2 : 1
    const brokers = 3 * sites
    const metadata = 3 * sites
    const configStore =
      sites === 2 &&
      draft.pulsarConfigStore === 'Dedicated 3-node configuration store'
        ? 3
        : 0
    const shared = []
    const components = [
      component(
        'Pulsar broker + BookKeeper bookie',
        'Co-located broker/bookie VMs',
        brokers,
        brokers,
        'Three broker+bookie VMs per site in the baseline profile.'
      ),
      component(
        draft.pulsarMetadata.indexOf('Oxia') === 0 ? 'Oxia local metadata' : 'ZooKeeper local metadata',
        'Dedicated local metadata quorum VMs',
        metadata,
        metadata,
        'Each site owns an independent three-node local metadata quorum.'
      ),
    ]
    if (sites === 2) {
      if (configStore) {
        components.push(
          component(
            'Configuration metadata store',
            'Dedicated instance-wide metadata VMs',
            3,
            3,
            'Multi-cluster instance configuration is counted separately.'
          )
        )
      } else {
        components.push(
          component(
            'Configuration metadata store',
            'Qualified shared/managed dependency',
            'shared',
            0,
            'Required across clusters; no hidden VM count is guessed.'
          )
        )
        shared.push('qualified instance-wide configuration metadata store')
      }
    }
    const current = plan(
      brokers + metadata + configStore,
      components,
      shared,
      brokers,
      'Pulsar broker/bookie',
      sites === 2
    )
    addEndpoint(draft, current)
    if (
      sites === 2 &&
      draft.endpointMode === 'Pulsar Proxy HA pair'
    ) {
      current.components.push(
        component(
          'Pulsar Proxy secondary-site tier',
          'Dedicated endpoint VMs at DR site',
          2,
          2,
          'Warm DR access needs a site-local proxy pair.'
        )
      )
      current.dedicated += 2
      current.addressableNodes = current.dedicated
    }
    return current
  }

  if (id === 'nginx' || id === 'apache-httpd') {
    const nodes = topology === 'Standalone' ? 1 : 2
    const name = id === 'nginx' ? 'NGINX OSS' : 'Apache HTTP Server'
    return addEndpoint(
      draft,
      plan(
        nodes,
        [
          component(
            name,
            nodes === 1 ? 'Standalone web/proxy VM' : 'HA web/proxy VMs',
            nodes,
            nodes,
            'Configuration/content is reproducible desired state.'
          ),
        ],
        [],
        nodes,
        name
      )
    )
  }

  if (id === 'tomcat') {
    const nodes =
      topology === 'Standalone'
        ? 1
        : topology.indexOf('3-node') === 0
        ? 3
        : 2
    return addEndpoint(
      draft,
      plan(
        nodes,
        [
          component(
            'Apache Tomcat',
            'Application-server VMs',
            nodes,
            nodes,
            'Application artifacts are immutable inputs; business state stays external.'
          ),
        ],
        [],
        nodes,
        'Tomcat'
      )
    )
  }

  if (id === 'keycloak') {
    const nodes = topology === 'Standalone' ? 1 : 3
    return addEndpoint(
      draft,
      plan(
        nodes,
        [
          component(
            'Keycloak',
            'Replaceable application VMs',
            nodes,
            nodes,
            'HA nodes require a resilient external SQL database.'
          ),
          component(
            'Relational database',
            'Required external HA dependency',
            'external',
            0,
            'Database availability determines service availability.'
          ),
        ],
        ['external HA relational database'],
        nodes,
        'Keycloak'
      )
    )
  }

  if (id === 'superset') {
    if (topology === 'Standalone') {
      return addEndpoint(
        draft,
        plan(
          1,
          [
            component(
              'Superset web',
              'Gunicorn application VM',
              1,
              1,
              'Metadata database remains external.'
            ),
            component(
              'Metadata database',
              'External PostgreSQL/MySQL',
              'external',
              0,
              'SQLite is not a production metadata store.'
            ),
          ],
          ['external metadata database'],
          1,
          'Superset web'
        )
      )
    }
    return addEndpoint(
      draft,
      plan(
        4,
        [
          component('Superset web', 'Load-balanced web VMs', 2, 2, 'All web nodes share one metadata DB.'),
          component('Celery workers', 'Async query/background worker VMs', 2, 2, 'Workers share the same configuration.'),
          component('Celery beat', 'One active scheduler process', 'co-located', 0, 'Run exactly one active beat scheduler.'),
          component('Metadata database', 'External PostgreSQL/MySQL', 'external', 0, 'Required shared state.'),
          component('Broker/results backend', 'External Redis/RabbitMQ/results backend', 'external', 0, 'Required for distributed execution.'),
        ],
        ['external metadata database', 'external broker/results backend'],
        2,
        'Superset web'
      )
    )
  }

  if (id === 'airflow') {
    if (topology === 'Standalone') {
      return addEndpoint(
        draft,
        plan(
          1,
          [
            component(
              'Airflow',
              'API server + scheduler + DAG processor + local worker on one VM',
              1,
              1,
              'Use only where a single VM is acceptable.'
            ),
            component('Metadata database', 'External SQL database', 'external', 0, 'Required authoritative metadata state.'),
          ],
          ['external metadata database', 'versioned DAG source'],
          1,
          'Airflow'
        )
      )
    }
    return addEndpoint(
      draft,
      plan(
        4,
        [
          component('Airflow control tier', '2 control VMs', 2, 2, 'API/scheduler/DAG-processor/triggerer placement is qualified.'),
          component('Airflow workers', 'Dedicated worker VMs', 2, 2, 'Task execution is isolated from the control tier.'),
          component('Metadata database', 'External HA SQL database', 'external', 0, 'Shared authoritative state.'),
          component('Queue broker', 'External Redis/RabbitMQ', 'external', 0, 'Required for Celery execution.'),
          component('Task log/artifact backend', 'External durable backend', 'external', 0, 'Recovery keeps logs/artifacts consistent with metadata and DAG version.'),
        ],
        ['external metadata database', 'external queue broker', 'versioned DAG source', 'task log/artifact backend'],
        2,
        'Airflow control'
      )
    )
  }

  if (id === 'openbao') {
    const nodes =
      topology === 'Standalone'
        ? 1
        : topology.indexOf('3-node') === 0
        ? 3
        : 5
    return addEndpoint(
      draft,
      plan(
        nodes,
        [
          component(
            'OpenBao',
            'Integrated-storage Raft server VMs',
            nodes,
            nodes,
            nodes === 5
              ? 'Five-server profile preserves two-failure tolerance.'
              : 'Quorum-loss characteristics are shown before deployment.'
          ),
        ],
        [],
        nodes,
        'OpenBao'
      )
    )
  }

  if (id === 'jenkins') {
    const agents = topology.indexOf('4 agents') >= 0 ? 4 : 2
    return addEndpoint(
      draft,
      plan(
        1 + agents,
        [
          component(
            'Jenkins controller',
            'Single authoritative controller VM',
            1,
            1,
            'This OSS profile does not claim active-active controller HA.'
          ),
          component(
            'Jenkins agents',
            'Replaceable build-agent VMs',
            agents,
            agents,
            'Build execution stays off the controller.'
          ),
        ],
        [],
        1,
        'Jenkins controller'
      )
    )
  }

  if (id === 'forgejo') {
    const nodes = topology === 'Standalone' ? 1 : 2
    return addEndpoint(
      draft,
      plan(
        nodes,
        [
          component('Forgejo', 'Application VMs', nodes, nodes, 'HA nodes share DB and repository/object state.'),
          component('Relational database', 'External HA dependency', 'external', 0, 'Database is protected separately.'),
          component('Repository/object storage', 'Shared durable dependency', 'external', 0, 'Repositories, LFS and attachments must remain consistent with DB state.'),
        ],
        ['external relational database', 'shared repository/object storage'],
        nodes,
        'Forgejo'
      )
    )
  }

  if (id === 'opensearch') {
    const dataNodes = topology.indexOf('6 data') >= 0 ? 6 : 3
    return addEndpoint(
      draft,
      plan(
        3 + dataNodes,
        [
          component('Cluster-manager nodes', 'Dedicated cluster-manager VMs', 3, 3, 'Three managers preserve quorum and isolate cluster-state work.'),
          component('Data nodes', 'Dedicated data/ingest/search VMs', dataNodes, dataNodes, 'Data capacity scales independently from managers.'),
        ],
        [],
        dataNodes,
        'OpenSearch data'
      )
    )
  }

  if (id === 'prometheus') {
    const prometheusNodes = topology === 'Standalone' ? 1 : 2
    const alertmanager =
      draft.promAlerting === 'Provision 3-node Alertmanager' ? 3 : 0
    const components = [
      component(
        'Prometheus',
        'Independent server VMs',
        prometheusNodes,
        prometheusNodes,
        prometheusNodes === 2
          ? 'HA is active/active collection; duplicate series are handled downstream when applicable.'
          : 'No Prometheus HA.'
      ),
    ]
    if (alertmanager) {
      components.push(
        component(
          'Alertmanager',
          'Dedicated three-node HA alerting cluster',
          3,
          3,
          'Alert routing and silences are a separate HA component.'
        )
      )
    } else if (draft.promAlerting === 'Existing Alertmanager cluster') {
      components.push(
        component(
          'Alertmanager',
          'Existing external cluster',
          'external',
          0,
          'Existing alerting dependency is explicit and not counted as new VMs.'
        )
      )
    }
    return addEndpoint(
      draft,
      plan(
        prometheusNodes + alertmanager,
        components,
        draft.promAlerting === 'Existing Alertmanager cluster'
          ? ['existing Alertmanager cluster']
          : [],
        prometheusNodes,
        'Prometheus'
      )
    )
  }

  if (id === 'grafana') {
    const nodes = topology === 'Standalone' ? 1 : 2
    return addEndpoint(
      draft,
      plan(
        nodes,
        [
          component('Grafana', 'Application VMs', nodes, nodes, 'HA instances share one external SQL database.'),
          component('SQL database', 'External PostgreSQL/MySQL', 'external', 0, 'SQLite is not used for HA.'),
          component('Session continuity', draft.grafanaSession, 'external/policy', 0, 'Session continuity is independent of alerting HA.'),
          component('Unified Alerting HA', draft.grafanaAlertHa, 'policy/dependency', 0, 'Alerting HA state is explicitly selected.'),
        ],
        ['external SQL database'],
        nodes,
        'Grafana'
      )
    )
  }

  if (id === 'alloy') {
    const nodes = topology.indexOf('3-node') === 0 ? 3 : 1
    return plan(
      nodes,
      [
        component(
          'Grafana Alloy',
          nodes > 1 ? 'Clustered collector peers' : 'Dedicated collector VM',
          nodes,
          nodes,
          nodes > 1
            ? 'Only components that explicitly support clustering are distributed.'
            : 'No clustering overhead.'
        ),
      ],
      ['versioned collector configuration', 'telemetry destination'],
      nodes,
      'Alloy'
    )
  }

  return plan(
    1,
    [component(blueprint.name, 'Qualified service VM', 1, 1, 'Exact component split is backend-qualified.')],
    [],
    1,
    blueprint.name
  )
}

export const getProductConfigFields = (draft, blueprint) => {
  if (!blueprint) return []
  const select = (key, label, options, extra = {}) => ({
    key,
    label,
    type: 'select',
    options,
    ...extra,
  })
  const text = (key, label, extra = {}) => ({
    key,
    label,
    type: 'text',
    ...extra,
  })
  const number = (key, label, extra = {}) => ({
    key,
    label,
    type: 'number',
    ...extra,
  })
  const fields = []
  const id = blueprint.id

  if (id === 'postgresql') {
    fields.push(
      select('databaseBootstrap', 'Initial database', [
        'Create initial database(s) during deployment',
        'Create databases later',
      ])
    )
    if (draft.databaseBootstrap === 'Create initial database(s) during deployment') {
      fields.push(
        text('initialDatabases', 'Initial database name(s)', {
          helper: 'Comma-separated names. Databases are created before extensions are enabled.',
        })
      )
    }
    fields.push(
      select('dcsPlacement', 'Patroni DCS', [
        'Shared LayerSentry etcd DCS',
        'Dedicated 3-node etcd',
      ]),
      select('pgbouncerPlacement', 'PgBouncer', [
        'On PostgreSQL nodes',
        'Dedicated HA pair',
        'Disabled',
      ]),
      select('barmanPlacement', 'Barman', [
        'Shared Barman service',
        'Dedicated Barman VM',
        'Disabled',
      ]),
      {
        key: 'pgStatStatements',
        label: 'pg_stat_statements',
        type: 'switch',
        helper: 'Recommended query statistics extension.',
      },
      {
        key: 'postgis',
        label: 'PostGIS',
        type: 'switch',
        helper: 'Enable geospatial types/functions only for selected database(s).',
      }
    )
    if (draft.postgis) {
      fields.push(
        select('postgisTarget', 'PostGIS target', [
          'Initial database(s)',
          'Existing/restored database(s)',
        ])
      )
      if (draft.postgisTarget === 'Existing/restored database(s)') {
        fields.push(text('postgisDatabases', 'Existing/restored database name(s)'))
      }
    }
    return fields
  }

  if (id === 'mysql-family' || id === 'mariadb') {
    fields.push(
      select('sqlBootstrap', 'Application database', [
        'Create initial application database',
        'Create database later',
      ])
    )
    if (draft.sqlBootstrap === 'Create initial application database') {
      fields.push(text('sqlDbName', 'Initial application database name'))
    }
    return fields
  }

  if (id === 'mongodb-community' || id === 'percona-mongodb') {
    fields.push(
      select('mongoScopeMode', 'Application credential scope', [
        'Create application credential scope',
        'Create credentials later',
      ])
    )
    if (draft.mongoScopeMode === 'Create application credential scope') {
      fields.push(text('mongoDbName', 'Application database / credential scope'))
    }
    return fields
  }

  if (id === 'ferretdb') {
    return [
      text('ferretDbName', 'Logical application database', {
        helper: 'Used to bootstrap the linked PostgreSQL/DocumentDB backend.',
      }),
    ]
  }

  if (id === 'redis' || id === 'valkey') {
    return [
      select('kvPersistence', 'Persistence policy', [
        'AOF + RDB (recommended)',
        'RDB only',
        'Cache-only (no durability)',
      ]),
    ]
  }

  if (id === 'clickhouse') {
    fields.push(
      select('clickBootstrap', 'Application database', [
        'Create initial database',
        'Create database later',
      ])
    )
    if (draft.clickBootstrap === 'Create initial database') {
      fields.push(text('clickDbName', 'Initial ClickHouse database'))
    }
    return fields
  }

  if (id === 'cassandra') {
    fields.push(
      select('cassBootstrap', 'Application keyspace', [
        'Create initial keyspace',
        'Create keyspace later',
      ])
    )
    if (draft.cassBootstrap === 'Create initial keyspace') {
      fields.push(text('cassKeyspace', 'Initial keyspace'))
    }
    return fields
  }

  if (id === 'yugabytedb') {
    fields.push(
      select('ybApi', 'Client API', ['YSQL', 'YCQL', 'Both YSQL + YCQL']),
      select('ybBootstrap', 'Application database / namespace', [
        'Create initial database / namespace',
        'Create later',
      ])
    )
    if (draft.ybBootstrap === 'Create initial database / namespace') {
      fields.push(text('ybDbName', 'Initial database / namespace'))
    }
    return fields
  }

  if (id === 'rabbitmq') {
    fields.push(
      select('rabbitVhostMode', 'Application virtual host', [
        'Create application virtual host',
        'Create virtual host later',
      ])
    )
    if (draft.rabbitVhostMode === 'Create application virtual host') {
      fields.push(text('rabbitVhost', 'RabbitMQ virtual host'))
    }
    return fields
  }

  if (id === 'kafka') {
    fields.push(
      select('kafkaTopicMode', 'Topic bootstrap', [
        'Application creates topics explicitly (recommended)',
        'Create bootstrap topic',
      ]),
      select('kafkaDurability', 'Durability baseline', [
        'RF=3 / min ISR=2 baseline',
        'Custom policy resolved by backend',
      ])
    )
    if (draft.kafkaTopicMode === 'Create bootstrap topic') {
      fields.push(text('kafkaTopic', 'Bootstrap topic'))
    }
    return fields
  }

  if (id === 'pulsar') {
    fields.push(
      select('pulsarMetadata', 'Local metadata store', [
        'Oxia (recommended for new clusters)',
        'ZooKeeper compatibility profile',
      ]),
      select('pulsarNamespaceMode', 'Tenant / namespace bootstrap', [
        'Create tenant + namespace',
        'Create later',
      ])
    )
    if (draft.pulsarNamespaceMode === 'Create tenant + namespace') {
      fields.push(
        text('pulsarTenant', 'Tenant'),
        text('pulsarNamespace', 'Namespace')
      )
    }
    if (draft.topology.indexOf('Multi-cluster DR') === 0) {
      fields.push(
        select('pulsarConfigStore', 'Instance-wide configuration metadata', [
          'Qualified shared/config metadata store',
          'Dedicated 3-node configuration store',
        ])
      )
    }
    return fields
  }

  if (id === 'nginx' || id === 'apache-httpd') {
    fields.push(
      select('webMode', 'Service role', [
        'Reverse proxy',
        'Static/content service',
        'Runtime only / configure later',
      ])
    )
    if (draft.webMode === 'Reverse proxy') {
      fields.push(text('webSourceRef', 'Upstream / backend service reference'))
    }
    if (draft.webMode === 'Static/content service') {
      fields.push(text('webSourceRef', 'Versioned content / artifact source'))
    }
    return fields
  }

  if (id === 'tomcat') {
    fields.push(
      select('tomcatDeploy', 'Application deployment', [
        'Runtime only',
        'Deploy application artifact',
      ])
    )
    if (draft.tomcatDeploy === 'Deploy application artifact') {
      fields.push(text('tomcatArtifactRef', 'Immutable application artifact / bundle reference'))
    }
    return fields
  }

  if (id === 'keycloak') {
    fields.push(
      select('keycloakAdminMode', 'Administration exposure', [
        'Private/admin network only',
        'Separate admin FQDN',
      ])
    )
    if (draft.keycloakAdminMode === 'Separate admin FQDN') {
      fields.push(text('keycloakAdminFqdn', 'Admin FQDN'))
    }
    return fields
  }

  if (id === 'superset') {
    fields.push(
      select('supersetSecretMode', 'Application SECRET_KEY ownership', [
        'LayerSentry managed SECRET_KEY',
        'Existing SECRET_KEY secret reference',
      ])
    )
    if (draft.supersetSecretMode === 'Existing SECRET_KEY secret reference') {
      fields.push(text('supersetSecretRef', 'SECRET_KEY secret reference'))
    }
    return fields
  }

  if (id === 'airflow') {
    fields.push(
      text('airflowDagRef', 'DAG source / bundle reference', {
        helper: 'Git/tag, bundle ID, object path or other immutable reference.',
      }),
      select('airflowSecretMode', 'Internal secrets', [
        'LayerSentry managed Fernet/signing secrets',
        'Existing Fernet/signing secret reference',
      ])
    )
    if (
      draft.airflowSecretMode === 'Existing Fernet/signing secret reference'
    ) {
      fields.push(text('airflowSecretRef', 'Internal secret reference'))
    }
    return fields
  }

  if (id === 'openbao') {
    fields.push(
      select('baoSealMode', 'Seal / unseal trust', [
        'Shamir operator unseal',
        'Existing KMS/HSM/transit reference',
      ])
    )
    if (draft.baoSealMode === 'Existing KMS/HSM/transit reference') {
      fields.push(text('baoSealRef', 'KMS / HSM / transit reference'))
    }
    return fields
  }

  if (id === 'jenkins') {
    fields.push(
      select('jenkinsAgentSource', 'Agent execution source', [
        'LayerSentry managed agent image/profile',
        'Existing agent template/image reference',
      ])
    )
    if (draft.jenkinsAgentSource === 'Existing agent template/image reference') {
      fields.push(text('jenkinsAgentRef', 'Agent template / image reference'))
    }
    return fields
  }

  if (id === 'forgejo') {
    fields.push(
      select('forgejoSsh', 'Git-over-SSH', ['Enabled', 'Disabled'])
    )
    if (draft.forgejoSsh === 'Enabled') {
      fields.push(number('forgejoSshPort', 'Git SSH port', { min: 1, max: 65535 }))
    }
    return fields
  }

  if (id === 'opensearch') {
    fields.push(
      select('openSearchSecurity', 'Security configuration', [
        'LayerSentry managed security configuration',
        'Existing security configuration secret reference',
      ])
    )
    if (
      draft.openSearchSecurity ===
      'Existing security configuration secret reference'
    ) {
      fields.push(text('openSearchSecurityRef', 'Security config / secret reference'))
    }
    return fields
  }

  if (id === 'prometheus') {
    fields.push(
      select('promScrapeMode', 'Scrape configuration', [
        'Configure scrape targets later',
        'Existing versioned scrape configuration',
      ])
    )
    if (draft.promScrapeMode === 'Existing versioned scrape configuration') {
      fields.push(text('promScrapeRef', 'Scrape config / target bundle reference'))
    }
    fields.push(
      select('promAlerting', 'Alerting integration', [
        'Provision 3-node Alertmanager',
        'Existing Alertmanager cluster',
        'Alerting disabled',
      ])
    )
    if (draft.promAlerting === 'Existing Alertmanager cluster') {
      fields.push(text('promAlertRef', 'Alertmanager service / endpoint reference'))
    }
    return fields
  }

  if (id === 'grafana') {
    fields.push(
      select('grafanaDatasourceMode', 'Datasource bootstrap', [
        'Configure datasources later',
        'Existing datasource configuration reference',
      ])
    )
    if (
      draft.grafanaDatasourceMode ===
      'Existing datasource configuration reference'
    ) {
      fields.push(text('grafanaDatasourceRef', 'Datasource config / secret reference'))
    }
    fields.push(
      select('grafanaSession', 'Session continuity', [
        'Sticky load-balancer sessions (recommended)',
        'Existing Redis session store',
      ])
    )
    if (draft.grafanaSession === 'Existing Redis session store') {
      fields.push(text('grafanaSessionRef', 'Redis session service reference'))
    }
    fields.push(
      select('grafanaAlertHa', 'Unified Alerting HA', [
        'Memberlist (recommended)',
        'Existing Redis for alerting HA',
      ])
    )
    if (draft.grafanaAlertHa === 'Existing Redis for alerting HA') {
      fields.push(text('grafanaAlertRef', 'Redis alerting-HA service reference'))
    }
    return fields
  }

  if (id === 'alloy') {
    fields.push(
      select('alloyConfig', 'Configuration ownership', [
        'LayerSentry managed versioned configuration',
        'Existing configuration bundle reference',
      ])
    )
    if (draft.alloyConfig === 'Existing configuration bundle reference') {
      fields.push(text('alloyConfigRef', 'Configuration bundle reference'))
    }
    return fields
  }

  return []
}

const fqdnPattern =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i
const dbNamePattern = /^[A-Za-z_][A-Za-z0-9_$.-]{0,62}$/
const simpleNamePattern = /^[a-z0-9][a-z0-9._-]{0,126}$/i
const topicPattern = /^[a-zA-Z0-9._-]{1,249}$/

const nonEmpty = (value) => Boolean(String(value || '').trim())
const isValidFqdn = (value) => fqdnPattern.test(String(value || '').trim())

export const getProductConfigErrors = (draft, blueprint) => {
  if (!blueprint) return ['Select a service.']
  const errors = []
  const id = blueprint.id

  if (
    (id === 'mysql-family' || id === 'mariadb') &&
    draft.sqlBootstrap === 'Create initial application database' &&
    !dbNamePattern.test(String(draft.sqlDbName || '').trim())
  ) {
    errors.push('Enter a valid initial application database name, or choose to create it later.')
  }

  if (
    (id === 'mongodb-community' || id === 'percona-mongodb') &&
    draft.mongoScopeMode === 'Create application credential scope' &&
    !simpleNamePattern.test(String(draft.mongoDbName || '').trim())
  ) {
    errors.push('Enter the MongoDB application database / credential scope name.')
  }

  if (
    id === 'ferretdb' &&
    !dbNamePattern.test(String(draft.ferretDbName || '').trim())
  ) {
    errors.push('FerretDB requires a logical application database name for backend bootstrap.')
  }

  if (
    (id === 'redis' || id === 'valkey') &&
    draft.kvPersistence === 'Cache-only (no durability)' &&
    draft.backupEnabled
  ) {
    errors.push('Cache-only persistence conflicts with application backup. Disable backup or choose a durable profile.')
  }

  if (
    id === 'clickhouse' &&
    draft.clickBootstrap === 'Create initial database' &&
    !dbNamePattern.test(String(draft.clickDbName || '').trim())
  ) {
    errors.push('Enter a valid ClickHouse initial database name.')
  }

  if (
    id === 'cassandra' &&
    draft.cassBootstrap === 'Create initial keyspace' &&
    !simpleNamePattern.test(String(draft.cassKeyspace || '').trim())
  ) {
    errors.push('Enter a valid Cassandra initial keyspace name.')
  }

  if (
    id === 'yugabytedb' &&
    draft.ybBootstrap === 'Create initial database / namespace' &&
    !dbNamePattern.test(String(draft.ybDbName || '').trim())
  ) {
    errors.push('Enter a valid YugabyteDB initial database / namespace name.')
  }

  if (
    id === 'rabbitmq' &&
    draft.rabbitVhostMode === 'Create application virtual host' &&
    !nonEmpty(draft.rabbitVhost)
  ) {
    errors.push('Enter the RabbitMQ application virtual-host name.')
  }

  if (
    id === 'kafka' &&
    draft.kafkaTopicMode === 'Create bootstrap topic' &&
    !topicPattern.test(String(draft.kafkaTopic || '').trim())
  ) {
    errors.push('Enter a valid Kafka bootstrap topic name.')
  }

  if (
    id === 'pulsar' &&
    draft.pulsarNamespaceMode === 'Create tenant + namespace' &&
    (!simpleNamePattern.test(String(draft.pulsarTenant || '').trim()) ||
      !simpleNamePattern.test(String(draft.pulsarNamespace || '').trim()))
  ) {
    errors.push('Pulsar tenant and namespace names are required when bootstrap is selected.')
  }

  if (
    (id === 'nginx' || id === 'apache-httpd') &&
    (draft.webMode === 'Reverse proxy' ||
      draft.webMode === 'Static/content service') &&
    !nonEmpty(draft.webSourceRef)
  ) {
    errors.push(
      draft.webMode === 'Reverse proxy'
        ? 'Enter the upstream/backend service reference for the reverse proxy.'
        : 'Enter the versioned content/artifact source reference.'
    )
  }

  if (
    id === 'tomcat' &&
    draft.tomcatDeploy === 'Deploy application artifact' &&
    !nonEmpty(draft.tomcatArtifactRef)
  ) {
    errors.push('Tomcat application deployment requires an immutable artifact/bundle reference.')
  }

  if (
    id === 'keycloak' &&
    draft.keycloakAdminMode === 'Separate admin FQDN' &&
    !isValidFqdn(draft.keycloakAdminFqdn)
  ) {
    errors.push('Keycloak separate administration exposure requires a valid admin FQDN.')
  }

  if (
    id === 'superset' &&
    draft.supersetSecretMode === 'Existing SECRET_KEY secret reference' &&
    !nonEmpty(draft.supersetSecretRef)
  ) {
    errors.push('Superset existing SECRET_KEY mode requires a secret reference, not the raw key.')
  }

  if (id === 'airflow') {
    if (!nonEmpty(draft.airflowDagRef)) {
      errors.push('Airflow requires a versioned DAG source / bundle reference.')
    }
    if (
      draft.airflowSecretMode ===
        'Existing Fernet/signing secret reference' &&
      !nonEmpty(draft.airflowSecretRef)
    ) {
      errors.push('Airflow existing internal-secret mode requires a secret reference, not raw secret material.')
    }
  }

  if (
    id === 'openbao' &&
    draft.baoSealMode === 'Existing KMS/HSM/transit reference' &&
    !nonEmpty(draft.baoSealRef)
  ) {
    errors.push('OpenBao external seal/unseal mode requires a KMS/HSM/transit reference.')
  }

  if (
    id === 'jenkins' &&
    draft.jenkinsAgentSource === 'Existing agent template/image reference' &&
    !nonEmpty(draft.jenkinsAgentRef)
  ) {
    errors.push('Jenkins existing agent source requires a template/image reference.')
  }

  if (
    id === 'forgejo' &&
    draft.forgejoSsh === 'Enabled' &&
    (!Number.isInteger(Number(draft.forgejoSshPort)) ||
      Number(draft.forgejoSshPort) < 1 ||
      Number(draft.forgejoSshPort) > 65535)
  ) {
    errors.push('Forgejo Git-over-SSH requires a valid TCP port between 1 and 65535.')
  }

  if (
    id === 'opensearch' &&
    draft.openSearchSecurity ===
      'Existing security configuration secret reference' &&
    !nonEmpty(draft.openSearchSecurityRef)
  ) {
    errors.push('OpenSearch existing security configuration requires a secret/config reference.')
  }

  if (id === 'prometheus') {
    if (
      draft.promAlerting === 'Existing Alertmanager cluster' &&
      !nonEmpty(draft.promAlertRef)
    ) {
      errors.push('Existing Alertmanager mode requires an Alertmanager service / endpoint reference.')
    }
    if (
      draft.promScrapeMode === 'Existing versioned scrape configuration' &&
      !nonEmpty(draft.promScrapeRef)
    ) {
      errors.push('Existing scrape-configuration mode requires a versioned configuration / target reference.')
    }
  }

  if (id === 'grafana') {
    if (
      draft.grafanaSession === 'Existing Redis session store' &&
      !nonEmpty(draft.grafanaSessionRef)
    ) {
      errors.push('Grafana existing Redis session mode requires a Redis service reference.')
    }
    if (
      draft.grafanaAlertHa === 'Existing Redis for alerting HA' &&
      !nonEmpty(draft.grafanaAlertRef)
    ) {
      errors.push('Grafana Redis alerting-HA mode requires a Redis service reference.')
    }
    if (
      draft.grafanaDatasourceMode ===
        'Existing datasource configuration reference' &&
      !nonEmpty(draft.grafanaDatasourceRef)
    ) {
      errors.push('Grafana existing datasource mode requires a datasource configuration / secret reference.')
    }
  }

  if (
    id === 'alloy' &&
    draft.alloyConfig === 'Existing configuration bundle reference' &&
    !nonEmpty(draft.alloyConfigRef)
  ) {
    errors.push('Grafana Alloy existing configuration mode requires a versioned configuration bundle reference.')
  }

  if (id === 'postgresql') {
    if (
      draft.databaseBootstrap ===
        'Create initial database(s) during deployment' &&
      !nonEmpty(draft.initialDatabases)
    ) {
      errors.push('Database bootstrap is enabled. Enter at least one initial database name.')
    }
    if (
      draft.postgis &&
      draft.postgisTarget === 'Initial database(s)' &&
      draft.databaseBootstrap !==
        'Create initial database(s) during deployment'
    ) {
      errors.push('PostGIS targets initial databases, but initial database creation is disabled.')
    }
    if (
      draft.postgis &&
      draft.postgisTarget === 'Existing/restored database(s)' &&
      !nonEmpty(draft.postgisDatabases)
    ) {
      errors.push('PostGIS is enabled. Enter the existing/restored database name(s).')
    }
  }

  return [...new Set(errors)]
}

const storageErrors = (draft) => {
  const errors = []
  ;(draft.storage || []).forEach((item) => {
    if (item.dependency) {
      if (item.required !== false && !nonEmpty(item.attachmentRef)) {
        errors.push(item.role + ': provide the linked dependency reference.')
      }
      return
    }
    if (!nonEmpty(item.storagePool)) {
      errors.push(item.role + ': choose a storage pool / repository.')
    }
    if (
      item.layout !== 'Repository-managed' &&
      (!Number.isFinite(Number(item.sizeGiB)) || Number(item.sizeGiB) <= 0)
    ) {
      errors.push(item.role + ': size must be greater than zero.')
    }
    if (
      (item.layout === 'Existing SAN / LUN' ||
        item.layout === 'Existing mount') &&
      !nonEmpty(item.attachmentRef)
    ) {
      errors.push(item.role + ': existing storage requires an attachment/reference.')
    }
    if (
      item.layout === 'Existing mount' &&
      nonEmpty(item.mountpoint) &&
      String(item.mountpoint).indexOf('/') !== 0
    ) {
      errors.push(item.role + ': existing mount path must be absolute.')
    }
  })
  return errors
}

const networkErrors = (draft, blueprint) => {
  const errors = []
  if (!nonEmpty(draft.serviceName)) errors.push('Service name is required.')
  if (!isValidFqdn(draft.serviceFqdn)) errors.push('Enter a valid service FQDN.')
  if (!nonEmpty(draft.domain)) errors.push('DNS domain is required.')

  if (draft.ipMode === 'Static') {
    const addresses = String(draft.staticIps || '')
      .split(/\n|,/)
      .map((value) => value.trim())
      .filter(Boolean)
    const required = getArchitecturePlan(draft, blueprint).addressableNodes
    if (typeof required === 'number' && addresses.length < required) {
      errors.push(
        'Static addressing requires at least ' +
          String(required) +
          ' address entries for this VM footprint.'
      )
    }
  }

  if (
    draft.endpointMode === 'Existing load balancer' &&
    !nonEmpty(draft.externalEndpoint)
  ) {
    errors.push('Existing load-balancer mode requires its VIP / service address reference.')
  }

  if (draft.dnsRegistration === 'Existing DNS workflow' && !nonEmpty(draft.dnsWorkflowRef)) {
    errors.push('Existing DNS workflow requires a workflow / integration reference.')
  }

  if (draft.dnsRegistration === 'Manual DNS records') {
    if (!nonEmpty(draft.dnsZone)) errors.push('Manual DNS requires a DNS zone.')
    const ttl = Number(draft.dnsTtl)
    if (!Number.isInteger(ttl) || ttl < 30 || ttl > 86400) {
      errors.push('Manual DNS TTL must be between 30 and 86400 seconds.')
    }
    if (
      draft.dnsTargetMode === 'Specify DNS target now' &&
      !nonEmpty(draft.dnsTarget)
    ) {
      errors.push('Manual DNS target mode requires an IP address or target FQDN.')
    }
  }

  if (draft.portPolicy === 'Custom qualified port') {
    const port = Number(draft.customPort)
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      errors.push('Custom service port must be between 1 and 65535.')
    }
    if (
      blueprint.id === 'yugabytedb' &&
      draft.ybApi === 'Both YSQL + YCQL'
    ) {
      errors.push('YSQL and YCQL use separate listeners; one custom port cannot represent both APIs.')
    }
  }

  if (
    draft.environment === 'Production' &&
    getArchitecturePlan(draft, blueprint).dedicated > 1 &&
    draft.availability === 'Single failure domain'
  ) {
    errors.push('Multi-VM production topology cannot use a single failure domain.')
  }

  return errors
}

const backupErrors = (draft, blueprint) => {
  const errors = []
  if (draft.backupEnabled) {
    if (!Number.isInteger(Number(draft.retentionDays)) || Number(draft.retentionDays) < 1) {
      errors.push('Backup retention must be at least one day.')
    }
    if (!nonEmpty(draft.backupRepositoryRef)) {
      errors.push('Backup is enabled. Select or reference a backup repository.')
    }
    if (draft.pitr && !blueprint.supportsPitr) {
      errors.push('PITR is not offered for this service profile.')
    }
    if (
      blueprint.id === 'postgresql' &&
      draft.barmanPlacement === 'Disabled'
    ) {
      errors.push('PostgreSQL backup is enabled. Select shared/dedicated Barman or disable backup.')
    }
  }

  if (draft.drEnabled) {
    if (!nonEmpty(draft.drTarget)) errors.push('DR requires a target site / profile.')
    if (!Number.isFinite(Number(draft.rpoMinutes)) || Number(draft.rpoMinutes) < 0) {
      errors.push('DR RPO must be zero or a positive number of minutes.')
    }
    if (!Number.isFinite(Number(draft.rtoMinutes)) || Number(draft.rtoMinutes) < 0) {
      errors.push('DR RTO must be zero or a positive number of minutes.')
    }
  }

  return errors
}

const securityErrors = (draft) => {
  const errors = []
  if (draft.environment === 'Production' && !draft.tls) {
    errors.push('TLS is mandatory for the production service profile.')
  }
  if (draft.environment === 'Production' && !draft.monitoring) {
    errors.push('Monitoring must remain enabled for the production service profile.')
  }
  if (draft.environment === 'Production' && !draft.logging) {
    errors.push('Central logging must remain enabled for the production service profile.')
  }
  if (
    draft.packageSourceMode === 'Local repository / mirror' &&
    !nonEmpty(draft.repoUrl)
  ) {
    errors.push('Local repository mode requires an internal repository URL / FQDN.')
  }
  if (
    draft.packageSourceMode === 'Air-gapped bundle' &&
    !nonEmpty(draft.bundleId)
  ) {
    errors.push('Air-gapped mode requires a qualified bundle ID.')
  }
  if (
    draft.packageSourceMode === 'Managed repositories' &&
    draft.internetAccess === 'HTTP(S) Proxy' &&
    !nonEmpty(draft.proxyUrl)
  ) {
    errors.push('Proxy mode requires a proxy URL. Username and password remain optional.')
  }
  return errors
}

export const validateStep = (step, draft, blueprint) => {
  if (!blueprint) return [{ code: 'SERVICE_REQUIRED', message: 'Select a service.' }]
  let messages = []

  if (step === 0) {
    messages = blueprint ? [] : ['Select a service.']
  } else if (step === 1) {
    if (!nonEmpty(draft.version)) messages.push('Select a version.')
    if (!nonEmpty(draft.topology)) messages.push('Select a deployment topology.')
    if (blueprint.editions && !nonEmpty(draft.edition)) messages.push('Select an edition.')
    messages.push(...getProductConfigErrors(draft, blueprint))
  } else if (step === 2) {
    if (!Number.isInteger(Number(draft.vcpu)) || Number(draft.vcpu) < 1) {
      messages.push('vCPU per primary service node must be at least 1.')
    }
    if (!Number.isInteger(Number(draft.memoryGiB)) || Number(draft.memoryGiB) < 1) {
      messages.push('Memory per primary service node must be at least 1 GiB.')
    }
    if (!Number.isFinite(Number(draft.expectedDataGiB)) || Number(draft.expectedDataGiB) < 0) {
      messages.push('Expected data size cannot be negative.')
    }
    if (!Number.isInteger(Number(draft.expectedConnections)) || Number(draft.expectedConnections) < 0) {
      messages.push('Expected connections cannot be negative.')
    }
  } else if (step === 3) {
    messages.push(...storageErrors(draft))
    if (
      draft.placementPolicy === 'Use qualified dedicated pool' &&
      !nonEmpty(draft.dedicatedPool)
    ) {
      messages.push('Dedicated placement requires a qualified pool / policy reference.')
    }
  } else if (step === 4) {
    messages.push(...networkErrors(draft, blueprint))
  } else if (step === 5) {
    messages.push(...backupErrors(draft, blueprint))
  } else if (step === 6) {
    messages.push(...securityErrors(draft))
  } else if (step === 7) {
    for (let index = 0; index < WIZARD_STEPS.length - 1; index += 1) {
      validateStep(index, draft, blueprint).forEach(({ message }) =>
        messages.push(message)
      )
    }
  }

  return [...new Set(messages)].map((message, index) => ({
    code: 'CONFIG_' + String(step + 1) + '_' + String(index + 1),
    message,
  }))
}

export const validateDraft = (draft, blueprint) =>
  validateStep(WIZARD_STEPS.length - 1, draft, blueprint)

export const sanitizeDesign = (draft) => {
  const { proxyPassword, ...safe } = draft
  return {
    ...safe,
    proxyPasswordPresent: Boolean(proxyPassword),
  }
}

export const getProductSummary = (draft, blueprint) => {
  if (!blueprint) return 'No service selected'
  const id = blueprint.id

  if (id === 'postgresql') {
    return (
      'Initial DB: ' +
      (draft.databaseBootstrap === 'Create initial database(s) during deployment'
        ? draft.initialDatabases
        : 'create later') +
      '; Patroni DCS: ' +
      draft.dcsPlacement
    )
  }
  if (id === 'mysql-family' || id === 'mariadb') {
    return (
      draft.sqlBootstrap +
      (draft.sqlBootstrap === 'Create initial application database'
        ? ' · ' + draft.sqlDbName
        : '')
    )
  }
  if (id === 'mongodb-community' || id === 'percona-mongodb') {
    return (
      draft.mongoScopeMode +
      (draft.mongoScopeMode === 'Create application credential scope'
        ? ' · ' + draft.mongoDbName
        : '')
    )
  }
  if (id === 'ferretdb') {
    return 'Logical DB ' + draft.ferretDbName + '; linked PostgreSQL/DocumentDB backend'
  }
  if (id === 'redis' || id === 'valkey') return 'Persistence: ' + draft.kvPersistence
  if (id === 'clickhouse') {
    return draft.clickBootstrap + (draft.clickBootstrap === 'Create initial database' ? ' · ' + draft.clickDbName : '')
  }
  if (id === 'cassandra') {
    return draft.cassBootstrap + (draft.cassBootstrap === 'Create initial keyspace' ? ' · ' + draft.cassKeyspace : '')
  }
  if (id === 'yugabytedb') {
    return draft.ybApi + '; ' + draft.ybBootstrap + (draft.ybBootstrap === 'Create initial database / namespace' ? ' · ' + draft.ybDbName : '')
  }
  if (id === 'rabbitmq') {
    return draft.rabbitVhostMode + (draft.rabbitVhostMode === 'Create application virtual host' ? ' · ' + draft.rabbitVhost : '')
  }
  if (id === 'kafka') {
    return draft.kafkaTopicMode + (draft.kafkaTopic ? ' · ' + draft.kafkaTopic : '') + '; ' + draft.kafkaDurability
  }
  if (id === 'pulsar') {
    return (
      draft.pulsarMetadata +
      '; ' +
      draft.pulsarNamespaceMode +
      (draft.pulsarNamespaceMode === 'Create tenant + namespace'
        ? ' · ' + draft.pulsarTenant + '/' + draft.pulsarNamespace
        : '')
    )
  }
  if (id === 'nginx' || id === 'apache-httpd') {
    return draft.webMode + (draft.webSourceRef ? ' · ' + draft.webSourceRef : '')
  }
  if (id === 'tomcat') {
    return draft.tomcatDeploy + (draft.tomcatArtifactRef ? ' · ' + draft.tomcatArtifactRef : '')
  }
  if (id === 'keycloak') {
    return draft.keycloakAdminMode + (draft.keycloakAdminFqdn ? ' · ' + draft.keycloakAdminFqdn : '')
  }
  if (id === 'superset') {
    return draft.supersetSecretMode + (draft.supersetSecretRef ? ' · secret ref configured' : '')
  }
  if (id === 'airflow') {
    return 'DAG source: ' + (draft.airflowDagRef || 'required') + '; ' + draft.airflowSecretMode
  }
  if (id === 'openbao') {
    return draft.baoSealMode + (draft.baoSealRef ? ' · trust ref configured' : '')
  }
  if (id === 'jenkins') {
    return draft.jenkinsAgentSource + (draft.jenkinsAgentRef ? ' · template ref configured' : '')
  }
  if (id === 'forgejo') {
    return 'Git HTTPS enabled; SSH ' + draft.forgejoSsh + (draft.forgejoSsh === 'Enabled' ? ' on ' + draft.forgejoSshPort : '')
  }
  if (id === 'opensearch') {
    return draft.openSearchSecurity + (draft.openSearchSecurityRef ? ' · reference configured' : '')
  }
  if (id === 'prometheus') {
    return 'Scrapes: ' + draft.promScrapeMode + '; alerting: ' + draft.promAlerting
  }
  if (id === 'grafana') {
    return 'Datasources: ' + draft.grafanaDatasourceMode + '; sessions: ' + draft.grafanaSession + '; alerting HA: ' + draft.grafanaAlertHa
  }
  if (id === 'alloy') return draft.alloyConfig
  return 'Qualified product defaults'
}

export const createDraft = (
  blueprintId = 'postgresql',
  catalog = FALLBACK_BLUEPRINTS
) => {
  const blueprint =
    getBlueprintById(blueprintId, catalog) || catalog[0] || FALLBACK_BLUEPRINTS[0]
  const draft = {
    ...COMMON_DEFAULTS,
    ...PRODUCT_DEFAULTS,
    blueprintId: blueprint.id,
    edition: blueprint.editions ? blueprint.editions[0] : '',
    version: blueprint.versions[0] || '',
    workload: blueprint.workloads[0] || 'General',
  }
  draft.topology = getRecommendedTopology(draft, blueprint)
  draft.endpointMode = endpointDefaults[blueprint.id] || 'Existing load balancer'
  draft.serviceName = blueprint.id + '-prod'
  draft.backupEnabled = !['kafka', 'pulsar'].includes(blueprint.id)
  draft.pitr = Boolean(blueprint.supportsPitr)
  if (blueprint.id === 'redis' || blueprint.id === 'valkey') {
    draft.pitr = false
  }
  draft.storage = getStorageTemplate(draft, blueprint)
  return draft
}
