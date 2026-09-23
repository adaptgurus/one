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

export const LICENSE_NOTICES = Object.freeze({
  'mongodb-community':
    'MongoDB Community uses SSPL licensing. Catalog publication must follow LayerSentry licensing policy for the exact release.',
  'percona-mongodb':
    'Percona Server for MongoDB uses MongoDB-derived source-available licensing for current releases. Treat it separately from OSI-approved OSS.',
  redis:
    'Redis licensing varies by release. The production catalog must pin the approved exact artifact and license rather than assuming one license across versions.',
  mssql:
    'Microsoft SQL Server production use requires the customer-selected licensed edition and a qualified Microsoft package repository / entitlement path.',
  elasticsearch:
    'Elasticsearch distribution licensing must be presented accurately for the exact artifact; catalog presence is not an OSI-open-source claim.',
})

export const BACKUP_PROFILES = Object.freeze({
  postgresql: {
    mode: 'direct',
    default: true,
    engine: 'Barman + PostgreSQL WAL archive',
    note: 'Physical base backups plus WAL archiving; restore and PITR are separately qualified.',
  },
  'mysql-family': {
    mode: 'direct',
    default: true,
    engine: 'Edition-qualified physical backup + binary logs',
    note: 'Backup tooling and PITR implementation depend on the selected MySQL/Percona edition.',
  },
  mariadb: {
    mode: 'direct',
    default: true,
    engine: 'mariadb-backup + binary logs',
    note: 'PITR uses qualified backup plus binary-log retention.',
  },
  mssql: {
    mode: 'direct',
    default: true,
    engine: 'SQL Server native full/differential/log backups',
    note: 'PITR requires an intact native backup and transaction-log chain; AG replication is not a backup.',
  },
  'mongodb-community': {
    mode: 'direct',
    default: true,
    engine: 'Percona Backup for MongoDB (PBM) logical backup + PITR',
    note: 'MongoDB Community uses PBM logical backup plus PITR only when the exact PBM/MongoDB tuple is qualified; physical/incremental PBM backup is not exposed.',
  },
  'percona-mongodb': {
    mode: 'direct',
    default: true,
    engine: 'Percona Backup for MongoDB (PBM)',
    note: 'PBM backup/PITR is qualified for the exact product/version tuple.',
  },
  ferretdb: {
    mode: 'dependency',
    default: false,
    engine: 'Linked PostgreSQL/DocumentDB backend recovery',
    note: 'FerretDB frontends are replaceable; backup/PITR protect the linked backend database.',
  },
  redis: {
    mode: 'direct',
    default: true,
    engine: 'RDB/AOF recovery workflow',
    note: 'Sentinel/Cluster replication is HA, not backup.',
  },
  valkey: {
    mode: 'direct',
    default: true,
    engine: 'RDB/AOF recovery workflow',
    note: 'Replication and persistence recovery are separate controls.',
  },
  clickhouse: {
    mode: 'direct',
    default: true,
    engine: 'ClickHouse BACKUP to qualified repository',
    note: 'Replication/Keeper quorum and backups are independent; generic PITR is not claimed.',
  },
  cassandra: {
    mode: 'direct',
    default: true,
    engine: 'Snapshot/incremental backup + repair-aware recovery',
    note: 'Commit-log point recovery is not exposed until qualified.',
  },
  yugabytedb: {
    mode: 'direct',
    default: true,
    engine: 'YugabyteDB backup + PITR workflow',
    note: 'Backup/PITR is qualified for the exact release and storage topology.',
  },
  rabbitmq: {
    mode: 'none',
    default: false,
    engine: 'Quorum/stream replication + definitions export',
    note: 'Queue replication protects availability; this profile does not advertise portable message-data backup/PITR.',
  },
  kafka: {
    mode: 'none',
    default: false,
    engine: 'Replication + application/event reprocessing policy',
    note: 'Kafka replication is availability, not an application backup/PITR chain.',
  },
  pulsar: {
    mode: 'none',
    default: false,
    engine: 'BookKeeper replication / geo-replication',
    note: 'Ledger replication is availability/DR; generic application backup/PITR is not advertised.',
  },
  nginx: {
    mode: 'none',
    default: false,
    engine: 'Configuration-as-code / artifact source',
    note: 'Stateless web/proxy nodes are rebuilt from versioned configuration.',
  },
  'apache-httpd': {
    mode: 'none',
    default: false,
    engine: 'Configuration/content source of truth',
    note: 'Stateless web tier is rebuilt from source; no application PITR claim is made.',
  },
  tomcat: {
    mode: 'none',
    default: false,
    engine: 'Application artifact + configuration source of truth',
    note: 'Application binaries/configuration are redeployed; business data belongs to explicit dependencies.',
  },
  keycloak: {
    mode: 'dependency',
    default: false,
    engine: 'Linked HA relational database recovery',
    note: 'Keycloak persistence is owned by the linked database; its backup/PITR policy is managed there.',
  },
  superset: {
    mode: 'dependency',
    default: false,
    engine: 'Metadata DB + async dependency recovery',
    note: 'Production metadata and distributed async state are protected through their linked dependencies.',
  },
  airflow: {
    mode: 'dependency',
    default: false,
    engine: 'Metadata DB + DAG source + log/artifact dependency recovery',
    note: 'A metadata-DB-only restore is incomplete without matching DAG and log/artifact state.',
  },
  openbao: {
    mode: 'direct',
    default: true,
    engine: 'Integrated Storage Raft snapshots',
    note: 'Raft quorum is HA; periodic snapshots are the recovery artifact.',
  },
  jenkins: {
    mode: 'direct',
    default: true,
    engine: 'JENKINS_HOME + configuration/credential-safe backup',
    note: 'Agents are replaceable; controller state is backed up and restore-tested.',
  },
  forgejo: {
    mode: 'dependency',
    default: false,
    engine: 'Coordinated DB + repository/object storage recovery',
    note: 'Database-only recovery is insufficient because repository/object state must remain consistent.',
  },
  elasticsearch: {
    mode: 'direct',
    default: true,
    engine: 'Elasticsearch snapshot repository',
    note: 'Snapshot API recovery is the supported application backup path; live data-directory copies are not advertised as backup.',
  },
  opensearch: {
    mode: 'direct',
    default: true,
    engine: 'OpenSearch snapshots to qualified repository',
    note: 'Repository snapshots are the recovery artifact; manager quorum is not a backup.',
  },
  prometheus: {
    mode: 'none',
    default: false,
    engine: 'HA replicas + optional remote-write/long-term backend',
    note: 'Local HA TSDBs are independent; durable shared history requires an explicit long-term backend.',
  },
  grafana: {
    mode: 'dependency',
    default: false,
    engine: 'Linked SQL database recovery',
    note: 'Grafana HA state is owned by the linked SQL database and selected session/alerting dependencies.',
  },
  alloy: {
    mode: 'none',
    default: false,
    engine: 'Versioned configuration source of truth',
    note: 'Collectors are replaceable; telemetry destinations own durable telemetry data.',
  },
})

export const CAPACITY_PROFILES = Object.freeze({
  postgresql: {
    data: true,
    load: true,
    growth: true,
    dataLabel: 'Expected database data (GiB)',
    loadLabel: 'Expected DB client connections',
    defaults: [8, 32, 500, 1000, 25],
  },
  'mysql-family': {
    data: true,
    load: true,
    growth: true,
    dataLabel: 'Expected database data (GiB)',
    loadLabel: 'Expected DB client connections',
    defaults: [8, 32, 500, 1000, 25],
  },
  mariadb: {
    data: true,
    load: true,
    growth: true,
    dataLabel: 'Expected database data (GiB)',
    loadLabel: 'Expected DB client connections',
    defaults: [8, 32, 500, 1000, 25],
  },
  mssql: {
    data: true,
    load: true,
    growth: true,
    dataLabel: 'Expected SQL Server data (GiB)',
    loadLabel: 'Expected SQL client connections',
    defaults: [8, 32, 500, 1000, 25],
  },
  'mongodb-community': {
    data: true,
    load: true,
    growth: true,
    dataLabel: 'Expected document data (GiB)',
    loadLabel: 'Expected application connections',
    defaults: [8, 32, 500, 1000, 25],
  },
  'percona-mongodb': {
    data: true,
    load: true,
    growth: true,
    dataLabel: 'Expected document data (GiB)',
    loadLabel: 'Expected application connections',
    defaults: [8, 32, 500, 1000, 25],
  },
  ferretdb: {
    data: false,
    load: true,
    growth: false,
    loadLabel: 'Expected frontend connections',
    defaults: [4, 8, 0, 500, 0],
  },
  redis: {
    data: true,
    load: true,
    growth: true,
    dataLabel: 'Expected in-memory dataset (GiB)',
    loadLabel: 'Expected client connections',
    defaults: [4, 16, 50, 5000, 20],
  },
  valkey: {
    data: true,
    load: true,
    growth: true,
    dataLabel: 'Expected in-memory dataset (GiB)',
    loadLabel: 'Expected client connections',
    defaults: [4, 16, 50, 5000, 20],
  },
  clickhouse: {
    data: true,
    load: true,
    growth: true,
    dataLabel: 'Expected compressed analytical data (GiB)',
    loadLabel: 'Expected concurrent client connections',
    defaults: [8, 32, 1000, 500, 40],
  },
  cassandra: {
    data: true,
    load: true,
    growth: true,
    dataLabel: 'Expected logical dataset (GiB)',
    loadLabel: 'Expected client connections',
    defaults: [8, 32, 1000, 1000, 40],
  },
  yugabytedb: {
    data: true,
    load: true,
    growth: true,
    dataLabel: 'Expected distributed SQL data (GiB)',
    loadLabel: 'Expected SQL/CQL client connections',
    defaults: [8, 32, 500, 1000, 30],
  },
  rabbitmq: {
    data: true,
    load: true,
    growth: true,
    dataLabel: 'Expected retained message data (GiB)',
    loadLabel: 'Expected concurrent publishers/consumers',
    defaults: [4, 16, 100, 2000, 30],
  },
  kafka: {
    data: true,
    load: true,
    growth: true,
    dataLabel: 'Expected retained log data (GiB)',
    loadLabel: 'Expected producer/consumer connections',
    defaults: [8, 32, 1000, 2000, 40],
  },
  pulsar: {
    data: true,
    load: true,
    growth: true,
    dataLabel: 'Expected retained ledger data (GiB)',
    loadLabel: 'Expected producer/consumer connections',
    defaults: [8, 32, 1000, 2000, 40],
  },
  nginx: {
    data: false,
    load: true,
    growth: false,
    loadLabel: 'Expected concurrent client connections',
    defaults: [2, 4, 0, 2000, 0],
  },
  'apache-httpd': {
    data: false,
    load: true,
    growth: false,
    loadLabel: 'Expected concurrent client connections',
    defaults: [2, 4, 0, 1500, 0],
  },
  tomcat: {
    data: false,
    load: true,
    growth: false,
    loadLabel: 'Expected concurrent application sessions',
    defaults: [4, 8, 0, 500, 0],
  },
  keycloak: {
    data: false,
    load: true,
    growth: false,
    loadLabel: 'Expected concurrent identity sessions',
    defaults: [4, 8, 0, 1000, 0],
  },
  superset: {
    data: false,
    load: true,
    growth: false,
    loadLabel: 'Expected concurrent interactive users',
    defaults: [4, 8, 0, 200, 0],
  },
  airflow: {
    data: false,
    load: true,
    growth: false,
    loadLabel: 'Expected concurrent workflow tasks',
    defaults: [4, 8, 0, 200, 0],
  },
  openbao: {
    data: true,
    load: true,
    growth: true,
    dataLabel: 'Expected Raft state (GiB)',
    loadLabel: 'Expected concurrent API clients',
    defaults: [4, 8, 20, 500, 20],
  },
  jenkins: {
    data: true,
    load: true,
    growth: true,
    dataLabel: 'Expected controller state (GiB)',
    loadLabel: 'Expected concurrent build/API clients',
    defaults: [4, 8, 100, 200, 30],
  },
  forgejo: {
    data: false,
    load: true,
    growth: false,
    loadLabel: 'Expected concurrent web/Git clients',
    defaults: [4, 8, 0, 500, 0],
  },
  elasticsearch: {
    data: true,
    load: true,
    growth: true,
    dataLabel: 'Expected indexed data (GiB)',
    loadLabel: 'Expected concurrent indexing/search clients',
    defaults: [8, 32, 1000, 500, 40],
  },
  opensearch: {
    data: true,
    load: true,
    growth: true,
    dataLabel: 'Expected indexed data (GiB)',
    loadLabel: 'Expected concurrent indexing/search clients',
    defaults: [8, 32, 1000, 500, 40],
  },
  prometheus: {
    data: true,
    load: true,
    growth: true,
    dataLabel: 'Expected local TSDB data (GiB)',
    loadLabel: 'Expected scrape targets',
    defaults: [4, 16, 200, 1000, 40],
  },
  grafana: {
    data: false,
    load: true,
    growth: false,
    loadLabel: 'Expected concurrent dashboard users',
    defaults: [2, 4, 0, 300, 0],
  },
  alloy: {
    data: false,
    load: true,
    growth: false,
    loadLabel: 'Expected telemetry source count',
    defaults: [2, 4, 0, 500, 0],
  },
})

