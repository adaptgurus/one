/* ------------------------------------------------------------------------- *
 * LayerSentry VM service blueprint presentation model.                       *
 *                                                                            *
 * The runtime catalog/preflight API is authoritative. This local catalog is  *
 * a fail-closed discovery fallback: every entry is NOT_TESTED and cannot be  *
 * deployed until the backend returns a promoted certified tuple.             *
 * ------------------------------------------------------------------------- */

export const SERVICE_BLUEPRINT_API = '/api/v1/service-blueprints'

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

export const FALLBACK_BLUEPRINTS = [
  bp('postgresql', 'Databases & Data', 'PostgreSQL', 'Rocky Linux 9', ['16', '17', '18'], ['Standalone', '3-node HA', '5-node HA', 'HA + DR'], {
    workloads: ['OLTP', 'OLAP', 'Mixed'],
    storageRoles: ['Data', 'WAL', 'Backup'],
    extensions: ['pg_stat_statements', 'PostGIS'],
    components: ['Patroni', 'etcd', 'PgBouncer', 'Barman'],
  }),
  bp('mysql-family', 'Databases & Data', 'MySQL Family', 'Rocky Linux 9', ['8.4 LTS', '9.7 LTS'], ['Standalone', '3-node HA', '5-node HA', 'DR'], {
    editions: ['MySQL Community', 'Percona Server for MySQL', 'Percona XtraDB Cluster'],
    workloads: ['OLTP', 'OLAP', 'Mixed'],
    storageRoles: ['Data', 'Redo / Binlog', 'Backup'],
  }),
  bp('mariadb', 'Databases & Data', 'MariaDB Community', 'Rocky Linux 9', ['11.4 LTS', '11.8 LTS'], ['Standalone', '3-node Galera', '5-node Galera', 'Async DR']),
  bp('mongodb-community', 'Databases & Data', 'MongoDB Community', 'Rocky Linux 9', ['7.0', '8.0'], ['3-node Replica Set', '5-node Replica Set', 'Sharded'], { backup: ['PBM Logical', 'PBM PITR'] }),
  bp('percona-mongodb', 'Databases & Data', 'Percona Server for MongoDB', 'Rocky Linux 9', ['7.0', '8.0'], ['3-node Replica Set', '5-node Replica Set', 'Sharded'], { backup: ['PBM Logical', 'PBM Physical', 'PBM Incremental', 'PBM PITR'] }),
  bp('ferretdb', 'Databases & Data', 'FerretDB', 'Ubuntu 24.04 LTS', ['2.7'], ['Standalone', 'PostgreSQL HA backend']),
  bp('redis', 'Databases & Data', 'Redis Open Source', 'Rocky Linux 9', ['7.4', '8.2'], ['Standalone', 'Sentinel', '6-node Cluster']),
  bp('valkey', 'Databases & Data', 'Valkey', 'Ubuntu 24.04 LTS', ['8.1', '9.0'], ['Standalone', 'Sentinel', '6-node Cluster']),
  bp('clickhouse', 'Databases & Data', 'ClickHouse', 'Ubuntu 24.04 LTS', ['26.3 LTS', '26.8 LTS'], ['Standalone', 'Replicated', 'Sharded + Replicated']),
  bp('cassandra', 'Databases & Data', 'Apache Cassandra', 'Ubuntu 24.04 LTS', ['5.0'], ['3-node Cluster', '5-node Cluster', 'Multi-DC']),
  bp('yugabytedb', 'Databases & Data', 'YugabyteDB', 'Ubuntu 24.04 LTS', ['2025.2 LTS'], ['3-node Cluster', '5-node Cluster', 'Multi-zone', 'Multi-site']),
  bp('rabbitmq', 'Messaging & Streaming', 'RabbitMQ', 'Rocky Linux 9', ['4.3'], ['3-node Quorum', '5-node Quorum', 'Federation DR']),
  bp('kafka', 'Messaging & Streaming', 'Apache Kafka', 'Rocky Linux 9', ['4.3'], ['3-node KRaft', '5-node KRaft', 'Separate Controllers']),
  bp('pulsar', 'Messaging & Streaming', 'Apache Pulsar', 'Ubuntu 24.04 LTS', ['4.0 LTS'], ['Production Cluster', 'Multi-cluster DR']),
  bp('nginx', 'Web & Application', 'NGINX OSS', 'Rocky Linux 9', ['1.30 stable'], ['Standalone', 'Reverse Proxy', 'HA Pair']),
  bp('apache-httpd', 'Web & Application', 'Apache HTTP Server', 'Rocky Linux 9', ['2.4'], ['Standalone', 'HA Pair']),
  bp('tomcat', 'Web & Application', 'Apache Tomcat', 'Ubuntu 24.04 LTS', ['10.1', '11'], ['Standalone', 'Load Balanced']),
  bp('keycloak', 'Web & Application', 'Keycloak', 'Ubuntu 24.04 LTS', ['26.7'], ['Standalone', 'HA Cluster']),
  bp('superset', 'Web & Application', 'Apache Superset', 'Ubuntu 24.04 LTS', ['6.1'], ['Standalone', 'Distributed']),
  bp('airflow', 'Web & Application', 'Apache Airflow', 'Ubuntu 24.04 LTS', ['3.1'], ['Standalone', 'Distributed']),
  bp('openbao', 'DevOps & Security', 'OpenBao', 'Ubuntu 24.04 LTS', ['2.6'], ['Standalone', '3-node Raft', '5-node Raft']),
  bp('jenkins', 'DevOps & Security', 'Jenkins LTS', 'Ubuntu 24.04 LTS', ['2.568 LTS'], ['Controller + Agents']),
  bp('forgejo', 'DevOps & Security', 'Forgejo', 'Ubuntu 24.04 LTS', ['15 LTS'], ['Standalone', 'Load Balanced']),
  bp('opensearch', 'Search & Observability', 'OpenSearch', 'Ubuntu 24.04 LTS', ['3.8'], ['3-node Cluster', 'Dedicated Managers + Data']),
  bp('prometheus', 'Search & Observability', 'Prometheus', 'Ubuntu 24.04 LTS', ['3.13 LTS'], ['Standalone', 'HA Pair']),
  bp('grafana', 'Search & Observability', 'Grafana OSS', 'Ubuntu 24.04 LTS', ['12.4', '13.2'], ['Standalone', 'HA Pair']),
  bp('alloy', 'Search & Observability', 'Grafana Alloy', 'Ubuntu 24.04 LTS', ['1.19'], ['Node Collector', 'Clustered Collectors']),
]

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
  domain: '',
  serviceFqdn: '',
  ipMode: 'auto',
  endpointMode: 'layersentry_managed',
  vip: '',
  backendPort: 5432,
  storage: [
    { role: 'Data', layout: 'single', mountpoint: '/pgdata', storageClass: '', diskSizes: [500] },
    { role: 'WAL', layout: 'single', mountpoint: '/pgwal', storageClass: '', diskSizes: [100] },
    { role: 'Backup', layout: 'single', mountpoint: '/pgbackup', storageClass: '', diskSizes: [500] },
  ],
  backupEnabled: true,
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

