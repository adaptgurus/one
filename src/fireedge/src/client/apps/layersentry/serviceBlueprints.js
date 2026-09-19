/* ------------------------------------------------------------------------- *
 * LayerSentry VM service blueprint presentation model.
 *
 * The backend catalog/preflight API is authoritative. This fallback catalog
 * is deliberately fail-closed: entries are discoverable for engineering
 * review but cannot be deployed until the backend promotes an exact tuple.
 * ------------------------------------------------------------------------- */

export const SERVICE_BLUEPRINT_API = '/api/v1/service-blueprints'
export const SERVICE_BLUEPRINT_PREFLIGHT_API =
  '/api/v1/service-blueprints/preflight'

export const WIZARD_STEPS = [
  'Service',
  'Deployment & Version',
  'Capacity & Workload',
  'Storage',
  'Network & DNS',
  'HA & Load Balancer',
  'Backup & Retention',
  'DR / RPO / RTO',
  'Security & Access',
  'Observability',
  'Package Source / Offline',
  'Review & Validate',
]

const storage = (role, mountpoint, sizeGiB, extra = {}) => ({
  role,
  layout: 'single',
  mountpoint,
  storageClass: '',
  filesystem: 'xfs',
  diskSizes: [sizeGiB],
  ...extra,
})

const bp = (id, category, name, os, versions, topologies, extra = {}) => ({
  id,
  category,
  name,
  preferredOs: os,
  versions,
  topologies,
  qualification: 'NOT_TESTED',
  productionSelectable: false,
  ...extra,
})

const edition = (id, label, versions, topologies, extra = {}) => ({
  id,
  label,
  versions,
  topologies,
  ...extra,
})

const mysqlEditions = [
  edition(
    'mysql-community',
    'MySQL Community',
    ['8.4 LTS', '9.7 LTS'],
    [
      'Standalone',
      '3-node InnoDB Cluster',
      '5-node InnoDB Cluster',
      'ClusterSet DR',
    ]
  ),
  edition(
    'percona-server',
    'Percona Server for MySQL',
    ['8.4 LTS', '9.7 LTS'],
    ['Standalone', 'Replication'],
    {
      warningByVersion: {
        '9.7 LTS':
          'Backup-dependent production promotion is blocked until Percona XtraBackup 9.7 reaches GA.',
      },
    }
  ),
  edition(
    'percona-xtradb-cluster',
    'Percona XtraDB Cluster',
    ['8.4 LTS', '9.7 LTS'],
    ['3-node PXC', '5-node PXC'],
    {
      warningByVersion: {
        '9.7 LTS':
          'Backup-dependent production promotion is blocked until Percona XtraBackup 9.7 reaches GA.',
      },
    }
  ),
]