export const getCapacityProfile = (blueprint) =>
  CAPACITY_PROFILES[blueprint?.id] || {
    data: true,
    load: true,
    growth: true,
    dataLabel: 'Expected application data (GiB)',
    loadLabel: 'Expected concurrent clients',
    defaults: [4, 8, 100, 500, 20],
  }

export const DR_PROFILES = Object.freeze({
  postgresql: {
    mode: 'topology',
    topologies: ['HA + DR'],
    label: 'PostgreSQL site DR',
  },
  'mysql-family': {
    mode: 'topology',
    match: /DR|ClusterSet/i,
    label: 'MySQL/Percona site DR',
  },
  mariadb: { mode: 'topology', match: /DR/i, label: 'MariaDB asynchronous DR' },
  cassandra: {
    mode: 'topology',
    match: /Multi-DC/i,
    label: 'Cassandra multi-DC placement',
  },
  yugabytedb: {
    mode: 'topology',
    match: /xCluster DR/i,
    label: 'YugabyteDB xCluster DR',
  },
  rabbitmq: {
    mode: 'topology',
    match: /Federation DR/i,
    label: 'RabbitMQ federation DR',
  },
  pulsar: {
    mode: 'topology',
    match: /Multi-cluster DR/i,
    label: 'Pulsar multi-cluster DR',
  },
})

export const getDrProfile = (draft, blueprint) => {
  const profile = DR_PROFILES[blueprint?.id]
  if (!profile) return { available: false, configuredByTopology: false }
  const topology = String(draft?.topology || '')
  const active = profile.topologies
    ? profile.topologies.includes(topology)
    : profile.match
    ? profile.match.test(topology)
    : false

  return { ...profile, available: active, configuredByTopology: active }
}

