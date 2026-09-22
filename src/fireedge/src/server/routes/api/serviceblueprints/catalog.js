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

/**
 * Runtime VM production-service catalog exposed by FireEdge.
 *
 * IMPORTANT: this is an authoritative availability gate, not a certification
 * shortcut. Every entry starts fail-closed. Promotion of an exact immutable
 * tuple requires separate compatibility, image, execution and qualification
 * evidence. The API must never infer deployment eligibility from the presence
 * of a product family in this list.
 */

const item = (id, name, versions, topologies) => ({
  id,
  name,
  versions,
  topologies,
  qualification: 'NOT_TESTED',
  productionSelectable: false,
  executionBackendQualified: false,
})

// prettier-ignore
const CATALOG = Object.freeze([
  item('postgresql', 'PostgreSQL', ['16', '17', '18'], [
    'Standalone',
    '3-node HA',
    '5-node HA',
    'HA + DR',
  ]),
  item('mysql-family', 'MySQL Family', ['8.4 LTS', '9.7 LTS'], [
    'Standalone',
    '3-node InnoDB Cluster',
    '5-node InnoDB Cluster',
    'ClusterSet DR',
  ]),
  item('mariadb', 'MariaDB Community', ['11.4 LTS', '11.8 LTS'], [
    'Standalone',
    '3-node Galera',
    '5-node Galera',
    '3-node Galera + asynchronous DR',
  ]),
  item('mongodb-community', 'MongoDB Community', ['7.0', '8.0'], [
    '3-node Replica Set',
    '5-node Replica Set',
    'Sharded: 2 shards × 3 + 3 config + 2 mongos',
    'Sharded: 3 shards × 3 + 3 config + 2 mongos',
  ]),
  item('percona-mongodb', 'Percona Server for MongoDB', ['7.0', '8.0'], [
    '3-node Replica Set',
    '5-node Replica Set',
    'Sharded: 2 shards × 3 + 3 config + 2 mongos',
    'Sharded: 3 shards × 3 + 3 config + 2 mongos',
  ]),
  item('ferretdb', 'FerretDB', ['2.7'], [
    '1 FerretDB frontend',
    '2 FerretDB frontends (HA)',
  ]),
  item('redis', 'Redis Open Source', ['7.4', '8.2'], [
    'Standalone',
    'Sentinel HA (3 data nodes + 3 co-located Sentinels)',
    '6-node Cluster (3 primaries + 3 replicas)',
  ]),
  item('valkey', 'Valkey', ['8.1', '9.0'], [
    'Standalone',
    'Sentinel HA (3 data nodes + 3 co-located Sentinels)',
    '6-node Cluster (3 primaries + 3 replicas)',
  ]),
  item('clickhouse', 'ClickHouse', ['26.3 LTS', '26.8 LTS'], [
    'Standalone',
    '3 data nodes + 3 Keeper',
    '2 shards × 2 replicas + 3 Keeper',
  ]),
  item('cassandra', 'Apache Cassandra', ['5.0'], [
    '3-node Cluster (RF=3)',
    '5-node Cluster (RF=3)',
    'Multi-DC: 3 nodes per DC minimum',
  ]),
  item('yugabytedb', 'YugabyteDB', ['2025.2 LTS'], [
    '3 TServers + 3 dedicated Masters (RF3)',
    '5 TServers + 3 dedicated Masters (RF3)',
    '3-region RF3: 3 TServers + 3 dedicated Masters',
    'xCluster DR: 3 TServers + 3 Masters per universe',
  ]),
  item('rabbitmq', 'RabbitMQ', ['4.3'], [
    '3-node Quorum Cluster',
    '5-node Quorum Cluster',
    'Federation DR: 3 + 3 nodes',
  ]),
  item('kafka', 'Apache Kafka', ['4.3'], [
    '3 brokers + 3 controllers',
    '5 brokers + 3 controllers',
    '3 brokers + 5 controllers',
  ]),
  item('pulsar', 'Apache Pulsar', ['4.0 LTS'], [
    'Production Cluster (3 broker+bookie + 3 metadata)',
    'Multi-cluster DR (2 × production cluster)',
  ]),
  item('nginx', 'NGINX OSS', ['1.30 stable'], [
    'Standalone',
    'HA Reverse Proxy Pair',
  ]),
  item('apache-httpd', 'Apache HTTP Server', ['2.4'], [
    'Standalone',
    'HA Pair',
  ]),
  item('tomcat', 'Apache Tomcat', ['10.1', '11'], [
    'Standalone',
    'Load Balanced Pair',
    '3-node Load Balanced',
  ]),
  item('keycloak', 'Keycloak', ['26.7'], [
    'Standalone',
    '3-node HA Cluster',
  ]),
  item('superset', 'Apache Superset', ['6.1'], ['Standalone', 'Distributed']),
  item('airflow', 'Apache Airflow', ['3.1'], [
    'Standalone',
    'Distributed Celery',
  ]),
  item('openbao', 'OpenBao', ['2.6'], [
    'Standalone',
    '3-node Raft',
    '5-node Raft',
  ]),
  item('jenkins', 'Jenkins', ['2.568 LTS'], [
    'Controller + 2 agents',
    'Controller + 4 agents',
  ]),
  item('forgejo', 'Forgejo', ['15 LTS'], ['Standalone', 'HA Pair']),
  item('opensearch', 'OpenSearch', ['3.8'], [
    '3 managers + 3 data',
    '3 managers + 6 data',
  ]),
  item('prometheus', 'Prometheus', ['3.13 LTS'], ['Standalone', 'HA Pair']),
  item('grafana', 'Grafana OSS', ['12.4', '13.2'], ['Standalone', 'HA Pair']),
  item('alloy', 'Grafana Alloy', ['1.19'], [
    'Node Collector',
    '3-node Clustered Collectors',
  ]),
])

/**
 * Return a copy of the runtime production-service catalog.
 *
 * @returns {Array<object>} runtime service entries
 */
const getCatalog = () => CATALOG.map((entry) => ({ ...entry }))

/**
 * Find a runtime production-service family by identifier.
 *
 * @param {string} id - service family identifier
 * @returns {object|undefined} matching catalog entry
 */
const findBlueprint = (id) => CATALOG.find((entry) => entry.id === id)

module.exports = {
  CATALOG,
  getCatalog,
  findBlueprint,
}
