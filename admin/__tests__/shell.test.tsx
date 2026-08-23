import { render, screen, within } from '@testing-library/react';
import { color } from '@xspeeria/tokens';
import { describe, expect, it } from 'vitest';

import { Amount, EmptyState, ErrorState, LoadingState, StatusChip } from '../components/primitives';
import { AppShell } from '../components/shell/AppShell';
import { DataTable, type Column } from '../components/table/DataTable';
import { NAV_ITEMS, NO_ROWS, SETTLEMENT_ROWS, type SettlementRow } from '../fixtures';

/** jsdom serialises colours as rgb(), so compare tokens in the same form. */
function asRgb(hex: string): string {
  const v = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}

const columns: readonly Column<SettlementRow>[] = [
  { key: 'reference', header: 'Reference', render: (row) => row.reference },
  { key: 'state', header: 'Leg state', render: (row) => <StatusChip label={row.legState} /> },
  {
    key: 'amount',
    header: 'Amount',
    numeric: true,
    render: (row) => <Amount minor={row.amountMinor} currency={row.currency} scale={row.scale} />,
  },
];

describe('AppShell', () => {
  it('renders the shell with its content region', () => {
    render(
      <AppShell>
        <p>Content</p>
      </AppShell>,
    );
    expect(screen.getByText('Content')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('exposes a labelled primary navigation landmark', () => {
    render(<AppShell>{null}</AppShell>);
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(nav).toBeInTheDocument();
    expect(within(nav).getAllByRole('link')).toHaveLength(NAV_ITEMS.length);
  });

  it('renders every navigation destination', () => {
    render(<AppShell>{null}</AppShell>);
    for (const item of NAV_ITEMS) {
      expect(screen.getByTestId(`nav-${item.id}`)).toHaveTextContent(item.label);
    }
  });
});

describe('DataTable', () => {
  it('renders a caption, headers and one row per record', () => {
    render(<DataTable caption="Settlements" columns={columns} rows={SETTLEMENT_ROWS} />);
    expect(screen.getByRole('table')).toHaveAccessibleName('Settlements');
    expect(screen.getAllByRole('columnheader')).toHaveLength(3);
    expect(screen.getAllByRole('row')).toHaveLength(SETTLEMENT_ROWS.length + 1);
  });

  it('right-aligns numeric columns', () => {
    render(<DataTable caption="Settlements" columns={columns} rows={SETTLEMENT_ROWS} />);
    const amountHeader = screen.getByRole('columnheader', { name: 'Amount' });
    expect(amountHeader).toHaveStyle({ textAlign: 'right' });
  });

  it('uses the strong border under the header, not the decorative one', () => {
    render(<DataTable caption="Settlements" columns={columns} rows={SETTLEMENT_ROWS} />);
    const header = screen.getByRole('columnheader', { name: 'Reference' });
    const inline = header.getAttribute('style') ?? '';
    expect(inline).toContain(asRgb(color.border.strong));
    expect(inline).not.toContain(asRgb(color.border.subtle));
  });

  it('names a next action when empty', () => {
    render(
      <DataTable
        caption="Settlements"
        columns={columns}
        rows={NO_ROWS}
        emptyTitle="No settlements match your filters"
      />,
    );
    expect(screen.getByText('No settlements match your filters')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
  });

  it('announces loading', () => {
    render(
      <DataTable caption="Settlements" columns={columns} rows={SETTLEMENT_ROWS} status="loading" />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Loading settlements');
  });

  it('announces errors and offers a retry', () => {
    render(
      <DataTable caption="Settlements" columns={columns} rows={SETTLEMENT_ROWS} status="error" />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load settlements');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('admin primitives', () => {
  it('renders integer minor units exactly', () => {
    render(<Amount minor={100000} currency="GBP" scale={2} />);
    expect(screen.getByText('1000.00 GBP')).toBeInTheDocument();
  });

  it('refuses a float rather than silently rounding it', () => {
    expect(() => render(<Amount minor={10.5} currency="GBP" scale={2} />)).toThrow(
      /integer minor units/,
    );
  });

  it('applies tabular figures to amounts', () => {
    render(<Amount minor={1234} currency="GBP" scale={2} />);
    const inline = screen.getByText('12.34 GBP').getAttribute('style') ?? '';
    expect(inline).toContain('tabular-nums');
    expect(inline).toContain('lining-nums');
  });

  it('carries status as text, not colour alone', () => {
    render(<StatusChip label="FUNDED" tone="success" />);
    expect(screen.getByText('FUNDED')).toBeInTheDocument();
    expect(screen.getByLabelText('Status: FUNDED')).toBeInTheDocument();
  });

  it('uses ADR-001 leg vocabulary verbatim, inventing no state', () => {
    const allowed = new Set([
      'PENDING', 'ESCROW_PROVISIONED', 'FUNDED', 'RELEASE_SENT', 'PAID_OUT',
      'RETURN_SENT', 'RETURNED', 'PROVISION_FAILED', 'PAYOUT_FAILED',
    ]);
    for (const row of SETTLEMENT_ROWS) {
      expect(allowed.has(row.legState)).toBe(true);
    }
  });

  it('exposes loading, empty and error states', () => {
    const { unmount } = render(<LoadingState />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    unmount();
    render(<EmptyState title="Nothing here" actionLabel="Do something" />);
    expect(screen.getByRole('button', { name: 'Do something' })).toBeInTheDocument();
    render(<ErrorState title="Broken" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Broken');
  });
});