export const getBackupProfile = (blueprint) =>
  BACKUP_PROFILES[blueprint?.id] || {
    mode: 'none',
    default: false,
    engine: 'Qualified product recovery policy',
    note: 'Recovery behavior is qualification-controlled.',
  }

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
    description:
      'Relational database with Patroni HA and application-aware recovery.',
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
    topologies: [
      'Standalone',
      '3-node InnoDB Cluster',
      '5-node InnoDB Cluster',
      'ClusterSet DR',
    ],
    recommendedTopology: '3-node InnoDB Cluster',
    workloads: ['OLTP', 'OLAP', 'Mixed'],
    defaultPort: 3306,
    supportsPitr: true,
  }),
  catalogItem({
    id: 'mssql',
    category: 'Databases & Data',
    name: 'Microsoft SQL Server',
    icon: 'MS',
    description:
      'Licensed SQL Server with edition-aware Linux HA and native recovery.',
    versions: ['2025', '2022', '2019'],
    editions: ['Standard', 'Enterprise'],
    topologies: [
      'Standalone',
      'Basic AG (2 SQL replicas + config-only quorum)',
      '3-replica Availability Group',
    ],
    recommendedTopology: 'Standalone',
    workloads: ['OLTP', 'OLAP', 'Mixed'],
    defaultPort: 1433,
    supportsPitr: true,
  }),
  catalogItem({
    id: 'mariadb',
    category: 'Databases & Data',
    name: 'MariaDB Community',
    icon: 'MA',
    description: 'MariaDB with Galera quorum and asynchronous DR patterns.',
    versions: ['11.4 LTS', '11.8 LTS'],
    topologies: [
      'Standalone',
      '3-node Galera',
      '5-node Galera',
      '3-node Galera + asynchronous DR',
    ],
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
    description:
      'Replica-set and explicitly sized sharded MongoDB Community patterns.',
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
    description:
      'In-memory service with explicit persistence and Sentinel/Cluster patterns.',
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
    description:
      'Open-source in-memory data platform with Sentinel/Cluster patterns.',
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
    topologies: [
      'Standalone',
      '3 data nodes + 3 Keeper',
      '2 shards × 2 replicas + 3 Keeper',
    ],
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
    description:
      'Distributed wide-column database with explicit RF/DC placement.',
    versions: ['5.0'],
    topologies: [
      '3-node Cluster (RF=3)',
      '5-node Cluster (RF=3)',
      'Multi-DC: 3 nodes per DC minimum',
    ],
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
    topologies: [
      '3-node Quorum Cluster',
      '5-node Quorum Cluster',
      'Federation DR: 3 + 3 nodes',
    ],
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
    description:
      'KRaft event streaming with dedicated brokers and controllers.',
    versions: ['4.3'],
    topologies: [
      '3 brokers + 3 controllers',
      '5 brokers + 3 controllers',
      '3 brokers + 5 controllers',
    ],
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
    description:
      'Messaging/streaming with explicit metadata and BookKeeper ownership.',
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
    description:
      'Web/reverse-proxy service with explicit upstream/content ownership.',
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
    description:
      'Identity service with external SQL dependency and private admin surface.',
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
    description:
      'BI platform with external metadata DB and distributed workers.',
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
    description:
      'Workflow orchestration with explicit DAG, metadata, broker and log ownership.',
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
    description:
      'Git forge with external SQL and durable repository/object state.',
    versions: ['15 LTS'],
    topologies: ['Standalone', 'HA Pair'],
    recommendedTopology: 'HA Pair',
    workloads: ['Git hosting', 'Collaboration'],
    defaultPort: 443,
    supportsPitr: true,
  }),
  catalogItem({
    id: 'elasticsearch',
    category: 'Search & Observability',
    name: 'Elasticsearch',
    icon: 'ES',
    description:
      'Search/analytics with first-formation-safe cluster bootstrap and snapshot recovery.',
    versions: ['9.5', '8.19'],
    topologies: [
      '3-node Production Cluster',
      '3 masters + 3 data',
      '3 masters + 6 data',
    ],
    recommendedTopology: '3-node Production Cluster',
    workloads: ['Search', 'Logs', 'Analytics'],
    defaultPort: 9200,
    supportsPitr: false,
  }),
  catalogItem({
    id: 'opensearch',
    category: 'Search & Observability',
    name: 'OpenSearch',
    icon: 'OS',
    description:
      'Search/analytics with dedicated cluster managers and data nodes.',
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
    description:
      'Metrics collection with explicit alerting and scrape ownership.',
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
  mssqlFencingRef: '',
  elasticSecurity: 'LayerSentry managed security configuration',
  elasticSecurityRef: '',
  elasticKibana: false,
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
  rabbitDurability: 'Quorum queues as production default',
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
  tomcatSessionMode: 'Stateless / externalized application session state',
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
  promAlerting: 'Alerting disabled',
  promAlertRef: '',
  prometheusHistoryMode: 'Independent local TSDB on each HA replica',
  prometheusHistoryRef: '',
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
  pgbouncerPlacement: 'On PostgreSQL nodes',
}

const COMMON_DEFAULTS = {
  edition: '',
  version: '',
  topology: '',
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
  endpointMode: '',
  externalEndpoint: '',
  portPolicy: 'Use product default',
  customPort: '',
  backupEnabled: true,
  retentionDays: 30,
  pitr: false,
  pitrWindowHours: 72,
  backupRepositoryRef: '',
  drTarget: '',
  rpoMinutes: 15,
  rtoMinutes: 60,
  tlsCertificateRef: '',
  credentialRef: '',
  packageSourceMode: 'Managed repositories',
  storage: [],
  dependencyModes: {},
  dependencyRefs: {},
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

export const getEndpointOptions = (draft, blueprint) => {
  if (!blueprint) return []
  const topology = String(draft.topology || '')
  const standalone = topology === 'Standalone'

  switch (blueprint.id) {
    case 'postgresql':
    case 'mysql-family':
    case 'mariadb':
      return standalone
        ? ['Direct service endpoint', 'Existing load balancer']
        : ['Existing load balancer']
    case 'mssql':
      return standalone
        ? ['Direct service endpoint', 'Existing load balancer']
        : ['SQL Server Pacemaker listener']
    case 'mongodb-community':
    case 'percona-mongodb':
      return ['Native multi-host / replica-set discovery']
    case 'ferretdb':
      return topology.startsWith('1 FerretDB')
        ? ['Direct service endpoint', 'Existing load balancer']
        : ['Existing load balancer']
    case 'redis':
    case 'valkey':
      return standalone
        ? ['Direct service endpoint', 'Existing load balancer']
        : ['Native Sentinel/Cluster discovery']
    case 'clickhouse':
      return standalone
        ? ['Direct service endpoint']
        : ['Native multi-host client list']
    case 'cassandra':
      return ['Native multi-host client list']
    case 'yugabytedb':
      return ['Native multi-host client list']
    case 'rabbitmq':
      return ['Native node list']
    case 'kafka':
      return ['Native bootstrap broker list']
    case 'pulsar':
      return ['Native broker service URL']
    case 'nginx':
    case 'apache-httpd':
    case 'tomcat':
    case 'keycloak':
    case 'superset':
    case 'airflow':
    case 'forgejo':
    case 'grafana':
      return standalone
        ? ['Direct service endpoint', 'Existing load balancer']
        : ['Existing load balancer']
    case 'openbao':
      return standalone
        ? ['Direct service endpoint']
        : ['Existing load balancer']
    case 'jenkins':
      return ['Direct service endpoint']
    case 'elasticsearch':
      return ['Native node list']
    case 'opensearch':
      return ['Native node list']
    case 'prometheus':
      return standalone
        ? ['Direct service endpoint']
        : ['Existing load balancer']
    case 'alloy':
      return ['No customer service endpoint']
    default:
      return ['Existing load balancer']
  }
}

const endpointIntentMode = (endpointMode) => {
  if (endpointMode === 'No customer service endpoint') return 'none'
  if (endpointMode === 'Existing load balancer') return 'external_lb'
  if (String(endpointMode || '').startsWith('Native '))
    return 'native_discovery'

  return 'product_native'
}

export const getTopologyOptions = (draft, blueprint) => {
  if (!blueprint) return []

  if (blueprint.id === 'mssql') {
    return draft.edition === 'Standard'
      ? ['Standalone', 'Basic AG (2 SQL replicas + config-only quorum)']
      : ['Standalone', '3-replica Availability Group']
  }

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
    return ['3-node PXC', '5-node PXC', '3-node PXC + asynchronous DR']
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
  if (blueprint.id === 'mssql') return 'Standalone'
  if (blueprint.id === 'mysql-family') {
    if (draft.edition === 'Percona Server for MySQL') {
      return '3-node Group Replication'
    }
    if (draft.edition === 'Percona XtraDB Cluster') return '3-node PXC'
  }

  return blueprint.recommendedTopology || blueprint.topologies[0]
}

export const getDependencySpecs = (draft, blueprint) => {
  if (!blueprint) return []
  const topology = draft.topology || ''
  const service = (
    key,
    label,
    provisionLabel,
    vmEstimate,
    existingLabel,
    refLabel,
    note
  ) => ({
    key,
    label,
    kind: 'service',
    provisionLabel,
    vmEstimate,
    existingLabel,
    refLabel,
    note,
  })
  const storage = (
    key,
    label,
    managedLabel,
    existingLabel,
    refLabel,
    note
  ) => ({
    key,
    label,
    kind: 'storage',
    managedLabel,
    existingLabel,
    refLabel,
    note,
  })
  const external = (key, label, existingLabel, refLabel, note) => ({
    key,
    label,
    kind: 'external',
    existingLabel,
    refLabel,
    note,
  })

  switch (blueprint.id) {
    case 'ferretdb':
      return [
        service(
          'ferretBackend',
          'PostgreSQL + DocumentDB backend',
          'Provision linked 3-node PostgreSQL/DocumentDB HA backend',
          3,
          'Use existing qualified PostgreSQL/DocumentDB backend',
          'Backend service ID / FQDN',
          'FerretDB frontends are replaceable; authoritative data lives in the PostgreSQL/DocumentDB backend.'
        ),
      ]
    case 'keycloak':
      return [
        service(
          'metadataDb',
          'HA relational database',
          'Provision linked PostgreSQL 3-node HA',
          3,
          'Use existing qualified database',
          'Existing database service ID / FQDN',
          'Keycloak availability depends on this database; it is not hidden as an implementation detail.'
        ),
      ]
    case 'superset': {
      const deps = [
        service(
          'metadataDb',
          'Superset metadata database',
          'Provision linked PostgreSQL 3-node HA',
          3,
          'Use existing qualified metadata database',
          'Database service ID / FQDN',
          'SQLite is not used for the production profile.'
        ),
      ]
      if (topology === 'Distributed') {
        deps.push(
          service(
            'asyncBackend',
            'Async broker / results backend',
            'Provision linked Valkey Sentinel HA',
            3,
            'Use existing qualified Redis/Valkey backend',
            'Broker/results service ID / FQDN',
            'Distributed Celery execution requires a shared broker/results dependency.'
          )
        )
      }

      return deps
    }
    case 'airflow': {
      const deps = [
        service(
          'metadataDb',
          'Airflow metadata database',
          'Provision linked PostgreSQL 3-node HA',
          3,
          'Use existing qualified metadata database',
          'Database service ID / FQDN',
          'Metadata database state is authoritative and separately protected.'
        ),
      ]
      if (topology === 'Distributed Celery') {
        deps.push(
          service(
            'queueBroker',
            'Celery queue broker',
            'Provision linked Valkey Sentinel HA',
            3,
            'Use existing qualified Redis/Valkey broker',
            'Broker service ID / FQDN',
            'Required by the distributed Celery executor profile.'
          ),
          storage(
            'taskLogs',
            'Task log / artifact storage',
            'LayerSentry managed shared/object storage',
            'Use existing qualified storage',
            'Task log storage / bucket reference',
            'Distributed task logs/artifacts need a shared durable backend; DAG code is supplied separately.'
          )
        )
      }

      return deps
    }
    case 'forgejo':
      return [
        service(
          'metadataDb',
          'Forgejo relational database',
          'Provision linked PostgreSQL 3-node HA',
          3,
          'Use existing qualified database',
          'Database service ID / FQDN',
          'Database and repository/object state must be recovered consistently.'
        ),
        storage(
          'repoStorage',
          'Repository / LFS / attachment storage',
          'LayerSentry managed shared storage',
          'Use existing qualified storage',
          'Storage service / mount / bucket reference',
          'Load-balanced Forgejo nodes must not keep authoritative repository state on isolated local disks.'
        ),
      ]
    case 'grafana':
      return [
        service(
          'metadataDb',
          'Grafana SQL database',
          'Provision linked PostgreSQL 3-node HA',
          3,
          'Use existing qualified MySQL/PostgreSQL database',
          'Database service ID / FQDN',
          'HA Grafana instances share one external SQL database; SQLite is not used for HA.'
        ),
      ]
    case 'alloy':
      return [
        external(
          'telemetryTarget',
          'Telemetry destination',
          'Use existing qualified telemetry endpoint',
          'Prometheus/Loki/Tempo/OTLP endpoint reference',
          'A collector is not READY until its required destination/output contract is known.'
        ),
      ]
    default:
      return []
  }
}

export const getDependencyOptions = (dependency) => [dependency.existingLabel]

const defaultDependencyMode = (dependency) =>
  getDependencyOptions(dependency)[0]

export const getDefaultDependencyState = (draft, blueprint) => {
  const modes = {}
  const refs = {}
  getDependencySpecs(draft, blueprint).forEach((dependency) => {
    modes[dependency.key] = defaultDependencyMode(dependency)
    refs[dependency.key] = ''
  })

  return { dependencyModes: modes, dependencyRefs: refs }
}

const dependencyNeedsReference = (dependency, mode) =>
  mode === dependency.existingLabel

const dependencyVmCount = () => 0

export const getDependencyErrors = (draft, blueprint) =>
  getDependencySpecs(draft, blueprint).flatMap((dependency) => {
    const mode =
      draft.dependencyModes?.[dependency.key] ||
      defaultDependencyMode(dependency)
    if (
      dependencyNeedsReference(dependency, mode) &&
      !String(draft.dependencyRefs?.[dependency.key] || '').trim()
    ) {
      return [
        dependency.label +
          ': enter the required existing dependency reference or choose a LayerSentry-managed/provisioned option.',
      ]
    }

    return []
  })

export const getDependencySummary = (draft, blueprint) => {
  const specs = getDependencySpecs(draft, blueprint)
  if (!specs.length) return 'No required linked runtime dependency'

  return specs
    .map((dependency) => {
      const mode =
        draft.dependencyModes?.[dependency.key] ||
        defaultDependencyMode(dependency)
      const ref = dependencyNeedsReference(dependency, mode)
        ? draft.dependencyRefs?.[dependency.key] || 'reference required'
        : ''

      return dependency.label + ': ' + mode + (ref ? ' · ' + ref : '')
    })
    .join(' | ')
}

const vol = (
  role,
  scope,
  sizeGiB,
  mountpoint,
  storagePool = 'Production Block Pool',
  layout = 'Single disk'
) => ({
  role,
  scope,
  sizeGiB,
  storagePool,
  layout,
  attachmentRef: '',
  mountpoint,
})

const dataSize = (draft) => Math.max(20, Number(draft.expectedDataGiB) || 100)
const logSize = (draft) => Math.max(20, Math.ceil(dataSize(draft) * 0.2))

export const getStorageTemplate = (draft, blueprint) => {
  if (!blueprint) return []
  const d = dataSize(draft)
  const l = logSize(draft)

  switch (blueprint.id) {
    case 'postgresql':
      return [
        vol('Data', 'Per PostgreSQL VM', d, '/pgdata'),
        vol('WAL', 'Per PostgreSQL VM', l, '/pgwal'),
      ]
    case 'mysql-family':
    case 'mariadb':
      return [
        vol('Data', 'Per database VM', d, '/var/lib/mysql'),
        vol('Redo / binary log', 'Per database VM', l, '/var/lib/mysql-binlog'),
      ]
    case 'mssql':
      return [
        vol('SQL Server data', 'Per SQL replica VM', d, '/var/opt/mssql/data'),
        vol('SQL Server log', 'Per SQL replica VM', l, '/var/opt/mssql/log'),
        vol(
          'SQL Server tempdb',
          'Per SQL replica VM',
          Math.max(20, Math.ceil(d * 0.15)),
          '/var/opt/mssql/tempdb'
        ),
      ]
    case 'mongodb-community':
    case 'percona-mongodb':
      return [
        vol('Data', 'Per data-bearing MongoDB VM', d, '/var/lib/mongo'),
        vol(
          'Journal',
          'Per data-bearing MongoDB VM',
          l,
          '/var/lib/mongo-journal'
        ),
      ]
    case 'ferretdb':
      return []
    case 'redis':
      return [
        vol('Persistence data (RDB/AOF)', 'Per data node', d, '/var/lib/redis'),
      ]
    case 'valkey':
      return [
        vol(
          'Persistence data (RDB/AOF)',
          'Per data node',
          d,
          '/var/lib/valkey'
        ),
      ]
    case 'clickhouse':
      return [
        vol('ClickHouse data', 'Per data node', d, '/var/lib/clickhouse'),
        ...(draft.topology === 'Standalone'
          ? []
          : [
              vol(
                'ClickHouse Keeper data',
                'Per Keeper VM',
                20,
                '/var/lib/clickhouse-keeper'
              ),
            ]),
      ]
    case 'cassandra':
      return [
        vol('Data', 'Per Cassandra node', d, '/var/lib/cassandra/data'),
        vol(
          'Commit log',
          'Per Cassandra node',
          l,
          '/var/lib/cassandra/commitlog'
        ),
      ]
    case 'yugabytedb':
      return [
        vol('Tablet data', 'Per YB-TServer VM', d, '/var/lib/yugabyte/tserver'),
        vol('WAL', 'Per YB-TServer VM', l, '/var/lib/yugabyte/wal'),
        vol(
          'YB-Master metadata',
          'Per dedicated YB-Master VM',
          20,
          '/var/lib/yugabyte/master'
        ),
      ]
    case 'rabbitmq':
      return [
        vol(
          'Persistent message data',
          'Per RabbitMQ VM',
          d,
          '/var/lib/rabbitmq'
        ),
      ]
    case 'kafka':
      return [
        vol('Broker log / data', 'Per Kafka broker VM', d, '/var/lib/kafka'),
        vol(
          'Kafka controller metadata',
          'Per KRaft controller VM',
          20,
          '/var/lib/kafka-controller'
        ),
      ]
    case 'pulsar':
      return [
        vol(
          'BookKeeper journal',
          'Per bookie VM',
          l,
          '/var/lib/pulsar/bookkeeper/journal'
        ),
        vol(
          'BookKeeper ledgers',
          'Per bookie VM',
          d,
          '/var/lib/pulsar/bookkeeper/ledgers'
        ),
        vol(
          'Pulsar metadata state',
          'Per local metadata VM',
          20,
          '/var/lib/pulsar/metadata'
        ),
        ...(draft.pulsarConfigStore === 'Dedicated 3-node configuration store'
          ? [
              vol(
                'Configuration metadata state',
                'Per configuration-store VM',
                20,
                '/var/lib/pulsar/configuration'
              ),
            ]
          : []),
      ]
    case 'nginx':
    case 'apache-httpd':
    case 'tomcat':
    case 'keycloak':
    case 'superset':
    case 'airflow':
    case 'forgejo':
    case 'grafana':
    case 'alloy':
      return []
    case 'openbao':
      return [
        vol(
          'Raft integrated-storage data',
          'Per OpenBao server',
          Math.max(20, Math.min(d, 200)),
          '/opt/openbao/data'
        ),
      ]
    case 'jenkins':
      return [
        vol(
          'JENKINS_HOME',
          'Controller persistent state',
          d,
          '/var/lib/jenkins'
        ),
      ]
    case 'elasticsearch':
      return [
        vol(
          'Elasticsearch data',
          'Per Elasticsearch data/combined VM',
          d,
          '/var/lib/elasticsearch'
        ),
        vol(
          'Elasticsearch logs',
          'Per Elasticsearch VM',
          l,
          '/var/log/elasticsearch'
        ),
        ...(String(draft.topology || '').startsWith('3 masters +')
          ? [
              vol(
                'Elasticsearch master state',
                'Per dedicated master VM',
                20,
                '/var/lib/elasticsearch-master'
              ),
            ]
          : []),
      ]
    case 'opensearch':
      return [
        vol('Index data', 'Per OpenSearch data VM', d, '/var/lib/opensearch'),
        vol(
          'OpenSearch manager state',
          'Per cluster-manager VM',
          20,
          '/var/lib/opensearch-manager'
        ),
      ]
    case 'prometheus':
      return [vol('Local TSDB', 'Per Prometheus VM', d, '/var/lib/prometheus')]
    default:
      return []
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
  if (draft.endpointMode === 'Existing load balancer') {
    currentPlan.shared.push(
      'existing qualified external endpoint reference (not provisioned by this workflow)'
    )
  }

  return currentPlan
}

const getBaseArchitecturePlan = (draft, blueprint) => {
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
    const shared = []
    if (topology !== 'Standalone') {
      shared.push('tuple-qualified existing etcd DCS')
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
          'Tuple-qualified existing DCS',
          '3/5 external',
          0,
          'DCS endpoints are immutable tuple metadata; this workflow does not provision etcd.'
        )
      )
    }
    if (draft.pgbouncerPlacement !== 'Disabled') {
      components.push(
        component(
          'PgBouncer',
          'Co-located on PostgreSQL nodes',
          dbNodes,
          0,
          'Connection pooling runs on the database VMs; no dedicated PgBouncer VMs are created.'
        )
      )
    }

    return plan(
      dbNodes,
      components,
      shared,
      topology === 'HA + DR' ? 3 : dbNodes,
      'PostgreSQL',
      topology === 'HA + DR'
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

  if (id === 'mssql') {
    if (topology === 'Standalone') {
      return plan(
        1,
        [
          component(
            'SQL Server',
            'Standalone licensed database VM',
            1,
            1,
            'No automatic database failover.'
          ),
        ],
        [],
        1,
        'SQL Server'
      )
    }

    if (topology === 'Basic AG (2 SQL replicas + config-only quorum)') {
      return plan(
        3,
        [
          component(
            'SQL Server Standard replicas',
            'Primary + secondary Basic AG VMs',
            2,
            2,
            'Standard edition Basic AG is limited to two SQL replicas.'
          ),
          component(
            'Pacemaker configuration-only quorum',
            'Dedicated quorum VM without a SQL data replica',
            1,
            1,
            'Required for safe automatic failover of a two-replica Linux AG.'
          ),
        ],
        [],
        2,
        'SQL Server replicas'
      )
    }

    return plan(
      3,
      [
        component(
          'SQL Server Enterprise replicas',
          'Three Availability Group replica VMs',
          3,
          3,
          'Enterprise edition supports the full three-replica HA profile.'
        ),
      ],
      [],
      3,
      'SQL Server replicas'
    )
  }

  if (id === 'mariadb') {
    const dr = topology.indexOf('DR') >= 0
    const nodes = dr
      ? 6
      : topology.indexOf('5-node') === 0
      ? 5
      : topology === 'Standalone'
      ? 1
      : 3

    return addEndpoint(
      draft,
      plan(
        nodes,
        [
          component(
            'MariaDB',
            dr
              ? 'Primary Galera + asynchronous DR cluster'
              : 'Galera database VMs',
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

    return addEndpoint(
      draft,
      plan(
        frontend,
        [
          component(
            'FerretDB',
            'Stateless MongoDB-wire frontend VMs',
            frontend,
            frontend,
            'Frontends are replaceable; authoritative state belongs to the linked backend.'
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
        [
          component(
            'ClickHouse',
            'Standalone data VM',
            1,
            1,
            'No replication quorum.'
          ),
        ],
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
    const tservers = xcluster ? 6 : topology.indexOf('5 TServers') === 0 ? 5 : 3
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
            dr
              ? 'Two 3-node clusters for federation DR'
              : String(nodes) + '-node cluster',
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
        draft.pulsarMetadata.indexOf('Oxia') === 0
          ? 'Oxia local metadata'
          : 'ZooKeeper local metadata',
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
      topology === 'Standalone' ? 1 : topology.indexOf('3-node') === 0 ? 3 : 2

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
        ],
        [],
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
          ],
          [],
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
          component(
            'Superset web',
            'Load-balanced web VMs',
            2,
            2,
            'All web nodes share one metadata DB.'
          ),
          component(
            'Celery workers',
            'Async query/background worker VMs',
            2,
            2,
            'Workers share the same configuration.'
          ),
          component(
            'Celery beat',
            'One active scheduler process',
            'co-located',
            0,
            'Run exactly one active beat scheduler.'
          ),
        ],
        [],
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
          ],
          [],
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
          component(
            'Airflow control tier',
            '2 control VMs',
            2,
            2,
            'API/scheduler/DAG-processor/triggerer placement is qualified.'
          ),
          component(
            'Airflow workers',
            'Dedicated worker VMs',
            2,
            2,
            'Task execution is isolated from the control tier.'
          ),
        ],
        [],
        2,
        'Airflow control'
      )
    )
  }

  if (id === 'openbao') {
    const nodes =
      topology === 'Standalone' ? 1 : topology.indexOf('3-node') === 0 ? 3 : 5

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
          component(
            'Forgejo',
            'Application VMs',
            nodes,
            nodes,
            'HA nodes share DB and repository/object state.'
          ),
        ],
        [],
        nodes,
        'Forgejo'
      )
    )
  }

  if (id === 'elasticsearch') {
    if (topology === '3-node Production Cluster') {
      return plan(
        3,
        [
          component(
            'Elasticsearch combined nodes',
            'Master-eligible + data/ingest VMs',
            3,
            3,
            'Small production profile keeps an odd master quorum while every node carries data.'
          ),
        ],
        [],
        3,
        'Elasticsearch'
      )
    }

    const dataNodes = topology.includes('6 data') ? 6 : 3

    return plan(
      3 + dataNodes,
      [
        component(
          'Elasticsearch master nodes',
          'Dedicated master-eligible VMs',
          3,
          3,
          'Three dedicated masters preserve cluster-state quorum.'
        ),
        component(
          'Elasticsearch data nodes',
          'Dedicated data/ingest/search VMs',
          dataNodes,
          dataNodes,
          'Data capacity scales independently from master quorum.'
        ),
      ],
      [],
      dataNodes,
      'Elasticsearch data'
    )
  }

  if (id === 'opensearch') {
    const dataNodes = topology.indexOf('6 data') >= 0 ? 6 : 3

    return addEndpoint(
      draft,
      plan(
        3 + dataNodes,
        [
          component(
            'Cluster-manager nodes',
            'Dedicated cluster-manager VMs',
            3,
            3,
            'Three managers preserve quorum and isolate cluster-state work.'
          ),
          component(
            'Data nodes',
            'Dedicated data/ingest/search VMs',
            dataNodes,
            dataNodes,
            'Data capacity scales independently from managers.'
          ),
        ],
        [],
        dataNodes,
        'OpenSearch data'
      )
    )
  }

  if (id === 'prometheus') {
    const prometheusNodes = topology === 'Standalone' ? 1 : 2
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
    if (draft.promAlerting === 'Existing Alertmanager cluster') {
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
        prometheusNodes,
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
          component(
            'Grafana',
            'Application VMs',
            nodes,
            nodes,
            'HA instances share one external SQL database.'
          ),
          component(
            'Session continuity',
            draft.grafanaSession,
            'external/policy',
            0,
            'Session continuity is independent of alerting HA.'
          ),
          component(
            'Unified Alerting HA',
            draft.grafanaAlertHa,
            'policy/dependency',
            0,
            'Alerting HA state is explicitly selected.'
          ),
        ],
        [],
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
      ['versioned collector configuration'],
      nodes,
      'Alloy'
    )
  }

  return plan(
    1,
    [
      component(
        blueprint.name,
        'Qualified service VM',
        1,
        1,
        'Exact component split is backend-qualified.'
      ),
    ],
    [],
    1,
    blueprint.name
  )
}

