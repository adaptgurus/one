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
import PropTypes from 'prop-types'
import {
  Alert,
  Box,
  Button,
  Grid,
  LinearProgress,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  Typography,
} from '@mui/material'
import { useMemo, useState } from 'react'
import { useHistory, useParams } from 'react-router-dom'
import { HostAPI, VmAPI } from '@FeaturesModule'
import {
  MetricCard,
  PageFrame,
  RefreshButton,
  StatusPill,
  Surface,
} from 'client/apps/layersentry/components/Primitives'
import { PRODUCT_PATHS } from 'client/apps/layersentry/navigation'
import { colors } from 'client/apps/layersentry/theme/tokens'

const toArray = (value) => (Array.isArray(value) ? value : value ? [value] : [])
const show = (value, suffix = '') =>
  value === undefined || value === null || value === ''
    ? 'Unavailable'
    : `${value}${suffix}`
const number = (value) => {
  const parsed = Number(value)

  return Number.isFinite(parsed) ? parsed : undefined
}
const percent = (used, maximum) => {
  const left = number(used)
  const right = number(maximum)

  return left !== undefined && right > 0
    ? Math.round((left / right) * 100)
    : undefined
}
const gib = (kilobytes) => {
  const value = number(kilobytes)

  return value === undefined
    ? 'Unavailable'
    : `${(value / 1024 / 1024).toFixed(1)} GiB`
}
const objectValue = (source, names) => {
  for (const name of names) {
    if (source?.[name] !== undefined && source?.[name] !== '')
      return source[name]
  }
}
const lastHistory = (vm) => {
  const records = toArray(vm?.HISTORY_RECORDS?.HISTORY)

  return records[records.length - 1]
}
const vmOnHost = (vm, hostId) =>
  String(lastHistory(vm)?.HID ?? vm?.HISTORY_RECORDS?.HISTORY?.HID ?? '') ===
  String(hostId)
const vmState = (state) =>
  ({
    0: 'Init',
    1: 'Pending',
    2: 'Held',
    3: 'Running',
    4: 'Stopped',
    5: 'Suspended',
    6: 'Done',
    8: 'Powered off',
    9: 'Undeployed',
  }[Number(state)] ?? show(state))

const DetailRow = ({ label, value }) => (
  <Box
    sx={{
      display: 'flex',
      justifyContent: 'space-between',
      gap: 2,
      py: 0.75,
      borderBottom: `1px solid ${colors.border}`,
    }}
  >
    <Typography sx={{ fontSize: 12, color: colors.text.secondary }}>
      {label}
    </Typography>
    <Typography sx={{ fontSize: 12, fontWeight: 650, textAlign: 'right' }}>
      {show(value)}
    </Typography>
  </Box>
)
DetailRow.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.node,
}

const Section = ({ title, children }) => (
  <Surface sx={{ p: 2.25 }}>
    <Typography sx={{ fontSize: 15, fontWeight: 750, mb: 1.25 }}>
      {title}
    </Typography>
    {children}
  </Surface>
)
Section.propTypes = {
  title: PropTypes.string.isRequired,
  children: PropTypes.node,
}

const FABRICS = [
  ['MANAGEMENT', 'Management'],
  ['WORKLOAD', 'Workload / Production VM'],
  ['STORAGE', 'Storage'],
  ['LIVE_MIGRATION', 'Live Migration'],
  ['BACKUP_REPLICATION', 'Backup / Replication'],
  ['CLUSTER_CONTROL', 'Cluster Control (optional)'],
]

const normalizeFabric = (host, role) => {
  const records = [
    ...toArray(host?.TEMPLATE?.LAYERSENTRY_FABRICS?.FABRIC),
    ...toArray(host?.MONITORING?.LAYERSENTRY_FABRICS?.FABRIC),
    ...toArray(host?.MONITORING?.FABRICS?.FABRIC),
  ]
  const record = records.find(
    (item) => String(item?.ROLE ?? item?.TYPE ?? '').toUpperCase() === role
  )
  const desired = record?.DESIRED ?? {}
  const observed = record?.OBSERVED ?? record ?? {}

  return { record, desired, observed }
}

