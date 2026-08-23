/**
 * Operational data table.
 *
 * Numeric columns are right-aligned and rendered through `Amount`, which carries
 * tabular figures. Column boundaries that carry meaning use the strong border; the
 * subtle border is decorative only.
 */

import type { ReactElement, ReactNode } from 'react';

import { color, density } from '../../theme';
import { EmptyState, ErrorState, LoadingState } from '../primitives';

export interface Column<Row> {
  readonly key: string;
  readonly header: string;
  readonly numeric?: boolean;
  readonly render: (row: Row) => ReactNode;
}

export type TableStatus = 'ready' | 'loading' | 'error';

export function DataTable<Row extends { id: string }>({
  caption,
  columns,
  rows,
  status = 'ready',
  emptyTitle = 'Nothing to show',
  emptyActionLabel = 'Clear filters',
}: {
  caption: string;
  columns: readonly Column<Row>[];
  rows: readonly Row[];
  status?: TableStatus;
  emptyTitle?: string;
  emptyActionLabel?: string;
}): ReactElement {
  if (status === 'loading') return <LoadingState label={`Loading ${caption.toLowerCase()}`} />;
  if (status === 'error') return <ErrorState title={`Could not load ${caption.toLowerCase()}`} />;
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} actionLabel={emptyActionLabel} />;
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table
        style={{ borderCollapse: 'collapse', width: '100%', color: color.text.primary }}
      >
        <caption
          style={{
            textAlign: 'left',
            padding: `${density.cellPaddingY}px ${density.cellPaddingX}px`,
            color: color.text.secondary,
          }}
        >
          {caption}
        </caption>
        <thead>
          <tr style={{ backgroundColor: color.bg.sunken }}>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                style={{
                  textAlign: column.numeric ? 'right' : 'left',
                  padding: `${density.cellPaddingY}px ${density.cellPaddingX}px`,
                  borderBottom: `1px solid ${color.border.strong}`,
                  fontWeight: 600,
                }}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} data-testid={`row-${row.id}`} style={{ height: density.rowHeight }}>
              {columns.map((column) => (
                <td
                  key={column.key}
                  style={{
                    textAlign: column.numeric ? 'right' : 'left',
                    padding: `${density.cellPaddingY}px ${density.cellPaddingX}px`,
                    borderBottom: `1px solid ${color.border.subtle}`,
                  }}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
