"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown, Download, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { matchesSearch } from "@/lib/search";
import { EmptyState } from "./empty-state";
import { exportCSV, exportExcel } from "./export";

export type ExportDef<T> = { header: string; value: (row: T) => unknown }[];

type Props<T> = {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  searchPlaceholder?: string;
  /** Texto pesquisável por linha (padrão: todos os valores). */
  searchText?: (row: T) => string;
  initialSearch?: string;
  toolbar?: React.ReactNode;
  exportDef?: ExportDef<T>;
  exportName?: string;
  onRowClick?: (row: T) => void;
  rowHref?: (row: T) => string;
  pageSize?: number;
  empty?: React.ReactNode;
  rowClassName?: (row: T) => string | undefined;
};

export function DataTable<T>({
  columns,
  data,
  searchPlaceholder = "Buscar…",
  searchText,
  initialSearch = "",
  toolbar,
  exportDef,
  exportName = "exportacao",
  onRowClick,
  rowHref,
  pageSize = 20,
  empty,
  rowClassName,
}: Props<T>) {
  const router = useRouter();
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = React.useState(initialSearch);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, _col, value: string) => matchesSearch(searchText ? searchText(row.original) : JSON.stringify(row.original), String(value ?? "")),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  const filteredRows = table.getFilteredRowModel().rows.map((r) => r.original);
  const { pageIndex } = table.getState().pagination;
  const pageCount = table.getPageCount();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={globalFilter}
            onChange={(e) => {
              setGlobalFilter(e.target.value);
              table.setPageIndex(0);
            }}
            placeholder={searchPlaceholder}
            className="h-9 rounded-xl pl-9"
          />
        </div>
        <div className="flex flex-1 flex-wrap items-center gap-2">{toolbar}</div>
        {exportDef && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="lg" className="rounded-xl">
                <Download /> Exportar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => exportExcel(filteredRows, exportDef, exportName)}>
                Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => exportCSV(filteredRows, exportDef, exportName)}>CSV</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card shadow-soft">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id} className="hover:bg-transparent">
                  {hg.headers.map((header) => {
                    const sortable = header.column.getCanSort();
                    const sorted = header.column.getIsSorted();
                    return (
                      <TableHead
                        key={header.id}
                        className={cn("h-10 bg-muted/40 text-xs font-medium text-muted-foreground", (header.column.columnDef.meta as { className?: string })?.className)}
                      >
                        {header.isPlaceholder ? null : sortable ? (
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className="inline-flex items-center gap-1 hover:text-foreground"
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {sorted === "asc" ? (
                              <ArrowUp className="size-3" />
                            ) : sorted === "desc" ? (
                              <ArrowDown className="size-3" />
                            ) : (
                              <ChevronsUpDown className="size-3 opacity-40" />
                            )}
                          </button>
                        ) : (
                          flexRender(header.column.columnDef.header, header.getContext())
                        )}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => {
                  const href = rowHref?.(row.original);
                  const clickable = !!href || !!onRowClick;
                  return (
                    <TableRow
                      key={row.id}
                      className={cn(clickable && "cursor-pointer", rowClassName?.(row.original))}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest("a,button,input,[role=menuitem]")) return;
                        if (onRowClick) onRowClick(row.original);
                        else if (href) router.push(href);
                      }}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          className={cn("py-2.5", (cell.column.columnDef.meta as { className?: string })?.className)}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })
              ) : (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={columns.length}>
                    {empty ?? (
                      <EmptyState
                        title={globalFilter ? "Nenhum resultado" : "Nada cadastrado ainda"}
                        description={globalFilter ? "Tente outro termo de busca ou limpe os filtros." : undefined}
                      />
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {filteredRows.length} {filteredRows.length === 1 ? "registro" : "registros"}
        </span>
        {pageCount > 1 && (
          <div className="flex items-center gap-2">
            <span>
              Página {pageIndex + 1} de {pageCount}
            </span>
            <Button variant="outline" size="icon" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
              <ChevronLeft />
            </Button>
            <Button variant="outline" size="icon" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
              <ChevronRight />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
