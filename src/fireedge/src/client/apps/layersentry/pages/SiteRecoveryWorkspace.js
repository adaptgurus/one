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
import { Alert, Box, Button, Typography } from '@mui/material'
import { useHistory } from 'react-router-dom'
import { DatastoreAPI, VrAPI, ZoneAPI, useViews } from '@FeaturesModule'
import {
  MetricCard,
  PageFrame,
  SectionHeader,
  Surface,
} from 'client/apps/layersentry/components/Primitives'
import { PRODUCT_PATHS } from 'client/apps/layersentry/navigation'
import { colors } from 'client/apps/layersentry/theme/tokens'
import ProtectionDomainPanel from 'client/apps/layersentry/components/ProtectionDomainPanel'
import RemoteSitePanel from 'client/apps/layersentry/components/RemoteSitePanel'

const toArray = (value) => (Array.isArray(value) ? value : value ? [value] : [])

const isBackupDatastore = (datastore = {}) =>
  String(datastore?.TYPE) === '3' ||
  String(datastore?.TYPE_STRING ?? '')
    .toLowerCase()
    .includes('backup')

const isCephDatastore = (datastore = {}) => {
  const template = datastore?.TEMPLATE ?? {}
  const values = [
    datastore?.DS_MAD,
    datastore?.TM_MAD,
    template?.DS_MAD,
    template?.TM_MAD,
    template?.STORAGE_BACKEND,
  ]

  return values.some((value) =>
    String(value ?? '')
      .toLowerCase()
      .includes('ceph')
  )
}

const SiteRecoveryWorkspace = () => {
  const history = useHistory()
  const { view } = useViews()
  const isAdmin = view === 'admin'
  const zonesQuery = ZoneAPI.useGetZonesQuery(undefined, { skip: !isAdmin })
  const datastoresQuery = DatastoreAPI.useGetDatastoresQuery(undefined, {
    skip: !isAdmin,
  })
  const routersQuery = VrAPI.useGetVrsQuery()
  const zones = toArray(zonesQuery.data)
  const datastores = toArray(datastoresQuery.data)
  const routers = toArray(routersQuery.data)
  const backupDatastores = datastores.filter(isBackupDatastore)
  const cephDatastores = datastores.filter(isCephDatastore)
  const hasMultipleSites = zones.length > 1
  const hasCeph = cephDatastores.length > 0
  const evidenceReady = isAdmin && hasMultipleSites && hasCeph

  return (
    <PageFrame
      title="Site Recovery / DR"
      description="Disaster-recovery readiness for the OpenNebula cloud. Real failover and failback stay disabled until the selected recovery architecture is qualified."
    >
      <Alert severity={evidenceReady ? 'info' : 'warning'} sx={{ mt: 2 }}>
        {isAdmin && evidenceReady
          ? 'Multiple zones and Ceph-backed storage are visible, but Ceph RBD mirroring state and failover/failback are not exposed by the current FireEdge API. Treat DR as not qualified until runtime evidence is bound.'
          : isAdmin
          ? 'DR is not configured in this lab. OpenNebula DR requires a qualified recovery architecture; the current VM protection request metadata does not activate replication or failover.'
          : 'Site Recovery is provider-managed. A protection request is not proof that replication, failover or failback is active. LayerSentry will show an active DR state only when the provider publishes verified runtime evidence.'}
      </Alert>
      {isAdmin && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, 1fr)',
              xl: 'repeat(4, 1fr)',
            },
            gap: 1.5,
            mt: 2,
          }}
        >
          <MetricCard
            label="Sites / Zones"
            value={zonesQuery.isLoading ? '…' : zones.length}
            detail={
              hasMultipleSites
                ? 'Multiple sites visible'
                : 'A second recovery site is required'
            }
          />
          <MetricCard
            label="Ceph RBD Stores"
            value={datastoresQuery.isLoading ? '…' : cephDatastores.length}
            detail={
              hasCeph
                ? 'Ceph storage visible'
                : 'No Ceph RBD datastore detected'
            }
            accent={hasCeph ? colors.status.success : colors.status.warning}
          />
          <MetricCard
            label="Backup Stores"
            value={datastoresQuery.isLoading ? '…' : backupDatastores.length}
            detail="Backup storage is separate from DR mirroring"
          />
          <MetricCard
            label="Virtual Routers"
            value={routersQuery.isLoading ? '…' : routers.length}
            detail="Recovery networking / HA endpoint resources"
            accent={colors.network}
          />
        </Box>
      )}

      <Box sx={{ mt: 2, display: 'grid', gap: 2 }}>
        <RemoteSitePanel isAdmin={isAdmin} />
        <ProtectionDomainPanel isAdmin={isAdmin} />
      </Box>

      <Surface sx={{ mt: 2, p: 2.5 }}>
        <SectionHeader
          title="Recovery workflow boundary"
          description="LayerSentry will only enable destructive DR controls after the actual replication and fencing backend is integrated and live-qualified."
        />
        <Box sx={{ display: 'grid', gap: 1 }}>
          {[
            [
              'Replication',
              'Ceph RBD mirroring or another explicitly qualified replication backend.',
            ],
            [
              'Failover',
              'Promote the recovery copy, recover networking and start protected workloads at the recovery site.',
            ],
            [
              'Failback',
              'Resynchronize safely, reverse the recovery direction and return workloads to the primary site.',
            ],
            [
              'Testing',
              'Use an isolated recovery-test network and record RPO/RTO evidence before production certification.',
            ],
          ].map(([title, text]) => (
            <Box
              key={title}
              sx={{ py: 1, borderBottom: `1px solid ${colors.border}` }}
            >
              <Typography sx={{ fontSize: 13, fontWeight: 750 }}>
                {title}
              </Typography>
              <Typography
                sx={{ mt: 0.25, fontSize: 12, color: colors.text.secondary }}
              >
                {text}
              </Typography>
            </Box>
          ))}
        </Box>
      </Surface>

      {isAdmin && (
        <Surface sx={{ mt: 2, p: 2.5 }}>
          <SectionHeader
            title="Configure prerequisites"
            description="These pages expose the underlying OpenNebula resources. They do not by themselves certify DR."
          />
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            <Button
              variant="outlined"
              onClick={() => history.push(PRODUCT_PATHS.INFRA_ZONES)}
              sx={{ textTransform: 'none' }}
            >
              Zones / Sites
            </Button>
            <Button
              variant="outlined"
              onClick={() => history.push(PRODUCT_PATHS.INFRA_STORAGE)}
              sx={{ textTransform: 'none' }}
            >
              Storage Pools
            </Button>
            <Button
              variant="outlined"
              onClick={() => history.push(PRODUCT_PATHS.INFRA_BACKUP_STORAGE)}
              sx={{ textTransform: 'none' }}
            >
              Backup Storage
            </Button>
            <Button
              variant="outlined"
              onClick={() => history.push(PRODUCT_PATHS.NETWORK_ROUTERS)}
              sx={{ textTransform: 'none' }}
            >
              Virtual Routers
            </Button>
          </Box>
        </Surface>
      )}
    </PageFrame>
  )
}

export default SiteRecoveryWorkspace
