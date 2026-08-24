import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen, within } from '@testing-library/react';
import { color } from '@xspeeria/tokens';
import { describe, expect, it, vi } from 'vitest';

import { Amount, EmptyState, ErrorState, LoadingState, StatusChip } from '../components/primitives';
import { AppShell } from '../components/shell/AppShell';
import { DataTable, type Column } from '../components/table/DataTable';
import {
  NAV_ITEMS,
  NO_ROWS,
  PLANNED_DESTINATIONS,
  SETTLEMENT_ROWS,
  type SettlementRow,
} from '../fixtures';

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

/**
 * Every route the Next app router actually serves: one per `page.tsx` under `app/`.
 * Route groups -- `(name)` directories -- contribute no path segment.
 */
function existingRoutes(dir = join(__dirname, '..', 'app'), prefix = ''): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const segment = /^\(.*\)$/.test(entry.name) ? prefix : `${prefix}/${entry.name}`;
      found.push(...existingRoutes(join(dir, entry.name), segment));
    } else if (/^page\.(tsx|ts|jsx|js)$/.test(entry.name)) {
      found.push(prefix === '' ? '/' : prefix);
    }
  }
  return found;
}

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

  /**
   * The route set is read off the filesystem rather than restated here, so the test
   * keeps telling the truth as pages are added. A rendered link to a route with no
   * `page.tsx` is a 404 the operator finds instead of the test.
   */
  it('renders no link to a route that does not exist', () => {
    render(<AppShell>{null}</AppShell>);
    const routes = existingRoutes();
    expect(routes).toContain('/');
    for (const link of within(screen.getByRole('navigation', { name: 'Primary' })).getAllByRole(
      'link',
    )) {
      expect(routes).toContain(link.getAttribute('href'));
    }
  });

  it('does not render the destinations that have no page yet', () => {
    render(<AppShell>{null}</AppShell>);
    for (const planned of PLANNED_DESTINATIONS) {
      expect(screen.queryByTestId(`nav-${planned.id}`)).toBeNull();
    }
  });

  it('keeps every planned destination out of the rendered navigation set', () => {
    const rendered = new Set(NAV_ITEMS.map((item) => item.href));
    for (const planned of PLANNED_DESTINATIONS) {
      expect(rendered.has(planned.href)).toBe(false);
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

  it('names a next action when empty and something is wired to it', () => {
    render(
      <DataTable
        caption="Settlements"
        columns={columns}
        rows={NO_ROWS}
        emptyTitle="No settlements match your filters"
        emptyActionLabel="Clear filters"
        onEmptyAction={() => {}}
      />,
    );
    expect(screen.getByText('No settlements match your filters')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
  });

  it('renders no empty-state action when nothing is wired to it', () => {
    render(
      <DataTable caption="Settlements" columns={columns} rows={NO_ROWS} emptyTitle="Nothing yet" />,
    );
    expect(screen.getByText('Nothing yet')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('announces loading', () => {
    render(
      <DataTable caption="Settlements" columns={columns} rows={SETTLEMENT_ROWS} status="loading" />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Loading settlements');
  });

  it('announces errors and offers a retry when one is wired', () => {
    render(
      <DataTable
        caption="Settlements"
        columns={columns}
        rows={SETTLEMENT_ROWS}
        status="error"
        onRetry={() => {}}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load settlements');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('announces errors without a retry control when nothing can retry', () => {
    render(
      <DataTable caption="Settlements" columns={columns} rows={SETTLEMENT_ROWS} status="error" />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load settlements');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
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
    render(<EmptyState title="Nothing here" actionLabel="Do something" onAction={() => {}} />);
    expect(screen.getByRole('button', { name: 'Do something' })).toBeInTheDocument();
    render(<ErrorState title="Broken" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Broken');
  });

  /**
   * The admin console is an operator surface: a control that looks available and does
   * nothing is read as having acted. No enabled control may exist without a handler.
   */
  it('renders no action control anywhere without a handler behind it', () => {
    const { unmount } = render(<EmptyState title="Nothing here" actionLabel="Do something" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    unmount();
    render(<ErrorState title="Broken" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('fires the handlers it is given', async () => {
    const onAction = vi.fn();
    const onRetry = vi.fn();
    const { unmount } = render(
      <EmptyState title="Nothing here" actionLabel="Do something" onAction={onAction} />,
    );
    (await screen.findByRole('button', { name: 'Do something' })).click();
    expect(onAction).toHaveBeenCalledTimes(1);
    unmount();
    render(<ErrorState title="Broken" onRetry={onRetry} />);
    (await screen.findByRole('button', { name: 'Try again' })).click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