export const getArchitecturePlan = (draft, blueprint) => {
  const current = getBaseArchitecturePlan(draft, blueprint)
  const baseDedicated = Number(current.dedicated || 0)
  let linkedDedicated = 0

  getDependencySpecs(draft, blueprint).forEach((dependency) => {
    const mode =
      draft.dependencyModes?.[dependency.key] ||
      defaultDependencyMode(dependency)
    const adds = dependencyVmCount(dependency, mode)
    linkedDedicated += adds

    if (adds > 0) {
      current.components.push(
        component(
          dependency.label,
          'Linked LayerSentry dependency blueprint',
          adds,
          adds,
          mode + '. Linked dependency VMs are counted explicitly.'
        )
      )
    } else {
      const ref = dependencyNeedsReference(dependency, mode)
        ? draft.dependencyRefs?.[dependency.key] || 'reference required'
        : mode
      current.components.push(
        component(
          dependency.label,
          mode,
          dependency.kind === 'storage' ? 'managed/shared' : 'external',
          0,
          dependency.note + ' Reference/status: ' + ref + '.'
        )
      )
      current.shared.push(dependency.label + ': ' + ref)
    }
  })

  current.primaryDedicated =
    current.primaryDedicated == null ? baseDedicated : current.primaryDedicated
  current.linkedDedicated = linkedDedicated
  current.dedicated = baseDedicated + linkedDedicated

  return current
}

export const getNetworkProfile = (draft, blueprint) => {
  const mode = endpointIntentMode(draft?.endpointMode)

  return {
    mode,
    customerTraffic: mode !== 'none',
    singleEndpoint: mode === 'product_native' || mode === 'external_lb',
    nativeDiscovery: mode === 'native_discovery',
    multiVm: getArchitecturePlan(draft, blueprint).dedicated > 1,
  }
}