export const FALLBACK_BLUEPRINTS = [
  bp(
    'postgresql',
    'Databases & Data',
    'PostgreSQL',
    'Rocky Linux 9',
    ['16', '17', '18'],
    ['Standalone', '3-node HA', '5-node HA', 'HA + DR'],
    {
      workloads: ['OLTP', 'OLAP', 'Mixed'],
      storageDefaults: [
        storage('Data', '/pgdata', 500),
        storage('WAL', '/pgwal', 100),
        storage('Backup', '/pgbackup', 500),
      ],
      extensions: ['pg_stat_statements', 'PostGIS 3.6.4'],
      components: ['Patroni', 'etcd', 'PgBouncer', 'Barman'],
      backupEngines: ['Barman'],
    }
  ),
  bp(
    'mysql-family',
    'Databases & Data',
    'MySQL Family',
    'Rocky Linux 9',
    ['8.4 LTS', '9.7 LTS'],
    ['Standalone'],
    {
      editions: mysqlEditions,
      workloads: ['OLTP', 'OLAP', 'Mixed'],
      storageDefaults: [
        storage('Data', '/mysql/data', 500),
        storage('Redo / Binlog', '/mysql/log', 150),
        storage('Backup', '/mysql/backup', 500),
      ],
      backupEngines: ['XtraBackup / native binlog PITR'],
    }
  ),
  bp(
    'mariadb',
    'Databases & Data',
    'MariaDB Community',
    'Rocky Linux 9',
    ['11.4 LTS', '11.8 LTS'],
    ['Standalone', '3-node Galera', '5-node Galera', 'Async DR'],
    {
      workloads: ['OLTP', 'OLAP', 'Mixed'],
      storageDefaults: [
        storage('Data', '/mariadb/data', 500),
        storage('Binlog', '/mariadb/binlog', 150),
        storage('Backup', '/mariadb/backup', 500),
      ],
    }
  ),
  bp(
    'mongodb-community',
    'Databases & Data',
    'MongoDB Community',
    'Rocky Linux 9',
    ['7.0', '8.0'],
    ['3-node Replica Set', '5-node Replica Set', 'Sharded'],
    {
      storageDefaults: [
        storage('Data', '/mongodb/data', 500),
        storage('Journal', '/mongodb/journal', 100),
        storage('Backup', '/mongodb/backup', 500),
      ],
      backupEngines: ['PBM Logical + PITR'],
    }
  ),
  bp(
    'percona-mongodb',
    'Databases & Data',
    'Percona Server for MongoDB',
    'Rocky Linux 9',
    ['7.0', '8.0'],
    ['3-node Replica Set', '5-node Replica Set', 'Sharded'],
    {
      storageDefaults: [
        storage('Data', '/mongodb/data', 500),
        storage('Journal', '/mongodb/journal', 100),
        storage('Backup', '/mongodb/backup', 500),
      ],
      backupEngines: [
        'PBM Logical',
        'PBM Physical',
        'PBM Incremental',
        'PBM PITR',
      ],
    }
  ),
  bp(
    'ferretdb',
    'Databases & Data',
    'FerretDB',
    'Ubuntu 24.04 LTS',
    ['2.7'],
    ['Standalone', 'PostgreSQL HA backend'],
    {
      storageDefaults: [
        storage('PostgreSQL Data', '/var/lib/postgresql', 500),
        storage('Backup', '/backup', 500),
      ],
    }
  ),
  bp(
    'redis',
    'Databases & Data',
    'Redis Open Source',
    'Rocky Linux 9',
    ['7.4', '8.2'],
    ['Standalone', 'Sentinel', '6-node Cluster'],
    {
      storageDefaults: [
        storage('Data', '/var/lib/redis', 100),
        storage('Backup', '/backup/redis', 100),
      ],
    }
  ),
  bp(
    'valkey',
    'Databases & Data',
    'Valkey',
    'Ubuntu 24.04 LTS',
    ['8.1', '9.0'],
    ['Standalone', 'Sentinel', '6-node Cluster'],
    {
      storageDefaults: [
        storage('Data', '/var/lib/valkey', 100),
        storage('Backup', '/backup/valkey', 100),
      ],
    }
  ),
  bp(
    'clickhouse',
    'Databases & Data',
    'ClickHouse',
    'Ubuntu 24.04 LTS',
    ['26.3 LTS', '26.8 LTS'],
    ['Standalone', 'Replicated', 'Sharded + Replicated'],
    {
      storageDefaults: [
        storage('Data', '/var/lib/clickhouse', 1000),
        storage('Backup', '/backup/clickhouse', 1000),
      ],
    }
  ),
  bp(
    'cassandra',
    'Databases & Data',
    'Apache Cassandra',
    'Ubuntu 24.04 LTS',
    ['5.0'],
    ['3-node Cluster', '5-node Cluster', 'Multi-DC'],
    {
      storageDefaults: [
        storage('Data', '/var/lib/cassandra/data', 1000),
        storage('Commit Log', '/var/lib/cassandra/commitlog', 200),
        storage('Backup', '/backup/cassandra', 1000),
      ],
    }
  ),
  bp(
    'yugabytedb',
    'Databases & Data',
    'YugabyteDB',
    'Ubuntu 24.04 LTS',
    ['2025.2 LTS'],
    ['3-node Cluster', '5-node Cluster', 'Multi-zone', 'Multi-site'],
    {
      storageDefaults: [
        storage('Data', '/mnt/d0', 1000),
        storage('Backup', '/backup/yugabyte', 1000),
      ],
    }
  ),
  bp(
    'rabbitmq',
    'Messaging & Streaming',
    'RabbitMQ',
    'Rocky Linux 9',
    ['4.3'],
    ['3-node Quorum', '5-node Quorum', 'Federation DR'],
    {
      storageDefaults: [
        storage('Data', '/var/lib/rabbitmq', 250),
        storage('Backup', '/backup/rabbitmq', 250),
      ],
    }
  ),
  bp(
    'kafka',
    'Messaging & Streaming',
    'Apache Kafka',
    'Rocky Linux 9',
    ['4.3'],
    ['3-node KRaft', '5-node KRaft', 'Separate Controllers'],
    {
      storageDefaults: [
        storage('Log Data 1', '/data/kafka1', 1000),
        storage('Log Data 2', '/data/kafka2', 1000),
      ],
    }
  ),
  bp(
    'pulsar',
    'Messaging & Streaming',
    'Apache Pulsar',
    'Ubuntu 24.04 LTS',
    ['4.0 LTS'],
    ['Production Cluster', 'Multi-cluster DR'],
    {
      storageDefaults: [
        storage('BookKeeper Journal', '/data/bookkeeper-journal', 250),
        storage('BookKeeper Ledgers', '/data/bookkeeper-ledgers', 1000),
      ],
    }
  ),
  bp(
    'nginx',
    'Web & Application',
    'NGINX OSS',
    'Rocky Linux 9',
    ['1.30 stable'],
    ['Standalone', 'Reverse Proxy', 'HA Pair'],
    { storageDefaults: [storage('Logs', '/var/log/nginx', 50)] }
  ),
  bp(
    'apache-httpd',
    'Web & Application',
    'Apache HTTP Server',
    'Rocky Linux 9',
    ['2.4'],
    ['Standalone', 'HA Pair'],
    {
      storageDefaults: [
        storage('Content', '/var/www', 100),
        storage('Logs', '/var/log/httpd', 50),
      ],
    }
  ),
  bp(
    'tomcat',
    'Web & Application',
    'Apache Tomcat',
    'Ubuntu 24.04 LTS',
    ['10.1', '11'],
    ['Standalone', 'Load Balanced'],
    {
      storageDefaults: [
        storage('Applications', '/opt/tomcat/webapps', 100),
        storage('Logs', '/var/log/tomcat', 50),
      ],
    }
  ),
  bp(
    'keycloak',
    'Web & Application',
    'Keycloak',
    'Ubuntu 24.04 LTS',
    ['26.7'],
    ['Standalone', 'HA Cluster'],
    {
      storageDefaults: [
        storage('Application', '/opt/keycloak', 50),
        storage('Logs', '/var/log/keycloak', 50),
      ],
    }
  ),
  bp(
    'superset',
    'Web & Application',
    'Apache Superset',
    'Ubuntu 24.04 LTS',
    ['6.1'],
    ['Standalone', 'Distributed'],
    {
      storageDefaults: [
        storage('Application', '/opt/superset', 50),
        storage('Logs', '/var/log/superset', 50),
      ],
    }
  ),
  bp(
    'airflow',
    'Web & Application',
    'Apache Airflow',
    'Ubuntu 24.04 LTS',
    ['3.1'],
    ['Standalone', 'Distributed'],
    {
      storageDefaults: [
        storage('DAGs', '/opt/airflow/dags', 100),
        storage('Logs', '/opt/airflow/logs', 100),
      ],
    }
  ),
  bp(
    'openbao',
    'DevOps & Security',
    'OpenBao',
    'Ubuntu 24.04 LTS',
    ['2.6'],
    ['Standalone', '3-node Raft', '5-node Raft'],
    {
      storageDefaults: [
        storage('Raft Data', '/opt/openbao/data', 100),
        storage('Audit', '/var/log/openbao', 50),
        storage('Backup', '/backup/openbao', 100),
      ],
    }
  ),
  bp(
    'jenkins',
    'DevOps & Security',
    'Jenkins LTS',
    'Ubuntu 24.04 LTS',
    ['2.568 LTS'],
    ['Controller + Agents'],
    {
      storageDefaults: [
        storage('Jenkins Home', '/var/lib/jenkins', 250),
        storage('Backup', '/backup/jenkins', 250),
      ],
    }
  ),
  bp(
    'forgejo',
    'DevOps & Security',
    'Forgejo',
    'Ubuntu 24.04 LTS',
    ['15 LTS'],
    ['Standalone', 'Load Balanced'],
    {
      storageDefaults: [
        storage('Repositories', '/var/lib/forgejo', 500),
        storage('Backup', '/backup/forgejo', 500),
      ],
    }
  ),
  bp(
    'opensearch',
    'Search & Observability',
    'OpenSearch',
    'Ubuntu 24.04 LTS',
    ['3.8'],
    ['3-node Cluster', 'Dedicated Managers + Data'],
    {
      storageDefaults: [
        storage('Data', '/var/lib/opensearch', 1000),
        storage('Snapshots', '/backup/opensearch', 1000),
      ],
    }
  ),
  bp(
    'prometheus',
    'Search & Observability',
    'Prometheus',
    'Ubuntu 24.04 LTS',
    ['3.13 LTS'],
    ['Standalone', 'HA Pair'],
    { storageDefaults: [storage('Metrics', '/var/lib/prometheus', 500)] }
  ),
  bp(
    'grafana',
    'Search & Observability',
    'Grafana OSS',
    'Ubuntu 24.04 LTS',
    ['12.4', '13.2'],
    ['Standalone', 'HA Pair'],
    {
      storageDefaults: [
        storage('Application Data', '/var/lib/grafana', 100),
        storage('Logs', '/var/log/grafana', 50),
      ],
    }
  ),
  bp(
    'alloy',
    'Search & Observability',
    'Grafana Alloy',
    'Ubuntu 24.04 LTS',
    ['1.19'],
    ['Node Collector', 'Clustered Collectors'],
    { storageDefaults: [storage('Buffer', '/var/lib/alloy', 50)] }
  ),
]

