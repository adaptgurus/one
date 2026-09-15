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
/* eslint-disable react/prop-types */
import { List, ResourceContainer, Table } from '@ComponentsModule'
import { DetailsDrawer } from '@modules/containers/Backups/Details'
import { RESOURCE_NAMES, TABLE_VIEW_MODE, T } from '@ConstantsModule'
import {
  ImageAPI,
  useFunctionality,
  useFunctionalityApi,
  useGeneral,
  useViews,
} from '@FeaturesModule'
import {
  getBackupRunningVms,
  getImageState,
  getImageType,
  imageTable,
} from '@ModelsModule'
import { prettyBytes, timeFromMilliseconds } from '@UtilsModule'
import { ReactElement, useCallback, useMemo } from 'react'
import { Backups as BackupsResource } from '@ResourcesModule'

/**
 * Displays a list of Backups with a split pane between the list and selected row(s).
 *
 * @returns {ReactElement} Backups list and selected row(s)
 */
export function Backups() {
  const { zone } = useGeneral()
  const {
    searchExpression,
    sortExpression,
    filterExpression,
    selectedItems,
    containerView,
  } = useFunctionality()

  const { getResourceView, view } = useViews()
  const isCloud = view === 'cloud'

  const tableColumns = useMemo(() => {
    const columns = imageTable.columns()
    if (!isCloud) return columns

    const hidden = new Set(['type', 'datastore', 'owner', 'group'])

    return columns
      .filter(({ id, accessorKey }) => !hidden.has(id ?? accessorKey))
      .map((column) =>
        column.id === 'name'
          ? { ...column, cell: ({ row }) => row.original?.NAME }
          : column
      )
  }, [isCloud])
  const resourceView = getResourceView(RESOURCE_NAMES.BACKUP)
  const availableActions = useMemo(
    () => resourceView?.actions ?? {},
    [resourceView?.actions]
  )

  const { setSelectedItems } = useFunctionalityApi()

  const {
    data = [],
    isFetching: isRefreshing,
    refetch: refresh,
  } = ImageAPI.useGetBackupsQuery({ zone })

  const filterOptions = useMemo(
    () => imageTable.filterOptions(data, resourceView?.filters, tableColumns),
    [data, resourceView?.filters, tableColumns]
  )

  const items = useMemo(() => {
    const search = String(searchExpression ?? '').toLowerCase()
    const filteredData = search
      ? data?.filter((backup) => {
          const {
            ID,
            NAME,
            UNAME,
            GNAME,
            REGTIME,
            PERSISTENT,
            DATASTORE,
            SIZE,
          } = backup
          const state = getImageState(backup)
          const type = getImageType(backup)

          return [
            ID,
            NAME,
            !isCloud && DATASTORE,
            !isCloud && type,
            state?.name,
            !isCloud && UNAME,
            !isCloud && GNAME,
            +PERSISTENT ? T.Persistent : T.NonPersistent,
            getBackupRunningVms(backup),
            prettyBytes(+SIZE || 0, 'MB'),
            REGTIME && timeFromMilliseconds(+REGTIME).toRelative(),
          ]
            .filter((value) => value || value === 0)
            .some((value) => String(value).toLowerCase().includes(search))
        })
      : data

    const filteredByFilters = imageTable.filterData(
      filteredData,
      filterExpression,
      filterOptions
    )

    return imageTable.sortData(filteredByFilters, sortExpression, tableColumns)
  }, [
    data,
    searchExpression,
    sortExpression,
    filterExpression,
    filterOptions,
    isCloud,
    tableColumns,
  ])

  const selectedData = useMemo(
    () => items?.filter(({ ID }) => selectedItems?.includes(ID)) ?? [],
    [items, selectedItems]
  )

  const rowSelection = useMemo(
    () => Object.fromEntries(selectedItems.map((id) => [id, true])),
    [selectedItems]
  )
  const handleClose = () => setSelectedItems([])
  const handleSelect = (ID) =>
    setSelectedItems(
      selectedItems?.length === 1 && selectedItems?.[0] === ID ? [] : [ID]
    )
  const handleDeselect = (ID) =>
    setSelectedItems(selectedItems.filter((id) => id !== ID))

  const handleRowSelectionChange = useCallback(
    (updater) => {
      const next =
        typeof updater === 'function' ? updater(rowSelection) : updater
      setSelectedItems(Object.keys(next).filter((id) => next[id]))
    },
    [rowSelection, setSelectedItems]
  )

  return (
    <ResourceContainer
      resourceName={T.Backups}
      onRefresh={refresh}
      isRefreshing={isRefreshing}
      sortOptions={imageTable.sortOptions(tableColumns)}
      filterOptions={filterOptions}
      searchPlaceholder={T.SearchBackups ?? T.Search}
      count={items?.length}
      selectedCount={selectedItems?.length}
      onSelectAll={(checked) =>
        setSelectedItems(checked ? items?.map(({ ID }) => ID) : [])
      }
    >
      {(() => {
        switch (containerView) {
          case TABLE_VIEW_MODE.LIST:
            return (
              <Table
                columns={tableColumns}
                data={items}
                isLoading={isRefreshing}
                isRowsSelectable
                isMultiRowSelection
                isCopyColumn
                rowSelection={rowSelection}
                onRowSelectionChange={handleRowSelectionChange}
                getRowId={(row) => row.ID}
                onRowClick={(row) => handleSelect(row.ID)}
                size="medium"
                defaultPageSize={25}
                isFullHeight
              />
            )
          case TABLE_VIEW_MODE.CARD:
          default:
            return (
              <List isRowIndicatorDisabled={true} isLoading={isRefreshing}>
                {items?.map((backup) => (
                  <BackupsResource.Card
                    key={backup?.ID}
                    data={backup}
                    isSelected={selectedItems?.includes(backup?.ID)}
                    onCheck={() =>
                      setSelectedItems(
                        selectedItems?.includes(backup?.ID)
                          ? selectedItems.filter((id) => id !== backup?.ID)
                          : [...(selectedItems ?? []), backup?.ID]
                      )
                    }
                    onClick={() => handleSelect(backup?.ID)}
                  />
                ))}
              </List>
            )
        }
      })()}
      <DetailsDrawer
        selectedData={selectedData}
        handleClose={handleClose}
        handleSelect={handleSelect}
        handleDeselect={handleDeselect}
        availableActions={availableActions}
      />
    </ResourceContainer>
  )
}
