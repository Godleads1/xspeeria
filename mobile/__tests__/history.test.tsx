import { fireEvent, render, screen } from '@testing-library/react-native';

import { COORDINATION_FEE_KOBO, HISTORY, displayDate, filterHistory, parseDisplayDate } from '../src/features/history/data';
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

  it('payout splits add up to the traded amount on every completed trade', () => {
    for (const h of HISTORY.filter((x) => x.status === 'completed')) {
      const sum = h.payouts.reduce((a, p) => a + p.amountMinor, 0);
      expect(sum).toBe(h.amountMinor);
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

  it('filters by date and flags a reversed range', async () => {
    await render(<HistoryScreen />);
    await fireEvent.changeText(screen.getByTestId('history-start'), '10052025');
    await fireEvent.changeText(screen.getByTestId('history-end'), '12052025');
    expect(screen.queryByTestId('history-h5')).toBeNull();
    expect(screen.getByTestId('history-h1')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('history-end'), '01052025');
    expect(screen.getByTestId('history-date-error')).toBeTruthy();
  });
});

describe('Receipt (Figma 344:6152)', () => {
  it('adds up: 500 USD at 1,257 = 628,500 NGN, plus the flat fee', async () => {
    await render(<ReceiptScreen item={h1} onClose={jest.fn()} />);
    expect(screen.getByText('TRANSACTION SUCCESSFUL')).toBeTruthy();
    expect(screen.getByText('628,500.00 NGN')).toBeTruthy();
    expect(screen.getByText('375.00 NGN')).toBeTruthy();
    expect(screen.getByText('628,875.00 NGN')).toBeTruthy();
    expect(COORDINATION_FEE_KOBO).toBe(37500);
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