const validSecretReference = (value) =>
  /^secret:\/\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(String(value || '').trim()) &&
  !String(value || '').includes('..')

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
    if (
      draft.databaseBootstrap === 'Create initial database(s) during deployment'
    ) {
      fields.push(
        text('initialDatabases', 'Initial database name(s)', {
          helper:
            'Comma-separated names. Databases are created before extensions are enabled.',
        })
      )
    }
    fields.push(
      select('pgbouncerPlacement', 'PgBouncer', [
        'On PostgreSQL nodes',
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
        helper:
          'Enable geospatial types/functions only for selected database(s).',
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
        fields.push(
          text('postgisDatabases', 'Existing/restored database name(s)')
        )
      }
    }

    return fields
  }

  if (id === 'mssql') {
    fields.push(
      select('sqlBootstrap', 'Application database', [
        'Create initial application database',
        'Create database later',
      ])
    )
    if (draft.sqlBootstrap === 'Create initial application database') {
      fields.push(text('sqlDbName', 'Initial application database name'))
    }
    if (draft.topology !== 'Standalone') {
      fields.push(
        text(
          'mssqlFencingRef',
          'Qualified fencing / STONITH profile reference',
          {
            helper:
              'Production Pacemaker HA is blocked without an explicit, tested fencing profile.',
          }
        )
      )
    }

    return fields
  }

  if (id === 'mssql') {
    return (
      draft.edition +
      ' · ' +
      draft.topology +
      (draft.topology !== 'Standalone'
        ? ' · fencing: ' + (draft.mssqlFencingRef || 'required')
        : '')
    )
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
      fields.push(
        text('mongoDbName', 'Application database / credential scope')
      )
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
      ]),
      select('rabbitDurability', 'Default durability profile', [
        'Quorum queues as production default',
        'Application explicitly owns queue type',
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
      ]),
      select('tomcatSessionMode', 'Session handling', [
        'Stateless / externalized application session state',
        'Tomcat replicated session state (qualified application profile)',
      ])
    )
    if (draft.tomcatDeploy === 'Deploy application artifact') {
      fields.push(
        text(
          'tomcatArtifactRef',
          'Immutable application artifact / bundle reference'
        )
      )
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
    if (
      draft.jenkinsAgentSource === 'Existing agent template/image reference'
    ) {
      fields.push(text('jenkinsAgentRef', 'Agent template / image reference'))
    }

    return fields
  }

  if (id === 'forgejo') {
    fields.push(select('forgejoSsh', 'Git-over-SSH', ['Enabled', 'Disabled']))
    if (draft.forgejoSsh === 'Enabled') {
      fields.push(
        number('forgejoSshPort', 'Git SSH port', { min: 1, max: 65535 })
      )
    }

    return fields
  }

  if (id === 'elasticsearch') {
    fields.push(
      select('elasticSecurity', 'Security configuration', [
        'LayerSentry managed security configuration',
        'Existing security configuration secret reference',
      ])
    )
    if (
      draft.elasticSecurity ===
      'Existing security configuration secret reference'
    ) {
      fields.push(
        text('elasticSecurityRef', 'Security configuration reference')
      )
    }
    fields.push({
      key: 'elasticKibana',
      label: 'Install Kibana companion',
      type: 'switch',
      helper:
        'Optional companion only; Elasticsearch cluster lifecycle remains independent.',
    })

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
      fields.push(
        text('openSearchSecurityRef', 'Security config / secret reference')
      )
    }

    return fields
  }

  if (id === 'prometheus') {
    fields.push(
      select('prometheusHistoryMode', 'Metrics history ownership', [
        'Independent local TSDB on each HA replica',
        'Existing remote-write / long-term backend',
      ])
    )
    if (
      draft.prometheusHistoryMode ===
      'Existing remote-write / long-term backend'
    ) {
      fields.push(
        text('prometheusHistoryRef', 'Long-term metrics backend reference')
      )
    }
    fields.push(
      select('promScrapeMode', 'Scrape configuration', [
        'Configure scrape targets later',
        'Existing versioned scrape configuration',
      ])
    )
    if (draft.promScrapeMode === 'Existing versioned scrape configuration') {
      fields.push(
        text('promScrapeRef', 'Scrape config / target bundle reference')
      )
    }
    fields.push(
      select('promAlerting', 'Alerting integration', [
        'Existing Alertmanager cluster',
        'Alerting disabled',
      ])
    )
    if (draft.promAlerting === 'Existing Alertmanager cluster') {
      fields.push(
        text('promAlertRef', 'Alertmanager service / endpoint reference')
      )
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
      fields.push(
        text('grafanaDatasourceRef', 'Datasource config / secret reference')
      )
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
      fields.push(
        text('grafanaAlertRef', 'Redis alerting-HA service reference')
      )
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
    (id === 'mysql-family' || id === 'mariadb' || id === 'mssql') &&
    draft.sqlBootstrap === 'Create initial application database' &&
    !dbNamePattern.test(String(draft.sqlDbName || '').trim())
  ) {
    errors.push(
      'Enter a valid initial application database name, or choose to create it later.'
    )
  }

  if (
    (id === 'mongodb-community' || id === 'percona-mongodb') &&
    draft.mongoScopeMode === 'Create application credential scope' &&
    !simpleNamePattern.test(String(draft.mongoDbName || '').trim())
  ) {
    errors.push(
      'Enter the MongoDB application database / credential scope name.'
    )
  }

  if (
    id === 'mssql' &&
    draft.topology !== 'Standalone' &&
    !nonEmpty(draft.mssqlFencingRef)
  ) {
    errors.push(
      'SQL Server Pacemaker HA requires a qualified fencing / STONITH profile reference.'
    )
  }

  if (
    id === 'ferretdb' &&
    !dbNamePattern.test(String(draft.ferretDbName || '').trim())
  ) {
    errors.push(
      'FerretDB requires a logical application database name for backend bootstrap.'
    )
  }

  if (
    (id === 'redis' || id === 'valkey') &&
    draft.kvPersistence === 'Cache-only (no durability)' &&
    draft.backupEnabled
  ) {
    errors.push(
      'Cache-only persistence conflicts with application backup. Disable backup or choose a durable profile.'
    )
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
    errors.push(
      'Pulsar tenant and namespace names are required when bootstrap is selected.'
    )
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
    errors.push(
      'Tomcat application deployment requires an immutable artifact/bundle reference.'
    )
  }

  if (
    id === 'keycloak' &&
    draft.keycloakAdminMode === 'Separate admin FQDN' &&
    !isValidFqdn(draft.keycloakAdminFqdn)
  ) {
    errors.push(
      'Keycloak separate administration exposure requires a valid admin FQDN.'
    )
  }

  if (
    id === 'superset' &&
    draft.supersetSecretMode === 'Existing SECRET_KEY secret reference' &&
    !nonEmpty(draft.supersetSecretRef)
  ) {
    errors.push(
      'Superset existing SECRET_KEY mode requires a secret reference, not the raw key.'
    )
  }

  if (id === 'airflow') {
    if (!nonEmpty(draft.airflowDagRef)) {
      errors.push('Airflow requires a versioned DAG source / bundle reference.')
    }
    if (
      draft.airflowSecretMode === 'Existing Fernet/signing secret reference' &&
      !nonEmpty(draft.airflowSecretRef)
    ) {
      errors.push(
        'Airflow existing internal-secret mode requires a secret reference, not raw secret material.'
      )
    }
  }

  if (
    id === 'openbao' &&
    draft.baoSealMode === 'Existing KMS/HSM/transit reference' &&
    !nonEmpty(draft.baoSealRef)
  ) {
    errors.push(
      'OpenBao external seal/unseal mode requires a KMS/HSM/transit reference.'
    )
  }

  if (
    id === 'jenkins' &&
    draft.jenkinsAgentSource === 'Existing agent template/image reference' &&
    !nonEmpty(draft.jenkinsAgentRef)
  ) {
    errors.push(
      'Jenkins existing agent source requires a template/image reference.'
    )
  }

  if (
    id === 'forgejo' &&
    draft.forgejoSsh === 'Enabled' &&
    (!Number.isInteger(Number(draft.forgejoSshPort)) ||
      Number(draft.forgejoSshPort) < 1 ||
      Number(draft.forgejoSshPort) > 65535)
  ) {
    errors.push(
      'Forgejo Git-over-SSH requires a valid TCP port between 1 and 65535.'
    )
  }

  if (
    id === 'elasticsearch' &&
    draft.elasticSecurity ===
      'Existing security configuration secret reference' &&
    !nonEmpty(draft.elasticSecurityRef)
  ) {
    errors.push(
      'Elasticsearch existing security configuration requires a secret/config reference.'
    )
  }

  if (
    id === 'opensearch' &&
    draft.openSearchSecurity ===
      'Existing security configuration secret reference' &&
    !nonEmpty(draft.openSearchSecurityRef)
  ) {
    errors.push(
      'OpenSearch existing security configuration requires a secret/config reference.'
    )
  }

  if (id === 'prometheus') {
    if (
      draft.prometheusHistoryMode ===
        'Existing remote-write / long-term backend' &&
      !nonEmpty(draft.prometheusHistoryRef)
    ) {
      errors.push(
        'Prometheus long-term history requires its remote-write / long-term backend reference.'
      )
    }
    if (
      draft.promAlerting === 'Existing Alertmanager cluster' &&
      !nonEmpty(draft.promAlertRef)
    ) {
      errors.push(
        'Existing Alertmanager mode requires an Alertmanager service / endpoint reference.'
      )
    }
    if (
      draft.promScrapeMode === 'Existing versioned scrape configuration' &&
      !nonEmpty(draft.promScrapeRef)
    ) {
      errors.push(
        'Existing scrape-configuration mode requires a versioned configuration / target reference.'
      )
    }
  }

  if (id === 'grafana') {
    if (
      draft.grafanaSession === 'Existing Redis session store' &&
      !nonEmpty(draft.grafanaSessionRef)
    ) {
      errors.push(
        'Grafana existing Redis session mode requires a Redis service reference.'
      )
    }
    if (
      draft.grafanaAlertHa === 'Existing Redis for alerting HA' &&
      !nonEmpty(draft.grafanaAlertRef)
    ) {
      errors.push(
        'Grafana Redis alerting-HA mode requires a Redis service reference.'
      )
    }
    if (
      draft.grafanaDatasourceMode ===
        'Existing datasource configuration reference' &&
      !nonEmpty(draft.grafanaDatasourceRef)
    ) {
      errors.push(
        'Grafana existing datasource mode requires a datasource configuration / secret reference.'
      )
    }
  }

  if (
    id === 'alloy' &&
    draft.alloyConfig === 'Existing configuration bundle reference' &&
    !nonEmpty(draft.alloyConfigRef)
  ) {
    errors.push(
      'Grafana Alloy existing configuration mode requires a versioned configuration bundle reference.'
    )
  }

  if (id === 'postgresql') {
    if (
      draft.databaseBootstrap ===
        'Create initial database(s) during deployment' &&
      !nonEmpty(draft.initialDatabases)
    ) {
      errors.push(
        'Database bootstrap is enabled. Enter at least one initial database name.'
      )
    }
    if (
      draft.postgis &&
      draft.postgisTarget === 'Initial database(s)' &&
      draft.databaseBootstrap !== 'Create initial database(s) during deployment'
    ) {
      errors.push(
        'PostGIS targets initial databases, but initial database creation is disabled.'
      )
    }
    if (
      draft.postgis &&
      draft.postgisTarget === 'Existing/restored database(s)' &&
      !nonEmpty(draft.postgisDatabases)
    ) {
      errors.push(
        'PostGIS is enabled. Enter the existing/restored database name(s).'
      )
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
      errors.push(
        item.role + ': existing storage requires an attachment/reference.'
      )
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

export const getCredentialProfile = (blueprint) => {
  const id = blueprint?.id
  const noBlueprintCredential = new Set([
    'nginx',
    'apache-httpd',
    'tomcat',
    'prometheus',
    'alloy',
  ])
  if (!id || noBlueprintCredential.has(id)) {
    return {
      required: false,
      label: 'No blueprint-managed application credential',
    }
  }
  if (id === 'openbao') {
    return {
      required: true,
      label: 'OpenBao bootstrap material',
      refLabel: 'Bootstrap secret:// reference',
    }
  }

  return {
    required: true,
    label: 'Service authentication',
    refLabel: 'Credential secret:// reference',
  }
}

const validIPv4 = (value) => {
  const parts = String(value || '')
    .trim()
    .split('.')

  return (
    parts.length === 4 &&
    parts.every(
      (part) =>
        /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255
    )
  )
}

const validIPv6 = (value) => {
  const input = String(value || '').trim()

  return (
    input.includes(':') &&
    /^[0-9a-f:]+$/i.test(input) &&
    input.split(':').length >= 3 &&
    input.split(':').length <= 9
  )
}

const networkErrors = (draft, blueprint) => {
  const errors = []
  const networkProfile = getNetworkProfile(draft, blueprint)
  if (!nonEmpty(draft.serviceName)) errors.push('Service name is required.')
  if (networkProfile.singleEndpoint && !isValidFqdn(draft.serviceFqdn))
    errors.push('Enter a valid service FQDN.')
  if (!nonEmpty(draft.domain)) errors.push('DNS domain is required.')

  if (draft.ipMode === 'Static') {
    const addresses = String(draft.staticIps || '')
      .split(/\n|,/)
      .map((value) => value.trim())
      .filter(Boolean)
    const required = getArchitecturePlan(draft, blueprint).addressableNodes
    if (typeof required === 'number' && addresses.length !== required) {
      errors.push(
        'Static addressing requires exactly ' +
          String(required) +
          ' address entries for the service-owned VM footprint. Linked dependency IPs are managed by their linked blueprint.'
      )
    }
    if (
      addresses.some((address) => !validIPv4(address) && !validIPv6(address))
    ) {
      errors.push(
        'One or more static VM addresses are not valid IPv4/IPv6 literals.'
      )
    }
  }

  if (
    networkProfile.singleEndpoint &&
    draft.endpointMode === 'Existing load balancer' &&
    !nonEmpty(draft.externalEndpoint)
  ) {
    errors.push(
      'Existing load-balancer mode requires its VIP / service address reference.'
    )
  }

  if (
    networkProfile.customerTraffic &&
    draft.portPolicy === 'Custom qualified port'
  ) {
    const port = Number(draft.customPort)
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      errors.push('Custom service port must be between 1 and 65535.')
    }
    if (blueprint.id === 'yugabytedb' && draft.ybApi === 'Both YSQL + YCQL') {
      errors.push(
        'YSQL and YCQL use separate listeners; one custom port cannot represent both APIs.'
      )
    }
  }

  return errors
}

const backupErrors = (draft, blueprint) => {
  const errors = []
  const backup = getBackupProfile(blueprint)

  if (backup.mode !== 'direct' && draft.backupEnabled) {
    errors.push(
      'This service does not own a direct application-backup workflow. Recovery is ' +
        (backup.mode === 'dependency'
          ? 'dependency-owned.'
          : 'rebuild/replication-based.')
    )
  }

  if (backup.mode === 'direct' && draft.backupEnabled) {
    if (
      !Number.isInteger(Number(draft.retentionDays)) ||
      Number(draft.retentionDays) < 1
    ) {
      errors.push('Backup retention must be at least one day.')
    }
    if (!nonEmpty(draft.backupRepositoryRef)) {
      errors.push('Backup is enabled. Select or reference a backup repository.')
    }
    if (draft.pitr && !blueprint.supportsPitr) {
      errors.push('PITR is not offered for this service profile.')
    }
  }

  const drProfile = getDrProfile(draft, blueprint)
  if (drProfile.configuredByTopology) {
    if (!nonEmpty(draft.drTarget))
      errors.push('DR requires a target site / profile.')
    if (
      !Number.isFinite(Number(draft.rpoMinutes)) ||
      Number(draft.rpoMinutes) < 0
    ) {
      errors.push('DR RPO must be zero or a positive number of minutes.')
    }
    if (
      !Number.isFinite(Number(draft.rtoMinutes)) ||
      Number(draft.rtoMinutes) < 0
    ) {
      errors.push('DR RTO must be zero or a positive number of minutes.')
    }
  }

  return errors
}

const securityErrors = (draft, blueprint) => {
  const errors = []
  const networkProfile = getNetworkProfile(draft, blueprint)

  if (
    networkProfile.customerTraffic &&
    !validSecretReference(draft.tlsCertificateRef)
  ) {
    errors.push(
      'TLS requires an existing valid secret:// certificate reference.'
    )
  }

  const credential = getCredentialProfile(blueprint)
  if (credential.required && !validSecretReference(draft.credentialRef)) {
    errors.push(
      credential.label + ': enter a valid existing secret:// reference.'
    )
  }

  return errors
}

export const validateStep = (step, draft, blueprint) => {
  if (!blueprint)
    return [{ code: 'SERVICE_REQUIRED', message: 'Select a service.' }]
  let messages = []

  if (step === 0) {
    messages = blueprint ? [] : ['Select a service.']
  } else if (step === 1) {
    if (!nonEmpty(draft.version)) messages.push('Select a version.')
    if (!nonEmpty(draft.topology))
      messages.push('Select a deployment topology.')
    if (blueprint.editions && !nonEmpty(draft.edition))
      messages.push('Select an edition.')
    messages.push(...getProductConfigErrors(draft, blueprint))
    messages.push(...getDependencyErrors(draft, blueprint))
  } else if (step === 2) {
    if (!Number.isInteger(Number(draft.vcpu)) || Number(draft.vcpu) < 1) {
      messages.push('vCPU per primary service node must be at least 1.')
    }
    if (
      !Number.isInteger(Number(draft.memoryGiB)) ||
      Number(draft.memoryGiB) < 1
    ) {
      messages.push('Memory per primary service node must be at least 1 GiB.')
    }
    if (
      !Number.isFinite(Number(draft.expectedDataGiB)) ||
      Number(draft.expectedDataGiB) < 0
    ) {
      messages.push('Expected data size cannot be negative.')
    }
    if (
      !Number.isInteger(Number(draft.expectedConnections)) ||
      Number(draft.expectedConnections) < 0
    ) {
      messages.push('Expected connections cannot be negative.')
    }
  } else if (step === 3) {
    messages.push(...storageErrors(draft))
  } else if (step === 4) {
    messages.push(...networkErrors(draft, blueprint))
  } else if (step === 5) {
    messages.push(...backupErrors(draft, blueprint))
  } else if (step === 6) {
    messages.push(...securityErrors(draft, blueprint))
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

export const STORAGE_ROLE_IDS = Object.freeze({
  Data: 'data',
  WAL: 'wal',
  'Redo / binary log': 'redo_binlog',
  'SQL Server data': 'data',
  'SQL Server log': 'log',
  'SQL Server tempdb': 'tempdb',
  Journal: 'journal',
  'Persistence data (RDB/AOF)': 'persistence_data',
  'ClickHouse data': 'data',
  'ClickHouse Keeper data': 'keeper_data',
  'Commit log': 'commit_log',
  'Tablet data': 'tablet_data',
  'YB-Master metadata': 'master_metadata',
  'Persistent message data': 'message_data',
  'Broker log / data': 'broker_data',
  'Kafka controller metadata': 'controller_metadata',
  'BookKeeper journal': 'bookkeeper_journal',
  'BookKeeper ledgers': 'bookkeeper_ledger',
  'Pulsar metadata state': 'metadata_state',
  'Configuration metadata state': 'configuration_metadata',
  'Raft integrated-storage data': 'raft_data',
  JENKINS_HOME: 'jenkins_home',
  'Elasticsearch data': 'data',
  'Elasticsearch logs': 'logs',
  'Elasticsearch master state': 'master_state',
  'Index data': 'index_data',
  'OpenSearch manager state': 'manager_state',
  'Local TSDB': 'tsdb',
})

const PLATFORM_STORAGE_LAYOUTS = {
  'Single disk': 'single',
  LVM: 'lvm',
  'Striped managed disks': 'stripe',
  'Existing SAN / LUN': 'existing_san_lun',
  'Existing mount': 'existing_mount',
  'Repository-managed': 'repository',
}

const platformNodeSlug = (value, fallback = 'service') => {
  const normalized = String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)

  return normalized || fallback
}

const platformNodeAddresses = (draft) =>
  String(draft.staticIps || '')
    .split(/\n|,/)
    .map((value) => value.trim())
    .filter(Boolean)

const repeatPlatformRole = (role, count) =>
  Array.from({ length: Math.max(0, Number(count) || 0) }, () => role)

export const getPlatformNodeRoles = (
  draft,
  blueprint,
  architecture = getArchitecturePlan(draft, blueprint)
) => {
  const topology = String(draft?.topology || '')
  const count = Number(architecture?.dedicated || 0)
  const id = blueprint?.id

  if (id === 'postgresql' && topology === 'HA + DR') {
    return [
      ...repeatPlatformRole('postgresql_primary', 3),
      ...repeatPlatformRole('postgresql_dr', 3),
    ]
  }

  if (
    id === 'mysql-family' &&
    (/DR/i.test(topology) || /ClusterSet/i.test(topology))
  ) {
    return [
      ...repeatPlatformRole('mysql_primary', 3),
      ...repeatPlatformRole('mysql_dr', 3),
    ]
  }

  if (id === 'mssql') {
    if (topology === 'Basic AG (2 SQL replicas + config-only quorum)') {
      return [
        'mssql_primary_candidate',
        'mssql_secondary_candidate',
        'mssql_config_only',
      ]
    }
    if (topology === '3-replica Availability Group') {
      return repeatPlatformRole('mssql_replica', 3)
    }
  }

  if (id === 'mariadb' && /DR/i.test(topology)) {
    return [
      ...repeatPlatformRole('mariadb_primary', 3),
      ...repeatPlatformRole('mariadb_dr', 3),
    ]
  }

  if (
    (id === 'mongodb-community' || id === 'percona-mongodb') &&
    topology.startsWith('Sharded:')
  ) {
    const shards = topology.includes('3 shards') ? 3 : 2
    const roles = []
    for (let shard = 1; shard <= shards; shard += 1) {
      roles.push(...repeatPlatformRole('mongodb_shard_' + shard, 3))
    }
    roles.push(...repeatPlatformRole('mongodb_config', 3))
    roles.push(...repeatPlatformRole('mongos', 2))

    return roles
  }

  if (id === 'clickhouse' && topology !== 'Standalone') {
    return [
      ...repeatPlatformRole('clickhouse_data', count - 3),
      ...repeatPlatformRole('clickhouse_keeper', 3),
    ]
  }

  if (id === 'cassandra' && topology.startsWith('Multi-DC')) {
    return [
      ...repeatPlatformRole('cassandra_dc1', 3),
      ...repeatPlatformRole('cassandra_dc2', 3),
    ]
  }

  if (id === 'yugabytedb') {
    if (topology.startsWith('xCluster DR')) {
      return [
        ...repeatPlatformRole('yugabyte_primary_tserver', 3),
        ...repeatPlatformRole('yugabyte_primary_master', 3),
        ...repeatPlatformRole('yugabyte_dr_tserver', 3),
        ...repeatPlatformRole('yugabyte_dr_master', 3),
      ]
    }

    return [
      ...repeatPlatformRole('yugabyte_tserver', count - 3),
      ...repeatPlatformRole('yugabyte_master', 3),
    ]
  }

  if (id === 'rabbitmq' && topology.startsWith('Federation DR')) {
    return [
      ...repeatPlatformRole('rabbitmq_primary', 3),
      ...repeatPlatformRole('rabbitmq_dr', 3),
    ]
  }

  if (id === 'kafka') {
    const brokers = topology.startsWith('5 brokers') ? 5 : 3

    return [
      ...repeatPlatformRole('kafka_broker', brokers),
      ...repeatPlatformRole('kafka_controller', count - brokers),
    ]
  }

  if (id === 'pulsar') {
    if (topology.startsWith('Multi-cluster DR')) {
      return [
        ...repeatPlatformRole('pulsar_primary_broker_bookie', 3),
        ...repeatPlatformRole('pulsar_primary_metadata', 3),
        ...repeatPlatformRole('pulsar_dr_broker_bookie', 3),
        ...repeatPlatformRole('pulsar_dr_metadata', 3),
        ...repeatPlatformRole('pulsar_config_store', Math.max(0, count - 12)),
      ]
    }

    return [
      ...repeatPlatformRole('pulsar_broker_bookie', 3),
      ...repeatPlatformRole('pulsar_metadata', count - 3),
    ]
  }

  if (id === 'superset' && topology === 'Distributed') {
    return [
      ...repeatPlatformRole('superset_web', 2),
      ...repeatPlatformRole('superset_worker', 2),
    ]
  }

  if (id === 'airflow' && topology === 'Distributed Celery') {
    return [
      ...repeatPlatformRole('airflow_control', 2),
      ...repeatPlatformRole('airflow_worker', 2),
    ]
  }

  if (id === 'jenkins') {
    return [
      'jenkins_controller',
      ...repeatPlatformRole('jenkins_agent', count - 1),
    ]
  }

  if (id === 'elasticsearch') {
    if (topology === '3-node Production Cluster') {
      return repeatPlatformRole('elasticsearch_combined', 3)
    }

    return [
      ...repeatPlatformRole('elasticsearch_master', 3),
      ...repeatPlatformRole('elasticsearch_data', count - 3),
    ]
  }

  if (id === 'opensearch') {
    return [
      ...repeatPlatformRole('opensearch_manager', 3),
      ...repeatPlatformRole('opensearch_data', count - 3),
    ]
  }

  return []
}

const storageNodeRolesFor = (blueprint, storageRole, nodeRoles) => {
  if (!nodeRoles.length) return []
  const id = blueprint?.id

  if (id === 'mssql') {
    if (
      storageRole === 'data' ||
      storageRole === 'log' ||
      storageRole === 'tempdb'
    ) {
      return [
        ...new Set(nodeRoles.filter((role) => role !== 'mssql_config_only')),
      ]
    }
  }

  if (id === 'elasticsearch') {
    if (storageRole === 'data') {
      return [
        ...new Set(
          nodeRoles.filter(
            (role) => role === 'elasticsearch_data' || role === 'elasticsearch_combined'
          )
        ),
      ]
    }
    if (storageRole === 'logs') return [...new Set(nodeRoles)]
    if (storageRole === 'master_state') {
      return [
        ...new Set(
          nodeRoles.filter(
            (role) =>
              role === 'elasticsearch_master' ||
              role === 'elasticsearch_combined'
          )
        ),
      ]
    }
  }

  if (id === 'mongodb-community' || id === 'percona-mongodb') {
    if (storageRole === 'data' || storageRole === 'journal') {
      return [...new Set(nodeRoles.filter((role) => role !== 'mongos'))]
    }
  }

  if (id === 'clickhouse') {
    if (storageRole === 'data') return ['clickhouse_data']
    if (storageRole === 'keeper_data') return ['clickhouse_keeper']
  }

  if (id === 'yugabytedb') {
    if (storageRole === 'tablet_data' || storageRole === 'wal') {
      return [...new Set(nodeRoles.filter((role) => role.includes('tserver')))]
    }
    if (storageRole === 'master_metadata') {
      return [...new Set(nodeRoles.filter((role) => role.includes('master')))]
    }
  }

  if (id === 'kafka') {
    if (storageRole === 'broker_data') return ['kafka_broker']
    if (storageRole === 'controller_metadata') return ['kafka_controller']
  }

  if (id === 'pulsar') {
    if (
      storageRole === 'bookkeeper_journal' ||
      storageRole === 'bookkeeper_ledger'
    ) {
      return [
        ...new Set(nodeRoles.filter((role) => role.includes('broker_bookie'))),
      ]
    }
    if (storageRole === 'metadata_state') {
      return [...new Set(nodeRoles.filter((role) => role.includes('metadata')))]
    }
    if (storageRole === 'configuration_metadata') {
      return ['pulsar_config_store']
    }
  }

  if (id === 'jenkins' && storageRole === 'jenkins_home') {
    return ['jenkins_controller']
  }

  if (id === 'opensearch') {
    if (storageRole === 'index_data') return ['opensearch_data']
    if (storageRole === 'manager_state') return ['opensearch_manager']
  }

  return []
}

export const NATIVE_PRODUCT_OPTION_BINDINGS = Object.freeze({
  postgresql: {
    databaseBootstrap: 'database_bootstrap',
    initialDatabases: 'initial_databases',
    pgbouncerPlacement: 'pgbouncer_placement',
    pgStatStatements: 'pg_stat_statements',
    postgis: 'postgis',
    postgisTarget: 'postgis_target',
    postgisDatabases: 'postgis_databases',
  },
  'mysql-family': {
    sqlBootstrap: 'database_bootstrap',
    sqlDbName: 'database_name',
  },
  mariadb: {
    sqlBootstrap: 'database_bootstrap',
    sqlDbName: 'database_name',
  },
  mssql: {
    sqlBootstrap: 'database_bootstrap',
    sqlDbName: 'database_name',
    mssqlFencingRef: 'fencing_profile_ref',
  },
  'mongodb-community': {
    mongoScopeMode: 'credential_scope_mode',
    mongoDbName: 'database_name',
  },
  'percona-mongodb': {
    mongoScopeMode: 'credential_scope_mode',
    mongoDbName: 'database_name',
  },
  ferretdb: { ferretDbName: 'database_name' },
  redis: { kvPersistence: 'persistence_policy' },
  valkey: { kvPersistence: 'persistence_policy' },
  clickhouse: {
    clickBootstrap: 'database_bootstrap',
    clickDbName: 'database_name',
  },
  cassandra: {
    cassBootstrap: 'keyspace_bootstrap',
    cassKeyspace: 'keyspace',
  },
  yugabytedb: {
    ybApi: 'api',
    ybBootstrap: 'namespace_bootstrap',
    ybDbName: 'database_or_namespace',
  },
  rabbitmq: {
    rabbitVhostMode: 'vhost_mode',
    rabbitVhost: 'vhost',
    rabbitDurability: 'durability_profile',
  },
  kafka: {
    kafkaTopicMode: 'topic_bootstrap',
    kafkaTopic: 'topic',
    kafkaDurability: 'durability_profile',
  },
  pulsar: {
    pulsarMetadata: 'metadata_store',
    pulsarNamespaceMode: 'namespace_bootstrap',
    pulsarTenant: 'tenant',
    pulsarNamespace: 'namespace',
    pulsarConfigStore: 'configuration_store',
  },
  nginx: { webMode: 'service_role', webSourceRef: 'source_ref' },
  'apache-httpd': { webMode: 'service_role', webSourceRef: 'source_ref' },
  tomcat: {
    tomcatDeploy: 'deployment_mode',
    tomcatArtifactRef: 'artifact_ref',
    tomcatSessionMode: 'session_mode',
  },
  keycloak: {
    keycloakAdminMode: 'admin_exposure',
    keycloakAdminFqdn: 'admin_fqdn',
  },
  superset: {
    supersetSecretMode: 'secret_mode',
    supersetSecretRef: 'secret_ref',
  },
  airflow: {
    airflowDagRef: 'dag_ref',
    airflowSecretMode: 'secret_mode',
    airflowSecretRef: 'secret_ref',
  },
  openbao: { baoSealMode: 'seal_mode', baoSealRef: 'seal_ref' },
  jenkins: {
    jenkinsAgentSource: 'agent_source',
    jenkinsAgentRef: 'agent_ref',
  },
  forgejo: { forgejoSsh: 'git_ssh', forgejoSshPort: 'git_ssh_port' },
  elasticsearch: {
    elasticSecurity: 'security_config_mode',
    elasticSecurityRef: 'security_config_ref',
    elasticKibana: 'kibana_enabled',
  },
  opensearch: {
    openSearchSecurity: 'security_config_mode',
    openSearchSecurityRef: 'security_config_ref',
  },
  prometheus: {
    prometheusHistoryMode: 'history_mode',
    prometheusHistoryRef: 'history_ref',
    promScrapeMode: 'scrape_mode',
    promScrapeRef: 'scrape_ref',
    promAlerting: 'alerting_mode',
    promAlertRef: 'alertmanager_ref',
  },
  grafana: {
    grafanaDatasourceMode: 'datasource_mode',
    grafanaDatasourceRef: 'datasource_ref',
    grafanaSession: 'session_mode',
    grafanaSessionRef: 'session_ref',
    grafanaAlertHa: 'alerting_ha_mode',
    grafanaAlertRef: 'alerting_ha_ref',
  },
  alloy: { alloyConfig: 'config_mode', alloyConfigRef: 'config_ref' },
})

export const NATIVE_PRODUCT_DERIVED_OPTION_KEYS = Object.freeze({
  postgresql: ['pgbouncer'],
  mssql: ['listener_name'],
})

const isNativeProductOptionActive = (draft, blueprintId, draftKey) => {
  const rules = {
    postgresql: {
      initialDatabases:
        draft.databaseBootstrap ===
        'Create initial database(s) during deployment',
      postgisTarget: draft.postgis === true,
      postgisDatabases:
        draft.postgis === true &&
        draft.postgisTarget === 'Existing/restored database(s)',
    },
    'mysql-family': {
      sqlDbName: draft.sqlBootstrap === 'Create initial application database',
    },
    mariadb: {
      sqlDbName: draft.sqlBootstrap === 'Create initial application database',
    },
    mssql: {
      sqlDbName: draft.sqlBootstrap === 'Create initial application database',
      mssqlFencingRef: draft.topology !== 'Standalone',
    },
    'mongodb-community': {
      mongoDbName:
        draft.mongoScopeMode === 'Create application credential scope',
    },
    'percona-mongodb': {
      mongoDbName:
        draft.mongoScopeMode === 'Create application credential scope',
    },
    clickhouse: {
      clickDbName: draft.clickBootstrap === 'Create initial database',
    },
    cassandra: {
      cassKeyspace: draft.cassBootstrap === 'Create initial keyspace',
    },
    yugabytedb: {
      ybDbName: draft.ybBootstrap === 'Create initial database / namespace',
    },
    rabbitmq: {
      rabbitVhost: draft.rabbitVhostMode === 'Create application virtual host',
    },
    kafka: { kafkaTopic: draft.kafkaTopicMode === 'Create bootstrap topic' },
    pulsar: {
      pulsarTenant: draft.pulsarNamespaceMode === 'Create tenant + namespace',
      pulsarNamespace:
        draft.pulsarNamespaceMode === 'Create tenant + namespace',
      pulsarConfigStore: String(draft.topology || '').startsWith(
        'Multi-cluster DR'
      ),
    },
    nginx: { webSourceRef: draft.webMode !== 'Runtime only / configure later' },
    'apache-httpd': {
      webSourceRef: draft.webMode !== 'Runtime only / configure later',
    },
    tomcat: {
      tomcatArtifactRef: draft.tomcatDeploy === 'Deploy application artifact',
    },
    keycloak: {
      keycloakAdminFqdn: draft.keycloakAdminMode === 'Separate admin FQDN',
    },
    superset: {
      supersetSecretRef:
        draft.supersetSecretMode === 'Existing SECRET_KEY secret reference',
    },
    airflow: {
      airflowSecretRef:
        draft.airflowSecretMode === 'Existing Fernet/signing secret reference',
    },
    openbao: {
      baoSealRef: draft.baoSealMode === 'Existing KMS/HSM/transit reference',
    },
    jenkins: {
      jenkinsAgentRef:
        draft.jenkinsAgentSource === 'Existing agent template/image reference',
    },
    forgejo: { forgejoSshPort: draft.forgejoSsh === 'Enabled' },
    elasticsearch: {
      elasticSecurityRef:
        draft.elasticSecurity ===
        'Existing security configuration secret reference',
    },
    opensearch: {
      openSearchSecurityRef:
        draft.openSearchSecurity ===
        'Existing security configuration secret reference',
    },
    prometheus: {
      prometheusHistoryRef:
        draft.prometheusHistoryMode ===
        'Existing remote-write / long-term backend',
      promScrapeRef:
        draft.promScrapeMode === 'Existing versioned scrape configuration',
      promAlertRef: draft.promAlerting === 'Existing Alertmanager cluster',
    },
    grafana: {
      grafanaDatasourceRef:
        draft.grafanaDatasourceMode ===
        'Existing datasource configuration reference',
      grafanaSessionRef:
        draft.grafanaSession === 'Existing Redis session store',
      grafanaAlertRef:
        draft.grafanaAlertHa === 'Existing Redis for alerting HA',
    },
    alloy: {
      alloyConfigRef:
        draft.alloyConfig === 'Existing configuration bundle reference',
    },
  }
  const appRules = rules[blueprintId] || {}

  return Object.prototype.hasOwnProperty.call(appRules, draftKey)
    ? Boolean(appRules[draftKey])
    : true
}

const platformProductOptions = (draft, blueprint) => {
  if (!blueprint) return {}
  const bindings = NATIVE_PRODUCT_OPTION_BINDINGS[blueprint.id] || {}

  const result = Object.entries(bindings).reduce(
    (options, [draftKey, backendKey]) => {
      if (!isNativeProductOptionActive(draft, blueprint.id, draftKey))
        return options
      const value = draft[draftKey]
      if (value === undefined || value === null || value === '') return options
      options[backendKey] = value

      return options
    },
    {}
  )

  if (blueprint.id === 'postgresql') {
    result.pgbouncer = draft.pgbouncerPlacement !== 'Disabled'
  }
  if (blueprint.id === 'mssql' && draft.topology !== 'Standalone') {
    result.listener_name = draft.serviceFqdn
  }

  return result
}

/**
 * Compile the customer wizard state into the durable VM-service API schema.
 *
 * This contains desired intent only. Exact OS/image/package locks and observed
 * failure-domain placement remain backend-owned and are never customer inputs.
 *
 * @param {object} draft - customer wizard draft
 * @param {object} blueprint - selected service blueprint
 * @returns {object} backend desired-state document
 */
const platformDependencies = (draft, blueprint) =>
  getDependencySpecs(draft, blueprint).map((dependency) => ({
    key: dependency.key,
    kind: dependency.kind,
    reference: String(draft.dependencyRefs?.[dependency.key] || '').trim(),
  }))

export const compilePlatformDesiredState = (draft, blueprint) => {
  const architecture = getArchitecturePlan(draft, blueprint)
  const nodeCount =
    Number.isInteger(Number(architecture.dedicated)) &&
    Number(architecture.dedicated) > 0
      ? Number(architecture.dedicated)
      : 1
  const nodeRoles = getPlatformNodeRoles(draft, blueprint, architecture)
  const addresses = platformNodeAddresses(draft)
  const nodeBase = platformNodeSlug(draft.serviceName, blueprint?.id)
  const domain = String(draft.domain || '').trim()
  const staticMode = draft.ipMode === 'Static'
  const storage = (draft.storage || [])
    .filter((item) => !item.dependency)
    .map((item) => {
      const layout = PLATFORM_STORAGE_LAYOUTS[item.layout] || 'unsupported'
      const sizeGiB = Number(item.sizeGiB)
      const disks =
        ['single', 'lvm'].includes(layout) &&
        Number.isFinite(sizeGiB) &&
        sizeGiB > 0
          ? [{ size_gib: sizeGiB }]
          : []

      const role =
        STORAGE_ROLE_IDS[item.role] ||
        String(item.role || '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '')

      return {
        role,
        layout,
        mountpoint: item.mountpoint || '',
        storage_class: item.storagePool || '',
        reference: item.attachmentRef || '',
        disks,
        node_roles: storageNodeRolesFor(blueprint, role, nodeRoles),
      }
    })
  const networkProfile = getNetworkProfile(draft, blueprint)
  const endpointMode = networkProfile.mode
  const packageSource = 'managed_online'
  const backup = getBackupProfile(blueprint)
  const drProfile = getDrProfile(draft, blueprint)
  const hardening = 'standard-production'
  const sshAuth = 'ssh_key_managed'

  return {
    blueprint_id: draft.blueprintId,
    edition: draft.edition || '',
    version: draft.version,
    deployment: {
      topology: draft.topology,
      node_count: nodeCount,
      workload: String(draft.workload || 'general').toLowerCase(),
      environment: 'production',
    },
    capacity: {
      vcpu: Number(draft.vcpu),
      memory_gib: Number(draft.memoryGiB),
      expected_data_gib: Number(draft.expectedDataGiB) || 0,
      annual_growth_percent: Number(draft.expectedGrowthPercent) || 0,
      expected_connections: Number(draft.expectedConnections) || 0,
    },
    dependencies: platformDependencies(draft, blueprint),
    storage,
    network: {
      domain,
      nodes: Array.from({ length: nodeCount }, (_, index) => ({
        fqdn:
          nodeBase + '-' + String(index + 1).padStart(2, '0') + '.' + domain,
        ip_mode: staticMode ? 'static' : 'auto',
        ip: staticMode ? addresses[index] || '' : '',
        role: nodeRoles[index] || '',
      })),
      endpoint: {
        mode: endpointMode,
        fqdn: networkProfile.singleEndpoint ? draft.serviceFqdn : '',
        vip:
          networkProfile.singleEndpoint &&
          draft.endpointMode === 'Existing load balancer'
            ? draft.externalEndpoint || ''
            : '',
        backend_port: networkProfile.customerTraffic
          ? draft.portPolicy === 'Custom qualified port'
            ? Number(draft.customPort)
            : Number(blueprint?.defaultPort) || 0
          : 0,
      },
      dns: {},
    },
    backup: {
      enabled: draft.backupEnabled === true,
      engine: backup.engine || '',
      repository: draft.backupRepositoryRef || '',
      retention_days: Number(draft.retentionDays) || 0,
      pitr: draft.pitr === true,
      pitr_window_hours: Number(draft.pitrWindowHours) || 0,
    },
    dr: {
      enabled: drProfile.configuredByTopology === true,
      target_site: drProfile.configuredByTopology ? draft.drTarget || '' : '',
      rpo_minutes: drProfile.configuredByTopology
        ? Number(draft.rpoMinutes) || 0
        : 0,
      rto_minutes: drProfile.configuredByTopology
        ? Number(draft.rtoMinutes) || 0
        : 0,
      replication_mode: drProfile.configuredByTopology
        ? 'product_specific'
        : '',
    },
    security: {
      hardening_profile: hardening,
      tls: networkProfile.customerTraffic,
      certificate_secret_ref: networkProfile.customerTraffic
        ? draft.tlsCertificateRef || ''
        : '',
      ssh_auth: sshAuth,
      credential_secret_ref: getCredentialProfile(blueprint).required
        ? draft.credentialRef || ''
        : '',
    },
    package_source: {
      mode: packageSource,
      repo_url: draft.repoUrl || '',
      bundle_id: draft.bundleId || '',
      proxy_url:
        draft.internetAccess === 'HTTP(S) Proxy' ? draft.proxyUrl || '' : '',
      no_proxy: String(draft.proxyNoProxy || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
      allow_public_fallback: false,
    },
    product_options: platformProductOptions(draft, blueprint),
  }
}

const ALL_NATIVE_PRODUCT_DRAFT_KEYS = new Set(
  Object.values(NATIVE_PRODUCT_OPTION_BINDINGS).flatMap((bindings) =>
    Object.keys(bindings)
  )
)

export const sanitizeDesign = (
  draft,
  blueprint = getBlueprintById(draft?.blueprintId)
) => {
  const {
    proxyPassword: _discardedProxyPassword,
    proxyUsername: _discardedProxyUsername,
    proxyAuthSecretRef: _discardedProxyAuthRef,
    proxyUrl: _discardedProxyUrl,
    proxyNoProxy: _discardedNoProxy,
    repoUrl: _discardedRepoUrl,
    bundleId: _discardedBundleId,
    internetAccess: _discardedInternetAccess,
    ...safe
  } = draft
  const allowedNativeKeys = new Set(
    Object.keys(NATIVE_PRODUCT_OPTION_BINDINGS[blueprint?.id] || {})
  )
  const activeDependencyKeys = new Set(
    getDependencySpecs(draft, blueprint).map(({ key }) => key)
  )
  const filtered = Object.entries(safe).reduce((result, [key, value]) => {
    if (ALL_NATIVE_PRODUCT_DRAFT_KEYS.has(key) && !allowedNativeKeys.has(key)) {
      return result
    }
    if (key === 'dependencyModes') {
      result[key] = Object.fromEntries(
        Object.entries(value || {}).filter(([dependencyKey]) =>
          activeDependencyKeys.has(dependencyKey)
        )
      )

      return result
    }
    if (key === 'dependencyRefs') {
      result[key] = Object.fromEntries(
        Object.entries(value || {}).filter(([dependencyKey]) =>
          activeDependencyKeys.has(dependencyKey)
        )
      )

      return result
    }
    result[key] = value

    return result
  }, {})

  return filtered
}

export const getProductSummary = (draft, blueprint) => {
  if (!blueprint) return 'No service selected'
  const id = blueprint.id

  if (id === 'postgresql') {
    return (
      'Initial DB: ' +
      (draft.databaseBootstrap ===
      'Create initial database(s) during deployment'
        ? draft.initialDatabases
        : 'create later')
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
    return (
      'Logical DB ' +
      draft.ferretDbName +
      '; linked PostgreSQL/DocumentDB backend'
    )
  }
  if (id === 'redis' || id === 'valkey')
    return 'Persistence: ' + draft.kvPersistence
  if (id === 'clickhouse') {
    return (
      draft.clickBootstrap +
      (draft.clickBootstrap === 'Create initial database'
        ? ' · ' + draft.clickDbName
        : '')
    )
  }
  if (id === 'cassandra') {
    return (
      draft.cassBootstrap +
      (draft.cassBootstrap === 'Create initial keyspace'
        ? ' · ' + draft.cassKeyspace
        : '')
    )
  }
  if (id === 'yugabytedb') {
    return (
      draft.ybApi +
      '; ' +
      draft.ybBootstrap +
      (draft.ybBootstrap === 'Create initial database / namespace'
        ? ' · ' + draft.ybDbName
        : '')
    )
  }
  if (id === 'rabbitmq') {
    return (
      draft.rabbitVhostMode +
      (draft.rabbitVhostMode === 'Create application virtual host'
        ? ' · ' + draft.rabbitVhost
        : '') +
      '; ' +
      draft.rabbitDurability
    )
  }
  if (id === 'kafka') {
    return (
      draft.kafkaTopicMode +
      (draft.kafkaTopic ? ' · ' + draft.kafkaTopic : '') +
      '; ' +
      draft.kafkaDurability
    )
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
    return (
      draft.webMode + (draft.webSourceRef ? ' · ' + draft.webSourceRef : '')
    )
  }
  if (id === 'tomcat') {
    return (
      draft.tomcatDeploy +
      (draft.tomcatArtifactRef ? ' · ' + draft.tomcatArtifactRef : '') +
      '; sessions: ' +
      draft.tomcatSessionMode
    )
  }
  if (id === 'keycloak') {
    return (
      draft.keycloakAdminMode +
      (draft.keycloakAdminFqdn ? ' · ' + draft.keycloakAdminFqdn : '')
    )
  }
  if (id === 'superset') {
    return (
      draft.supersetSecretMode +
      (draft.supersetSecretRef ? ' · secret ref configured' : '')
    )
  }
  if (id === 'airflow') {
    return (
      'DAG source: ' +
      (draft.airflowDagRef || 'required') +
      '; ' +
      draft.airflowSecretMode
    )
  }
  if (id === 'openbao') {
    return (
      draft.baoSealMode + (draft.baoSealRef ? ' · trust ref configured' : '')
    )
  }
  if (id === 'jenkins') {
    return (
      draft.jenkinsAgentSource +
      (draft.jenkinsAgentRef ? ' · template ref configured' : '')
    )
  }
  if (id === 'forgejo') {
    return (
      'Git HTTPS enabled; SSH ' +
      draft.forgejoSsh +
      (draft.forgejoSsh === 'Enabled' ? ' on ' + draft.forgejoSshPort : '')
    )
  }
  if (id === 'elasticsearch') {
    return (
      draft.elasticSecurity +
      (draft.elasticSecurityRef ? ' · reference configured' : '') +
      (draft.elasticKibana ? ' · Kibana enabled' : '')
    )
  }
  if (id === 'opensearch') {
    return (
      draft.openSearchSecurity +
      (draft.openSearchSecurityRef ? ' · reference configured' : '')
    )
  }
  if (id === 'prometheus') {
    return (
      'History: ' +
      draft.prometheusHistoryMode +
      '; scrapes: ' +
      draft.promScrapeMode +
      '; alerting: ' +
      draft.promAlerting
    )
  }
  if (id === 'grafana') {
    return (
      'Datasources: ' +
      draft.grafanaDatasourceMode +
      '; sessions: ' +
      draft.grafanaSession +
      '; alerting HA: ' +
      draft.grafanaAlertHa
    )
  }
  if (id === 'alloy') return draft.alloyConfig

  return 'Qualified product defaults'
}

export const createDraft = (
  blueprintId = 'postgresql',
  catalog = FALLBACK_BLUEPRINTS
) => {
  const blueprint =
    getBlueprintById(blueprintId, catalog) ||
    catalog[0] ||
    FALLBACK_BLUEPRINTS[0]
  const draft = {
    ...COMMON_DEFAULTS,
    ...PRODUCT_DEFAULTS,
    blueprintId: blueprint.id,
    edition: blueprint.editions ? blueprint.editions[0] : '',
    version: blueprint.versions[0] || '',
    workload: blueprint.workloads[0] || 'General',
  }
  const capacity = getCapacityProfile(blueprint)
  const [
    vcpu,
    memoryGiB,
    expectedDataGiB,
    expectedConnections,
    expectedGrowthPercent,
  ] = capacity.defaults
  Object.assign(draft, {
    vcpu,
    memoryGiB,
    expectedDataGiB,
    expectedConnections,
    expectedGrowthPercent,
  })
  draft.topology = getRecommendedTopology(draft, blueprint)
  draft.endpointMode = getEndpointOptions(draft, blueprint)[0] || ''
  draft.serviceName = blueprint.id + '-prod'
  const backup = getBackupProfile(blueprint)
  draft.backupEnabled = Boolean(backup.default)
  draft.pitr = backup.mode === 'direct' && Boolean(blueprint.supportsPitr)
  if (blueprint.id === 'redis' || blueprint.id === 'valkey') {
    draft.pitr = false
  }
  draft.storage = getStorageTemplate(draft, blueprint)
  Object.assign(draft, getDefaultDependencyState(draft, blueprint))

  return draft
}
