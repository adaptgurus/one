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
import { Button } from '@mui/material'
import { Plus } from 'iconoir-react'
import { useHistory } from 'react-router-dom'
import ResourceBridge from 'client/apps/layersentry/components/ResourceBridge'
import {
  CAPABILITY_IDS,
  getCapabilityModel,
  isCapabilityEnabled,
} from 'client/apps/layersentry/capabilities'
import {
  PageFrame,
  Surface,
} from 'client/apps/layersentry/components/Primitives'
import { PRODUCT_PATHS } from 'client/apps/layersentry/navigation'

const KubernetesWorkspace = ({ endpoints }) => {
  const history = useHistory()
  const canCreate = isCapabilityEnabled(
    CAPABILITY_IDS.KUBERNETES_CREATE,
    getCapabilityModel()
  )

  return (
    <PageFrame
      title="Kubernetes"
      description="View qualified OneKS clusters. Create and Day-2 actions appear only when their individual production paths are qualified."
      actions={
        canCreate ? (
          <Button
            variant="contained"
            startIcon={<Plus width={17} height={17} />}
            onClick={() => history.push(PRODUCT_PATHS.KUBERNETES_CREATE)}
            sx={{ textTransform: 'none' }}
          >
            Create cluster
          </Button>
        ) : null
      }
    >
      <Surface sx={{ mt: 2, p: 2 }}>
        <ResourceBridge endpoints={endpoints} legacyPath="/kubernetes" />
      </Surface>
    </PageFrame>
  )
}

KubernetesWorkspace.propTypes = {
  endpoints: PropTypes.arrayOf(PropTypes.object),
}
KubernetesWorkspace.defaultProps = { endpoints: [] }
export default KubernetesWorkspace
