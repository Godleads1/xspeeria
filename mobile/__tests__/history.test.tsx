import { quoteMinor } from '../src/features/market/money';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { COORDINATION_FEE_BPS, HISTORY, displayDate, filterHistory, parseDisplayDate } from '../src/features/history/data';
import { HistoryScreen } from '../src/features/history/HistoryScreen';
import { ReceiptScreen } from '../src/features/history/ReceiptScreen';

const h1 = HISTORY.find((h) => h.id === 'h1')!;

describe('history data', () => {
  it('formats and parses Figma dates (DD/MM/YYYY) without floats', () => {
    expect(displayDate('2025-05-12')).toBe('12/05/2025');
    expect(parseDisplayDate('12/05/2025')).toBe('2025-05-12');
    expect(parseDisplayDate('29/02/2024')).toBe('2024-02-29');
    for (const bad of ['29/02/2025', '31/04/2025', '00/01/2025', '12/13/2025', '1/5/2025', 'abc']) {
      expect(parseDisplayDate(bad)).toBeNull();
    }
  });

  it('filters by an inclusive date range, newest first', () => {
    const list = filterHistory(HISTORY, '2025-05-08', '2025-05-12');
    expect(list.map((h) => h.date)).toEqual(['2025-05-12', '2025-05-12', '2025-05-10', '2025-05-08']);
  });

  it('payout splits add up to what was received on every completed trade', () => {
    // Buyers receive the foreign currency; sellers receive NGN (ADR-015).
    for (const h of HISTORY.filter((x) => x.status === 'completed')) {
      const sum = h.payouts.reduce((a, p) => a + p.amountMinor, 0);
      expect(sum).toBe(h.side === 'buy' ? h.amountMinor : quoteMinor(h.amountMinor, h.rateMilli));
    }
  });

  it('never stores a full account number', () => {
    for (const h of HISTORY) for (const p of h.payouts) expect(p.last4).toMatch(/^\d{4}$/);
  });
});

describe('History screen (Figma 342:6121)', () => {
  it('lists trades in Figma wording', async () => {
    await render(<HistoryScreen />);
    expect(screen.getByText('Transaction History')).toBeTruthy();
    expect(screen.getAllByText(/You bought/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Rate - NGN 1,257/USD').length).toBeGreaterThan(0);
  });

  it('opens a receipt on tap', async () => {
    const onOpen = jest.fn();
    await render(<HistoryScreen onOpen={onOpen} />);
    await fireEvent.press(screen.getByTestId('history-h3'));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'h3' }));
  });

  it('filters by dates picked on the calendar', async () => {
    await render(<HistoryScreen />);
    await fireEvent.press(screen.getByTestId('history-start'));
    // Opens on the newest trade's month (May 2025).
    expect(screen.getByText('May 2025')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('history-calendar-day-2025-05-10'));
    await fireEvent.press(screen.getByTestId('history-end'));
    await fireEvent.press(screen.getByTestId('history-calendar-day-2025-05-12'));
    expect(screen.queryByTestId('history-h5')).toBeNull();
    expect(screen.getByTestId('history-h1')).toBeTruthy();
    expect(screen.getByLabelText('Start date: 10/05/2025. Change')).toBeTruthy();
  });

  it('never lets the end date fall before the start date', async () => {
    await render(<HistoryScreen />);
    await fireEvent.press(screen.getByTestId('history-start'));
    await fireEvent.press(screen.getByTestId('history-calendar-day-2025-05-10'));
    await fireEvent.press(screen.getByTestId('history-end'));
    const early = screen.getByTestId('history-calendar-day-2025-05-09');
    expect(early.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
  });

  it('moves between months and can clear a date', async () => {
    await render(<HistoryScreen />);
    await fireEvent.press(screen.getByTestId('history-start'));
    await fireEvent.press(screen.getByTestId('history-calendar-next'));
    expect(screen.getByText('June 2025')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('history-calendar-prev-year'));
    expect(screen.getByText('June 2024')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('history-calendar-day-2024-06-01'));
    await fireEvent.press(screen.getByTestId('history-start'));
    await fireEvent.press(screen.getByTestId('history-calendar-clear'));
    expect(screen.getByText('Start date')).toBeTruthy();
  });
});

describe('Receipt (Figma 344:6152)', () => {
  it('adds up: 500 USD at 1,257 = 628,500 NGN, plus the 1% fee (ADR-021)', async () => {
    await render(<ReceiptScreen item={h1} onClose={jest.fn()} />);
    expect(screen.getByText('TRANSACTION SUCCESSFUL')).toBeTruthy();
    expect(screen.getByText('628,500.00 NGN')).toBeTruthy();
    expect(screen.getByText('Coordination Fee (1%)')).toBeTruthy();
    expect(screen.getByText('6,285.00 NGN')).toBeTruthy();
    expect(screen.getByText('634,785.00 NGN')).toBeTruthy();
    expect(COORDINATION_FEE_BPS).toBe(100);
  });

  it('masks payout accounts to the last four digits', async () => {
    await render(<ReceiptScreen item={h1} onClose={jest.fn()} />);
    expect(screen.getAllByText(/•••• 9633/).length).toBe(2);
    expect(screen.queryByText(/0783989633/)).toBeNull();
  });

  it('closes', async () => {
    const onClose = jest.fn();
    await render(<ReceiptScreen item={h1} onClose={onClose} />);
    await fireEvent.press(screen.getByTestId('receipt-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('History ⋮ menu', () => {
  it('offers Contact support and Download Statement, and no card action', async () => {
    const onMenu = jest.fn();
    await render(<HistoryScreen onMenu={onMenu} />);
    await fireEvent.press(screen.getByTestId('history-more'));
    expect(screen.getByText('Contact support')).toBeTruthy();
    expect(screen.getByText('Download Statement')).toBeTruthy();
    expect(screen.queryByText(/block card/i)).toBeNull();
    await fireEvent.press(screen.getByTestId('history-menu-statement'));
    expect(onMenu).toHaveBeenCalledWith('statement');
  });
});