const fqdnPattern = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i

export const validateDraft = (draft, blueprint) => {
  const errors = []
  if (!blueprint) errors.push(['UNSUPPORTED_CERTIFIED_TUPLE', 'Select a supported service blueprint.'])
  if (!draft.version) errors.push(['UNSUPPORTED_CERTIFIED_TUPLE', 'Select a supported version.'])
  if (!draft.topology) errors.push(['INVALID_QUORUM', 'Select a deployment topology.'])
  if (!Number.isInteger(Number(draft.vcpu)) || Number(draft.vcpu) < 1) errors.push(['INSUFFICIENT_RESOURCES', 'CPU must be at least 1 vCPU.'])
  if (!Number.isInteger(Number(draft.memoryGiB)) || Number(draft.memoryGiB) < 1) errors.push(['INSUFFICIENT_RESOURCES', 'Memory must be at least 1 GiB.'])
  if (!draft.domain || !draft.serviceFqdn || !fqdnPattern.test(draft.serviceFqdn)) errors.push(['INVALID_FQDN', 'Enter a valid service FQDN and DNS domain.'])

  ;(draft.storage || []).forEach((volume) => {
    const sizes = (volume.diskSizes || []).map(Number)
    if (!volume.mountpoint?.startsWith('/')) errors.push(['INVALID_STORAGE_MOUNT', `${volume.role}: mount point must be an absolute path.`])
    if (volume.layout === 'stripe') {
      if (sizes.length < 2) errors.push(['STRIPE_DISK_COUNT', `${volume.role}: striped storage requires at least two disks.`])
      if (new Set(sizes).size > 1) errors.push(['STRIPE_DISK_SIZE_MISMATCH', `${volume.role}: all striped disks must have exactly the same provisioned size.`])
      if (!volume.storageClass) errors.push(['STRIPE_STORAGE_CLASS_MISMATCH', `${volume.role}: choose one qualified storage class for all stripe members.`])
    }
  })

  if (draft.endpointMode === 'external_lb' && (!draft.vip || !draft.backendPort)) errors.push(['EXTERNAL_LB_DETAILS_REQUIRED', 'External load balancer requires VIP/address and backend port.'])
  if (draft.drEnabled && (!draft.drTarget || draft.rpoMinutes === '' || draft.rtoMinutes === '')) errors.push(['RPO_RTO_REQUIRED', 'DR requires a target site, RPO and RTO.'])
  if (draft.packageSourceMode === 'local_mirror' && !draft.repoUrl) errors.push(['OFFLINE_DEPENDENCY_MISSING', 'Local mirror mode requires an internal repository URL/FQDN.'])
  if (draft.packageSourceMode === 'airgapped_bundle' && !draft.bundleId) errors.push(['OFFLINE_DEPENDENCY_MISSING', 'Air-gapped mode requires a qualified bundle ID.'])
  if (draft.blueprintId === 'postgresql' && draft.postgis && !draft.postgisDatabases.trim()) errors.push(['POSTGIS_DATABASE_REQUIRED', 'Choose the database(s) where PostGIS should be enabled.'])

  return errors.map(([code, message]) => ({ code, message }))
}
