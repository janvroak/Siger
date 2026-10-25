"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { ReactNode, useMemo, useState } from "react";

import { cn } from "@/components/ui/Button";

export type Column<Row> = {
  key: string;
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  /** Present when the column can be sorted. Nulls always sort last. */
  sortValue?: (row: Row) => string | number | null;
  align?: "left" | "right";
  className?: string;
};

/**
 * Data table: sticky header, subtle row hover, optional client-side sorting.
 * Rows keep the server's order until a header is clicked.
 */
export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  rowClassName,
  caption,
  maxHeight,
}: {
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  rowClassName?: (row: Row) => string | undefined;
  caption?: string;
  /** Scroll inside the card past this height (keeps the header sticky). */
  maxHeight?: string;
}) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);

  const sorted = useMemo(() => {
    const column = sort && columns.find((c) => c.key === sort.key);
    if (!column?.sortValue || !sort) {
      return rows;
    }
    const value = column.sortValue;
    return [...rows].sort((a, b) => {
      const x = value(a);
      const y = value(b);
      if (x === null && y === null) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [rows, columns, sort]);

  function toggle(key: string) {
    setSort((current) =>
      current?.key !== key ? { key, dir: 1 } : current.dir === 1 ? { key, dir: -1 } : null,
    );
  }

  return (
    <div className="overflow-auto" style={{ maxHeight }}>
      <table className="w-full border-separate border-spacing-0 text-left text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((column) => {
              const active = sort?.key === column.key;
              const right = column.align === "right";
              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={active ? (sort!.dir === 1 ? "ascending" : "descending") : undefined}
                  className={cn(
                    "sticky top-0 z-[1] border-b border-line bg-surface-2 px-4 py-2.5 text-xs font-medium whitespace-nowrap text-muted first:rounded-tl-lg last:rounded-tr-lg",
                    right && "text-right",
                    column.className,
                  )}
                >
                  {column.sortValue ? (
                    <button
                      type="button"
                      onClick={() => toggle(column.key)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded transition-colors hover:text-fg",
                        active && "text-fg",
                        right && "flex-row-reverse",
                      )}
                    >
                      {column.header}
                      {active ? (
                        sort!.dir === 1 ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />
                      ) : (
                        <ChevronsUpDown size={12} className="opacity-50" aria-hidden />
                      )}
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr
              key={rowKey(row)}
              className={cn("group transition-colors hover:bg-surface-2/70", rowClassName?.(row))}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    "border-b border-line px-4 py-3 align-middle group-last:border-b-0",
                    column.align === "right" && "text-right",
                    column.className,
                  )}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