const cloneStorage = (items = []) =>
  items.map((item) => ({ ...item, diskSizes: [...(item.diskSizes || [])] }))

export const getEdition = (blueprint, editionId) =>
  blueprint?.editions?.find(({ id }) => id === editionId)

export const getVersions = (blueprint, editionId) =>
  getEdition(blueprint, editionId)?.versions || blueprint?.versions || []

export const getTopologies = (blueprint, editionId) =>
  getEdition(blueprint, editionId)?.topologies || blueprint?.topologies || []

export const getVersionWarning = (blueprint, editionId, version) =>
  getEdition(blueprint, editionId)?.warningByVersion?.[version] || ''

export const nodeCountForTopology = (topology = '') => {
  const match = topology.match(/(?:^|\D)([356])(?:-node|\b)/i)
  if (match) return Number(match[1])
  if (/cluster6/i.test(topology) || /6-node/i.test(topology)) return 6
  if (
    /ha|cluster|replica|sentinel|quorum|raft|pxc|galera/i.test(topology)
  ) {
    return 3
  }

  return 1
}

const sanitizeHostPrefix = (blueprintId = 'service') =>
  blueprintId.replace(/[^a-z0-9]/gi, '').slice(0, 12) || 'service'

export const makeNodes = (
  blueprintId,
  count,
  domain,
  ipMode,
  current = []
) => {
  const prefix = sanitizeHostPrefix(blueprintId)
  const safeDomain = domain || 'example.internal'

  return Array.from(
    { length: Math.max(1, Number(count) || 1) },
    (_, index) => ({
      fqdn:
        current[index]?.fqdn ||
        `${prefix}${String(index + 1).padStart(2, '0')}.${safeDomain}`,
      ip: current[index]?.ip || '',
      failureDomain:
        current[index]?.failureDomain || `failure-domain-${index + 1}`,
      ipMode,
    })
  )
}

