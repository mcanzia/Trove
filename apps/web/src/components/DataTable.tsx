import { useState } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  getFilteredRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
  type ColumnFiltersState,
} from '@tanstack/react-table'
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, SearchX } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmptyState } from '@/components/ui/EmptyState'

interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[]
  data: TData[]
  globalFilter?: string
}

export function DataTable<TData>({ columns, data, globalFilter }: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})

  // eslint-disable-next-line react-hooks/incompatible-library -- informational: React Compiler (not enabled here) would skip memoizing this component
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    globalFilterFn: 'includesString',
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      globalFilter,
    },
    initialState: {
      pagination: { pageSize: 50 },
    },
  })

  const filteredCount = table.getFilteredRowModel().rows.length
  const pageSize = table.getState().pagination.pageSize
  const pageIndex = table.getState().pagination.pageIndex
  const rangeStart = filteredCount === 0 ? 0 : pageIndex * pageSize + 1
  const rangeEnd = Math.min((pageIndex + 1) * pageSize, filteredCount)

  // Mobile (stacked-card) helpers — see the sm:hidden block below.
  const rows = table.getRowModel().rows
  const headerByColId = Object.fromEntries(table.getFlatHeaders().map((h) => [h.column.id, h]))
  const sortableColumns = table.getAllColumns().filter((c) => c.getCanSort() && c.getIsVisible())
  const colLabel = (c: (typeof sortableColumns)[number]) =>
    typeof c.columnDef.header === 'string' ? c.columnDef.header : c.id
  const activeSort = sorting[0]

  return (
    <div className="space-y-4">
      {/* Desktop / tablet: the full table (horizontally scrollable if wide) */}
      <div className="hidden sm:block rounded-xl border bg-card overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="bg-muted/40 hover:bg-muted/40">
                  {headerGroup.headers.map((header) => {
                    const sorted = header.column.getIsSorted()
                    return (
                      <TableHead
                        key={header.id}
                        className={`px-3 text-xs font-medium uppercase tracking-wider ${
                          sorted ? 'text-foreground' : 'text-muted-foreground'
                        }`}
                        style={header.column.columnDef.size ? { width: header.column.columnDef.size, minWidth: header.column.columnDef.size } : undefined}
                      >
                        {header.isPlaceholder ? null : (
                          <button
                            className={
                              header.column.getCanSort()
                                ? 'flex items-center gap-1 cursor-pointer select-none hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm'
                                : 'flex items-center gap-1'
                            }
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {header.column.getCanSort() && (
                              sorted === 'asc'
                                ? <ArrowUp size={12} className="text-foreground" />
                                : sorted === 'desc'
                                  ? <ArrowDown size={12} className="text-foreground" />
                                  : <ArrowUpDown size={12} className="opacity-50" />
                            )}
                          </button>
                        )}
                      </TableHead>
                    )
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className="border-border/60 hover:bg-accent/40 transition-colors"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className="px-3 py-2.5"
                        style={cell.column.columnDef.size ? { width: cell.column.columnDef.size, minWidth: cell.column.columnDef.size } : undefined}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={columns.length} className="p-0">
                    <EmptyState
                      icon={SearchX}
                      title="No results"
                      description="Try a different search or filter."
                    />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Mobile: stacked cards + a sort control (the wide table is hard to read at phone width) */}
      <div className="sm:hidden">
        {rows.length > 0 && sortableColumns.length > 0 && (
          <div className="mb-3 flex items-center gap-2">
            <label htmlFor="mobile-sort" className="shrink-0 text-xs text-muted-foreground">Sort by</label>
            <select
              id="mobile-sort"
              value={activeSort?.id ?? ''}
              onChange={(e) =>
                setSorting(e.target.value ? [{ id: e.target.value, desc: activeSort?.desc ?? false }] : [])
              }
              className="min-w-0 flex-1 rounded-lg border bg-card px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Default</option>
              {sortableColumns.map((c) => (
                <option key={c.id} value={c.id}>{colLabel(c)}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => activeSort && setSorting([{ id: activeSort.id, desc: !activeSort.desc }])}
              disabled={!activeSort}
              aria-label="Toggle sort direction"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {activeSort?.desc ? <ArrowDown size={16} /> : <ArrowUp size={16} />}
            </button>
          </div>
        )}

        {rows.length ? (
          <div className="space-y-3">
            {rows.map((row) => (
              <div key={row.id} className="rounded-xl border bg-card p-3.5 shadow-xs divide-y divide-border/50">
                {row.getVisibleCells().map((cell) => {
                  const h = headerByColId[cell.column.id]
                  return (
                    <div key={cell.id} className="py-2 first:pt-0 last:pb-0">
                      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        {h && !h.isPlaceholder ? flexRender(h.column.columnDef.header, h.getContext()) : null}
                      </div>
                      <div className="mt-0.5 text-sm break-words">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border bg-card">
            <EmptyState icon={SearchX} title="No results" description="Try a different search or filter." />
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span className="tabular-nums">
          {rangeStart}–{rangeEnd} of {filteredCount}
          {globalFilter ? ` matching "${globalFilter}"` : ''}
        </span>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="Previous page"
              className="flex h-8 w-8 items-center justify-center rounded-lg border hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label="Next page"
              className="flex h-8 w-8 items-center justify-center rounded-lg border hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <select
            value={table.getState().pagination.pageSize}
            onChange={(e) => table.setPageSize(Number(e.target.value))}
            aria-label="Rows per page"
            className="rounded-lg border bg-card pl-3 pr-8 py-1.5 text-sm cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {[25, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size} / page
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}
