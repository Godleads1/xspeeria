import type { ReactElement } from 'react';
import { AppShell } from '../components/shell/AppShell';
import { Amount, Panel, StatusChip } from '../components/primitives';
import { DataTable, type Column } from '../components/table/DataTable';
import { SETTLEMENT_ROWS, type SettlementRow } from '../fixtures';

/**
 * Overview shell.
 *
 * Read-only. No ADR-001 ADMIN transition, no settlement action, no KYC decision and no
 * reconciliation behaviour is implemented — those are later milestones.
 */
const columns: readonly Column<SettlementRow>[] = [
  { key: 'reference', header: 'Reference', render: (row) => row.reference },
  { key: 'pair', header: 'Corridor', render: (row) => row.pair },
  {
    key: 'state',
    header: 'Leg state',
    render: (row) => (
      <StatusChip
        label={row.legState}
        tone={
          row.legState === 'PAYOUT_FAILED' || row.legState === 'PROVISION_FAILED'
            ? 'error'
            : row.legState === 'PAID_OUT'
              ? 'success'
              : 'neutral'
        }
      />
    ),
  },
  {
    key: 'amount',
    header: 'Amount',
    numeric: true,
    render: (row) => (
      <Amount minor={row.amountMinor} currency={row.currency} scale={row.scale} />
    ),
  },
];

export default function OverviewPage(): ReactElement {
  return (
    <AppShell>
      <h1 style={{ margin: 0 }}>Overview</h1>
      <Panel>
        <DataTable
          caption="Settlements"
          columns={columns}
          rows={SETTLEMENT_ROWS}
          emptyTitle="No settlements match your filters"
        />
      </Panel>
    </AppShell>
  );
}