export const emptyDraft = {
  blueprintId: 'postgresql',
  edition: '',
  version: '18',
  topology: '3-node HA',
  workload: 'OLTP',
  nodeCount: 3,
  vcpu: 8,
  memoryGiB: 32,
  expectedDataGiB: 500,
  expectedConnections: 500,
  tuningProfile: 'resource-aware-production',
  domain: '',
  dnsServers: '',
  serviceFqdn: '',
  ipMode: 'auto',
  nodes: [],
  endpointMode: 'layersentry_managed',
  vip: '',
  backendPort: 5432,
  healthCheck: 'tcp',
  storage: [],
  backupEnabled: true,
  backupEngine: 'Barman',
  retentionDays: 30,
  pitr: true,
  pitrWindowHours: 72,
  drEnabled: false,
  drTarget: '',
  rpoMinutes: 15,
  rtoMinutes: 60,
  tls: true,
  hardeningProfile: 'standard-production',
  sshAuth: 'ssh_key_sudo',
  metrics: true,
  logs: true,
  packageSourceMode: 'managed_online',
  repoUrl: '',
  bundleId: '',
  pgStatStatements: true,
  postgis: false,
  postgisDatabases: '',
  pgbouncer: true,
  barman: true,
}

export const createDraftForBlueprint = (blueprint, current = {}) => {
  const editionId = blueprint?.editions?.[0]?.id || ''
  const versions = getVersions(blueprint, editionId)
  const topologies = getTopologies(blueprint, editionId)
  const topology = topologies[0] || ''
  const nodeCount = nodeCountForTopology(topology)
  const domain = current.domain || ''

  return {
    ...emptyDraft,
    ...current,
    blueprintId: blueprint?.id || emptyDraft.blueprintId,
    edition: editionId,
    version: versions[0] || '',
    topology,
    workload: blueprint?.workloads?.[0] || 'General',
    nodeCount,
    storage: cloneStorage(
      blueprint?.storageDefaults || [storage('Data', '/data', 100)]
    ),
    nodes: makeNodes(
      blueprint?.id,
      nodeCount,
      domain,
      current.ipMode || 'auto'
    ),
  }
}

