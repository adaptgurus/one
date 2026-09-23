/* SPDX-License-Identifier: Apache-2.0 */
import React from 'react'
import {
  Box,
  Button as MuiButton,
  Chip,
  IconButton,
  Table as MuiTable,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'

export const Button = ({
  iconOnly,
  type,
  title,
  onClick,
  isDisabled,
  startIcon,
  children,
}) =>
  iconOnly ? (
    <IconButton aria-label={title || 'button'} onClick={onClick}>
      {iconOnly}
    </IconButton>
  ) : (
    <MuiButton
      variant={type === 'primary' ? 'contained' : 'outlined'}
      color="primary"
      onClick={onClick}
      disabled={Boolean(isDisabled)}
      startIcon={startIcon}
    >
      {children}
    </MuiButton>
  )

export const Image = ({ alt }) => (
  <Box
    role="img"
    aria-label={alt || 'image'}
    sx={{ width: 24, height: 24, borderRadius: 1, bgcolor: 'grey.100' }}
  />
)

export const StatusTag = ({ statusName }) => (
  <Chip size="small" label={statusName} />
)

export const Tag = ({ title }) => <Chip size="small" label={title} />

export const Text = ({ value, variant, weight }) => (
  <Typography variant={variant || 'body1'} fontWeight={weight}>
    {value}
  </Typography>
)

export const Table = ({
  columns = [],
  data = [],
  onRowClick,
  isEnableSearchBar,
  searchPlaceholder,
}) => (
  <Box>
    {isEnableSearchBar && (
      <TextField
        size="small"
        fullWidth
        placeholder={searchPlaceholder || 'Search'}
        sx={{ mb: 1.5 }}
      />
    )}
    <MuiTable size="small">
      <TableHead>
        <TableRow>
          {columns.map((column) => (
            <TableCell key={String(column.id || column.accessorKey || column.header)}>
              {column.header}
            </TableCell>
          ))}
        </TableRow>
      </TableHead>
      <TableBody>
        {data.map((item) => (
          <TableRow
            hover
            key={item.ID}
            data-testid={'row-' + item.ID}
            onClick={() => onRowClick?.(item)}
            sx={{ cursor: onRowClick ? 'pointer' : 'default' }}
          >
            {columns.map((column) => {
              const key = String(column.id || column.accessorKey || column.header)
              let value
              if (column.cell) value = column.cell({ row: { original: item } })
              else if (column.accessorFn) value = column.accessorFn(item)
              else value = item[column.accessorKey]

              return <TableCell key={key}>{value}</TableCell>
            })}
          </TableRow>
        ))}
      </TableBody>
    </MuiTable>
  </Box>
)
