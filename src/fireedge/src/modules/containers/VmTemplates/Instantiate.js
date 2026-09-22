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
import { debounce } from 'lodash'
import { ReactElement, useEffect } from 'react'
import { useStore } from 'react-redux'
import { Redirect, useHistory, useLocation } from 'react-router'

import {
  GroupAPI,
  useGeneralApi,
  UserAPI,
  useSystemData,
  useViews,
  VmTemplateAPI,
  VnAPI,
} from '@FeaturesModule'

import { DefaultFormStepper, SkeletonStepsForm } from '@ComponentsModule'
import { VmTemplate } from '@ResourcesModule'

import {
  jsonToXml,
  filterTemplateData,
  applyLayerSentryCloudResources,
  applyLayerSentryVmDefaults,
  hasTemplateId,
  normalizeProtectionRequest,
  resolvePublishedGpuRequest,
  transformActionsInstantiate,
} from '@UtilsModule'

import { RESOURCE_NAMES, T, TAB_FORM_MAP, PATH } from '@ConstantsModule'

const _ = require('lodash')
const GPU_REQUEST_ERROR = 'LayerSentry published GPU request is no longer valid'

/**
 * Displays the instantiation form for a VM Template.
 *
 * @returns {ReactElement} Instantiation form
 */
export function InstantiateVmTemplate() {
  useEffect(() => {
    resetFieldPath()
    resetModifiedFields()
  }, [])

  const store = useStore()
  const history = useHistory()
  const location = useLocation()
  const { ID: stateTemplateId, NAME: stateTemplateName } = location.state ?? {}
  const queryTemplateId = new URLSearchParams(location.search).get('template')
  const templateId = hasTemplateId(stateTemplateId)
    ? stateTemplateId
    : queryTemplateId
  const templateName = stateTemplateName
  const { enqueueError, enqueueInfo, resetFieldPath, resetModifiedFields } =
    useGeneralApi()
  const [instantiate] = VmTemplateAPI.useInstantiateTemplateMutation()
  const [getVNetwork] = VnAPI.useLazyGetVNetworkQuery()
  const { adminGroup, oneConfig } = useSystemData()

  const { data: apiTemplateDataExtended, isError } =
    VmTemplateAPI.useGetTemplateQuery(
      { id: templateId, extended: true },
      { skip: !hasTemplateId(templateId) }
    )

  const { data: apiTemplateData } = VmTemplateAPI.useGetTemplateQuery(
    { id: templateId, extended: false },
    { skip: !hasTemplateId(templateId) }
  )

  const dataTemplateExtended = _.cloneDeep(apiTemplateDataExtended)

  UserAPI.useGetUsersQuery(undefined, { refetchOnMountOrArgChange: false })
  GroupAPI.useGetGroupsQuery(undefined, { refetchOnMountOrArgChange: false })

  const { getResourceView, view } = useViews()
  const resource = RESOURCE_NAMES.VM_TEMPLATE
  const { features } = getResourceView(resource)

  const onSubmit = async (templates) => {
    try {
      const currentState = store.getState()
      const modifiedFields = currentState.general?.modifiedFields

      await Promise.all(
        templates.map(async (rawTemplate) => {
          const existingTemplate = {
            ...apiTemplateData?.TEMPLATE,
          }

          let filteredTemplate = filterTemplateData(
            rawTemplate,
            modifiedFields,
            existingTemplate,
            TAB_FORM_MAP,
            {
              instantiate: true,
            }
          )

          if (view === 'cloud') {
            filteredTemplate = applyLayerSentryVmDefaults(
              filteredTemplate,
              rawTemplate?.access,
              apiTemplateData
            )

            const selectedNetwork = await getVNetwork({
              id: rawTemplate?.resources?.networkId,
            }).unwrap()
            const storageIopsSupported =
              String(
                apiTemplateData?.TEMPLATE?.LAYERSENTRY_STORAGE_IOPS_QOS ?? ''
              )
                .trim()
                .toUpperCase() === 'YES'

            filteredTemplate = applyLayerSentryCloudResources(
              filteredTemplate,
              rawTemplate?.resources,
              {
                storageIopsSupported,
                sourceTemplate: apiTemplateData,
                network: selectedNetwork,
              }
            )

            // Catalog metadata belongs to the source VM template, not the
            // resulting VM instance. Never carry physical-address-like data
            // from a browser request into PCI constraints.
            delete filteredTemplate.LAYERSENTRY_GPU_PROFILES
            delete filteredTemplate.LAYERSENTRY_GPU_REQUEST

            const services = rawTemplate?.services ?? {}
            const gpuRequest = resolvePublishedGpuRequest(
              services?.LAYERSENTRY_GPU_REQUEST,
              apiTemplateData?.TEMPLATE
            )

            if (!gpuRequest.valid) throw new Error(GPU_REQUEST_ERROR)
            if (gpuRequest.requested) {
              const existingPci = filteredTemplate.PCI
                ? [].concat(filteredTemplate.PCI)
                : []

              filteredTemplate.PCI = [...existingPci, ...gpuRequest.pci]
              filteredTemplate.LAYERSENTRY_GPU_REQUEST = {
                PROFILE_ID: gpuRequest.profileId,
                COUNT: String(gpuRequest.count),
                SOURCE: 'PUBLISHED_TEMPLATE_PROFILE',
              }
            }

            const protection = normalizeProtectionRequest({
              ENABLED: services.backupEnabled || services.drEnabled,
              DC_RETENTION_MODE: 'COUNT',
              DC_RETENTION_POINTS: services.restorePoints ?? 7,
              COPY_INTERVAL_MINUTES: 60,
              DR_ENABLED: services.drEnabled,
              DR_RETENTION_MODE: 'COUNT',
              DR_RETENTION_POINTS: 30,
              DR_IP_MODE: 'KEEP',
            })

            if (protection?.ENABLED === 'YES') {
              filteredTemplate.LAYERSENTRY_PROTECTION = protection
            } else {
              delete filteredTemplate.LAYERSENTRY_PROTECTION
            }
          }

          transformActionsInstantiate(
            filteredTemplate,
            apiTemplateData,
            features
          )

          const xmlFinal = jsonToXml(filteredTemplate)
          const requestTemplate = { ...rawTemplate, template: xmlFinal }
          delete requestTemplate.access
          delete requestTemplate.resources
          delete requestTemplate.services

          return instantiate(requestTemplate).unwrap()
        })
      )

      resetFieldPath()
      resetModifiedFields()

      history.push(PATH.INSTANCE.VMS.LIST)

      const total = templates.length
      const resolvedTemplateName = templateName ?? apiTemplateData?.NAME ?? ''
      const templateInfo = `#${templateId} ${resolvedTemplateName}`.trim()
      enqueueInfo(T.InfoVMTemplateInstantiated, [total, templateInfo])
    } catch (error) {
      if (error?.message === GPU_REQUEST_ERROR) {
        enqueueError(
          'The selected GPU profile is no longer available or the requested count exceeds its published limit.'
        )
      } else {
        enqueueError(
          error?.data?.message ??
            error?.message ??
            'LayerSentry could not create the virtual machine.'
        )
      }
    }
  }

  if (!hasTemplateId(templateId) || isError) {
    return <Redirect to={PATH.TEMPLATE.VMS.LIST} />
  }

  return (
    <>
      {!dataTemplateExtended || !apiTemplateData || _.isEmpty(oneConfig) ? (
        <SkeletonStepsForm />
      ) : (
        <VmTemplate.Forms.InstantiateForm
          initialValues={dataTemplateExtended}
          stepProps={{
            dataTemplateExtended,
            oneConfig,
            adminGroup,
            features,
            view,
          }}
          onSubmit={debounce(onSubmit, 500)}
          fallback={<SkeletonStepsForm />}
        >
          {(config) => <DefaultFormStepper {...config} />}
        </VmTemplate.Forms.InstantiateForm>
      )}
    </>
  )
}