const fqdnPattern =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i
const ipv4Pattern =
  /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/

const isHaTopology = (topology = '') =>
  /ha|cluster|replica|sentinel|quorum|raft|pxc|galera|sharded/i.test(
    topology
  )

export const validateDraft = (draft, blueprint) => {
  const errors = []
  if (!blueprint) {
    return [
      {
        code: 'UNSUPPORTED_CERTIFIED_TUPLE',
        message: 'Select a supported service blueprint.',
      },
    ]
  }

  const versions = getVersions(blueprint, draft.edition)
  const topologies = getTopologies(blueprint, draft.edition)

  if (blueprint.editions?.length && !getEdition(blueprint, draft.edition)) {
    errors.push([
      'UNSUPPORTED_CERTIFIED_TUPLE',
      'Select a supported edition for this service.',
    ])
  }
  if (!versions.includes(draft.version)) {
    errors.push([
      'UNSUPPORTED_CERTIFIED_TUPLE',
      'The selected edition/version combination is not published.',
    ])
  }
  if (!topologies.includes(draft.topology)) {
    errors.push([
      'UNSAFE_TOPOLOGY',
      'The selected edition/topology combination is not published.',
    ])
  }
  if (!Number.isInteger(Number(draft.vcpu)) || Number(draft.vcpu) < 1) {
    errors.push(['INSUFFICIENT_RESOURCES', 'CPU must be at least 1 vCPU.'])
  }
  if (
    !Number.isInteger(Number(draft.memoryGiB)) ||
    Number(draft.memoryGiB) < 1
  ) {
    errors.push([
      'INSUFFICIENT_RESOURCES',
      'Memory must be at least 1 GiB.',
    ])
  }
  if (
    !['resource-aware-production', 'vendor-default-safe'].includes(
      draft.tuningProfile
    )
  ) {
    errors.push([
      'UNSUPPORTED_TUNING_PROFILE',
      'Choose a qualified production tuning profile.',
    ])
  }

  if (!draft.domain || !fqdnPattern.test(draft.domain)) {
    errors.push(['INVALID_FQDN', 'Enter a valid DNS domain.'])
  }
  if (!draft.serviceFqdn || !fqdnPattern.test(draft.serviceFqdn)) {
    errors.push(['INVALID_FQDN', 'Enter a valid service FQDN.'])
  }
  if (
    draft.domain &&
    draft.serviceFqdn &&
    !draft.serviceFqdn
      .toLowerCase()
      .endsWith(`.${draft.domain.toLowerCase()}`)
  ) {
    errors.push([
      'DNS_CONFLICT',
      'Service FQDN must be inside the selected DNS domain.',
    ])
  }

  if (draft.nodes.length !== Number(draft.nodeCount)) {
    errors.push([
      'INVALID_QUORUM',
      'Node count must match the configured node identities.',
    ])
  }

  const seenFqdn = new Set()
  const seenIp = new Set()
  const failureDomains = new Set()
  draft.nodes.forEach((node, index) => {
    const fqdn = String(node.fqdn || '').toLowerCase()
    if (!fqdnPattern.test(fqdn)) {
      errors.push([
        'INVALID_FQDN',
        `Node ${index + 1} requires a valid FQDN.`,
      ])
    } else if (seenFqdn.has(fqdn)) {
      errors.push([
        'DNS_CONFLICT',
        `Node ${index + 1} duplicates an FQDN.`,
      ])
    } else {
      seenFqdn.add(fqdn)
    }

    if (draft.ipMode === 'static') {
      if (!ipv4Pattern.test(String(node.ip || ''))) {
        errors.push([
          'IP_OUTSIDE_SUBNET',
          `Node ${index + 1} requires a valid static IPv4 address.`,
        ])
      } else if (seenIp.has(node.ip)) {
        errors.push([
          'IP_CONFLICT',
          `Node ${index + 1} duplicates a static IP address.`,
        ])
      } else {
        seenIp.add(node.ip)
      }
    }

    if (node.failureDomain) failureDomains.add(node.failureDomain)
  })

  if (
    isHaTopology(draft.topology) &&
    Number(draft.nodeCount) >= 3 &&
    failureDomains.size < Number(draft.nodeCount)
  ) {
    errors.push([
      'FAILURE_DOMAIN_VIOLATION',
      'HA members must be assigned to distinct qualified failure domains.',
    ])
  }

  ;(draft.storage || []).forEach((volume) => {
    const sizes = (volume.diskSizes || []).map(Number)
    if (!volume.mountpoint?.startsWith('/')) {
      errors.push([
        'INVALID_STORAGE_MOUNT',
        `${volume.role}: mount point must be an absolute path.`,
      ])
    }
    if (volume.layout === 'stripe') {
      if (sizes.length < 2) {
        errors.push([
          'STRIPE_DISK_COUNT',
          `${volume.role}: striped storage requires at least two disks.`,
        ])
      }
      if (new Set(sizes).size > 1) {
        errors.push([
          'STRIPE_DISK_SIZE_MISMATCH',
          `${volume.role}: all striped disks must have exactly the same provisioned size.`,
        ])
      }
      if (!volume.storageClass) {
        errors.push([
          'STRIPE_STORAGE_CLASS_MISMATCH',
          `${volume.role}: choose one qualified storage class for every stripe member.`,
        ])
      }
    }
  })

  if (
    draft.endpointMode === 'external_lb' &&
    (!draft.vip || !Number(draft.backendPort))
  ) {
    errors.push([
      'EXTERNAL_LB_DETAILS_REQUIRED',
      'External load balancer requires VIP/address and backend port.',
    ])
  }
  if (
    draft.backupEnabled &&
    (!Number(draft.retentionDays) || Number(draft.retentionDays) < 1)
  ) {
    errors.push([
      'INVALID_BACKUP_RETENTION',
      'Backup retention must be at least one day.',
    ])
  }
  if (
    draft.backupEnabled &&
    draft.pitr &&
    (!Number(draft.pitrWindowHours) ||
      Number(draft.pitrWindowHours) < 1)
  ) {
    errors.push([
      'INVALID_PITR_WINDOW',
      'PITR recovery window must be at least one hour.',
    ])
  }
  if (
    draft.drEnabled &&
    (!draft.drTarget ||
      draft.rpoMinutes === '' ||
      draft.rtoMinutes === '')
  ) {
    errors.push([
      'RPO_RTO_REQUIRED',
      'DR requires a target site, RPO and RTO.',
    ])
  }
  if (
    draft.packageSourceMode === 'local_mirror' &&
    !draft.repoUrl
  ) {
    errors.push([
      'OFFLINE_DEPENDENCY_MISSING',
      'Local mirror mode requires an internal repository URL/FQDN.',
    ])
  }
  if (
    draft.packageSourceMode === 'airgapped_bundle' &&
    !draft.bundleId
  ) {
    errors.push([
      'OFFLINE_DEPENDENCY_MISSING',
      'Air-gapped mode requires a qualified bundle ID.',
    ])
  }
  if (
    draft.blueprintId === 'postgresql' &&
    draft.postgis &&
    !draft.postgisDatabases.trim()
  ) {
    errors.push([
      'POSTGIS_DATABASE_REQUIRED',
      'Choose the database(s) where PostGIS should be enabled.',
    ])
  }

  const editionWarning = getVersionWarning(
    blueprint,
    draft.edition,
    draft.version
  )
  if (editionWarning && draft.backupEnabled) {
    errors.push(['BACKUP_COMPONENT_NOT_GA', editionWarning])
  }

  return errors.map(([code, message]) => ({ code, message }))
}