const FabricTable = ({ host }) => (
  <Section title="Host network fabrics">
    <Alert severity="info" sx={{ mb: 2 }}>
      Fabric roles are shown only from authoritative host-agent inventory.
      LayerSentry does not infer a role from an interface name.
    </Alert>
    <Box sx={{ overflowX: 'auto' }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            {[
              'Fabric',
              'Interface / bond',
              'Bridge / vSwitch',
              'Addressing',
              'VLAN / VNI / MTU',
              'Link / uplink',
              'Throughput',
              'Errors / drops',
              'Drift',
            ].map((label) => (
              <TableCell key={label} sx={{ fontWeight: 750 }}>
                {label}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {FABRICS.map(([role, label]) => {
            const { record, desired, observed } = normalizeFabric(host, role)
            const interfaceName = objectValue(observed, [
              'INTERFACE',
              'NIC',
              'NAME',
            ])
            const members = objectValue(observed, ['MEMBERS', 'SLAVES'])
            const address = objectValue(observed, ['CIDR', 'IP', 'ADDRESS'])
            const vlan = objectValue(observed, ['VLAN', 'VLAN_ID'])
            const vni = objectValue(observed, ['VNI'])
            const mtu = objectValue(observed, ['MTU'])
            const desiredMtu = objectValue(desired, ['MTU'])
            const drift = objectValue(record, ['DRIFT', 'DRIFT_STATUS'])

            return (
              <TableRow key={role}>
                <TableCell>
                  <Typography sx={{ fontSize: 12, fontWeight: 700 }}>
                    {label}
                  </Typography>
                  {!record && (
                    <Typography sx={{ fontSize: 10, color: colors.text.muted }}>
                      Not reported
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  {show(
                    [interfaceName, members && `members ${members}`]
                      .filter(Boolean)
                      .join(' · ')
                  )}
                </TableCell>
                <TableCell>
                  {show(objectValue(observed, ['BRIDGE', 'VSWITCH']))}
                </TableCell>
                <TableCell>
                  {show(
                    [
                      address,
                      objectValue(observed, ['GATEWAY']) &&
                        `gw ${observed.GATEWAY}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  )}
                </TableCell>
                <TableCell>
                  {show(
                    [
                      vlan && `VLAN ${vlan}`,
                      vni && `VNI ${vni}`,
                      mtu && `MTU ${mtu}`,
                      desiredMtu &&
                        String(desiredMtu) !== String(mtu) &&
                        `desired ${desiredMtu}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  )}
                </TableCell>
                <TableCell>
                  {show(
                    [
                      objectValue(observed, ['LINK', 'STATE']),
                      objectValue(observed, ['UPLINK']),
                      objectValue(observed, ['SPEED']),
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  )}
                </TableCell>
                <TableCell>
                  {show(
                    [
                      objectValue(observed, ['RX_BPS', 'RX_RATE']),
                      objectValue(observed, ['TX_BPS', 'TX_RATE']),
                    ]
                      .filter(Boolean)
                      .join(' / ')
                  )}
                </TableCell>
                <TableCell>
                  {show(
                    [
                      objectValue(observed, ['ERRORS']),
                      objectValue(observed, ['DROPS']),
                    ]
                      .filter(Boolean)
                      .join(' / ')
                  )}
                </TableCell>
                <TableCell>
                  {record ? (
                    <StatusPill
                      label={show(drift ?? 'No drift reported')}
                      tone={
                        String(drift).toLowerCase().includes('drift')
                          ? 'warning'
                          : 'info'
                      }
                    />
                  ) : (
                    'Unavailable'
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </Box>
  </Section>
)
FabricTable.propTypes = { host: PropTypes.object.isRequired }

const HostDetail = () => {
  const { id } = useParams()
  const history = useHistory()
  const [tab, setTab] = useState(0)
  const hosts = HostAPI.useGetHostsQuery()
  const vms = VmAPI.useGetVmsQuery({ extended: true })
  const host = toArray(hosts.data).find(
    (item) => String(item.ID) === String(id)
  )
  const placed = useMemo(
    () => toArray(vms.data).filter((vm) => vmOnHost(vm, id)),
    [vms.data, id]
  )

  if (hosts.isLoading) return <LinearProgress />
  if (hosts.isError)
    return (
      <Alert severity="error">
        Host inventory could not be loaded from the authoritative infrastructure
        API.
      </Alert>
    )
  if (!host)
    return (
      <Alert severity="warning">
        Host {id} is not visible to this administrator.
      </Alert>
    )

  const share = host.HOST_SHARE ?? {}
  const cpuUsed = number(share.USED_CPU)
  const cpuMax = number(share.MAX_CPU)
  const memUsed = number(share.USED_MEM)
  const memMax = number(share.MAX_MEM)
  const template = host.TEMPLATE ?? {}
  const monitoring = host.MONITORING ?? {}
  const protectionZone = objectValue(template, [
    'PROTECTION_ZONE',
    'LAYERSENTRY_PROTECTION_ZONE',
    'FAILURE_DOMAIN',
  ])
  const drs = objectValue(template, ['DRS_STATE', 'LAYERSENTRY_DRS_STATE'])
  const maintenance = objectValue(template, ['MAINTENANCE', 'MAINTENANCE_MODE'])
  const devices = toArray(
    monitoring?.PCI_DEVICES?.PCI ?? template?.PCI_DEVICES?.PCI
  )
  const datastores = toArray(host.DATASTORES?.ID)

  return (
    <PageFrame
      title={host.NAME ?? `Host ${id}`}
      description="Read-only authoritative compute-host detail. Configuration changes are routed to the owning infrastructure workflows."
      actions={
        <>
          <Button
            variant="outlined"
            onClick={() => history.push(PRODUCT_PATHS.INFRA_HOSTS)}
          >
            All hosts
          </Button>
          <RefreshButton
            onClick={() => {
              hosts.refetch()
              vms.refetch()
            }}
            disabled={hosts.isFetching || vms.isFetching}
          />
        </>
      }
    >
      <Tabs
        value={tab}
        onChange={(_event, value) => setTab(value)}
        variant="scrollable"
        sx={{ mt: 2, mb: 2 }}
      >
        {[
          'Overview',
          'VM Placement',
          'Network',
          'Storage & Devices',
          'DRS & Maintenance',
          'Metrics',
          'Events',
        ].map((label) => (
          <Tab key={label} label={label} />
        ))}
      </Tabs>

      {tab === 0 && (
        <Stack spacing={2}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} lg={3}>
              <MetricCard
                label="Placed VMs"
                value={placed.length}
                detail={`${
                  placed.filter((vm) => Number(vm.STATE) === 3).length
                } running`}
              />
            </Grid>
            <Grid item xs={12} sm={6} lg={3}>
              <MetricCard
                label="CPU headroom"
                value={
                  cpuMax === undefined || cpuUsed === undefined
                    ? 'Unavailable'
                    : `${Math.max(0, cpuMax - cpuUsed) / 100} cores`
                }
                detail={
                  percent(cpuUsed, cpuMax) === undefined
                    ? 'Usage unavailable'
                    : `${percent(cpuUsed, cpuMax)}% allocated`
                }
              />
            </Grid>
            <Grid item xs={12} sm={6} lg={3}>
              <MetricCard
                label="RAM headroom"
                value={
                  memMax === undefined || memUsed === undefined
                    ? 'Unavailable'
                    : gib(Math.max(0, memMax - memUsed))
                }
                detail={
                  percent(memUsed, memMax) === undefined
                    ? 'Usage unavailable'
                    : `${percent(memUsed, memMax)}% allocated`
                }
              />
            </Grid>
            <Grid item xs={12} sm={6} lg={3}>
              <MetricCard
                label="Devices"
                value={devices.length || 'Unavailable'}
                detail="Authoritative PCI/device inventory"
              />
            </Grid>
          </Grid>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Section title="Identity">
                <DetailRow label="Host ID" value={host.ID} />
                <DetailRow label="State" value={host.STATE} />
                <DetailRow label="Compute driver" value={host.VM_MAD} />
                <DetailRow label="Monitor driver" value={host.IM_MAD} />
                <DetailRow label="Cluster ID" value={host.CLUSTER_ID} />
              </Section>
            </Grid>
            <Grid item xs={12} md={6}>
              <Section title="Placement policy">
                <DetailRow
                  label="Protection Zone / failure domain"
                  value={protectionZone}
                />
                <DetailRow label="DRS status" value={drs} />
                <DetailRow label="Maintenance" value={maintenance} />
                <DetailRow
                  label="Placement drift"
                  value={objectValue(template, [
                    'PLACEMENT_DRIFT',
                    'LAYERSENTRY_PLACEMENT_DRIFT',
                  ])}
                />
              </Section>
            </Grid>
          </Grid>
        </Stack>
      )}

      {tab === 1 && (
        <Section title="Authoritative VM placement">
          {vms.isLoading ? (
            <LinearProgress />
          ) : vms.isError ? (
            <Alert severity="error">VM placement could not be read.</Alert>
          ) : placed.length === 0 ? (
            <Alert severity="info">
              No visible VM is currently reported on this host.
            </Alert>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['ID', 'Name', 'State', 'Environment', 'vCPU', 'Memory'].map(
                    (label) => (
                      <TableCell key={label} sx={{ fontWeight: 750 }}>
                        {label}
                      </TableCell>
                    )
                  )}
                </TableRow>
              </TableHead>
              <TableBody>
                {placed.map((vm) => (
                  <TableRow key={vm.ID}>
                    <TableCell>{vm.ID}</TableCell>
                    <TableCell>{vm.NAME}</TableCell>
                    <TableCell>{vmState(vm.STATE)}</TableCell>
                    <TableCell>
                      {show(
                        vm.USER_TEMPLATE?.LAYERSENTRY_ENVIRONMENT ??
                          vm.TEMPLATE?.CONTEXT?.LAYERSENTRY_ENVIRONMENT
                      )}
                    </TableCell>
                    <TableCell>
                      {show(vm.TEMPLATE?.VCPU ?? vm.TEMPLATE?.CPU)}
                    </TableCell>
                    <TableCell>
                      {gib(
                        number(vm.TEMPLATE?.MEMORY) === undefined
                          ? undefined
                          : Number(vm.TEMPLATE.MEMORY) * 1024
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Section>
      )}
      {tab === 2 && <FabricTable host={host} />}
      {tab === 3 && (
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <Section title="Storage">
              <DetailRow
                label="Attached storage pools"
                value={datastores.length ? datastores.join(', ') : undefined}
              />
              <DetailRow
                label="Storage capacity"
                value={objectValue(monitoring, ['STORAGE_TOTAL', 'DISK_TOTAL'])}
              />
              <DetailRow
                label="Storage available"
                value={objectValue(monitoring, ['STORAGE_FREE', 'DISK_FREE'])}
              />
              <Button
                sx={{ mt: 2 }}
                variant="outlined"
                onClick={() => history.push(PRODUCT_PATHS.INFRA_STORAGE)}
              >
                Open authoritative storage workflow
              </Button>
            </Section>
          </Grid>
          <Grid item xs={12} md={6}>
            <Section title="Devices">
              <DetailRow
                label="Reported PCI devices"
                value={devices.length || undefined}
              />
              <DetailRow
                label="NUMA topology"
                value={objectValue(monitoring, ['NUMA_NODES', 'NUMA_TOPOLOGY'])}
              />
              <DetailRow
                label="Device headroom"
                value={objectValue(template, [
                  'DEVICE_HEADROOM',
                  'LAYERSENTRY_DEVICE_HEADROOM',
                ])}
              />
            </Section>
          </Grid>
        </Grid>
      )}
      {tab === 4 && (
        <Section title="DRS, Protection Zone and maintenance">
          <DetailRow
            label="Protection Zone / failure domain"
            value={protectionZone}
          />
          <DetailRow label="DRS state" value={drs} />
          <DetailRow label="Maintenance state" value={maintenance} />
          <DetailRow
            label="Evacuation status"
            value={objectValue(template, [
              'EVACUATION_STATUS',
              'LAYERSENTRY_EVACUATION_STATUS',
            ])}
          />
          <Alert severity="info" sx={{ mt: 2 }}>
            This page is read-only. Use Compute Clusters for placement policy
            and the authoritative DRS/maintenance workflow for operational
            changes.
          </Alert>
          <Button
            sx={{ mt: 2 }}
            variant="outlined"
            onClick={() => history.push(PRODUCT_PATHS.INFRA_CLUSTERS)}
          >
            Open compute clusters
          </Button>
        </Section>
      )}
      {tab === 5 && (
        <Section title="Observed metrics">
          <DetailRow
            label="CPU allocated"
            value={
              percent(cpuUsed, cpuMax) === undefined
                ? undefined
                : `${percent(cpuUsed, cpuMax)}%`
            }
          />
          <DetailRow
            label="RAM allocated"
            value={
              percent(memUsed, memMax) === undefined
                ? undefined
                : `${percent(memUsed, memMax)}%`
            }
          />
          <DetailRow label="Running VMs" value={share.RUNNING_VMS} />
          <DetailRow label="Last monitor time" value={host.LAST_MON_TIME} />
          <DetailRow label="Monitoring error" value={host.MONITORING?.ERROR} />
        </Section>
      )}
      {tab === 6 && (
        <Section title="Host events">
          <Alert severity="info">
            Event history is unavailable because the authoritative host-event
            API did not return an event stream for this host.
          </Alert>
        </Section>
      )}
    </PageFrame>
  )
}

export default HostDetail
