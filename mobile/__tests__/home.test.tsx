import { fireEvent, render, screen } from '@testing-library/react-native';

import { HomeScreen } from '../src/features/home/HomeScreen';
import { isFullyReady } from '../src/features/home/AccountReadiness';
import { orderActivity } from '../src/features/home/ActivityList';
import { formatRate, groupDigits } from '../src/features/home/rate';
import {
  ACTIVITY_ITEMS,
  BEST_RATE,
  MARKET_RATES,
  NO_ACTIVITY,
  READINESS_COMPLETE,
  READINESS_INCOMPLETE,
  type ReadinessDimension,
} from '../src/fixtures';

describe('Account Readiness Region', () => {
  it('renders exactly the three approved dimensions', async () => {
    await render(<HomeScreen dimensions={READINESS_INCOMPLETE} activity={ACTIVITY_ITEMS} />);
    expect(screen.getByTestId('readiness-identity')).toBeTruthy();
    expect(screen.getByTestId('readiness-security')).toBeTruthy();
    expect(screen.getByTestId('readiness-eligibility')).toBeTruthy();
  });

  it('never shows beneficiary, payout or funding readiness on Home', async () => {
    await render(<HomeScreen dimensions={READINESS_INCOMPLETE} activity={ACTIVITY_ITEMS} />);
    for (const forbidden of [/beneficiar/i, /payout readiness/i, /funding readiness/i]) {
      expect(screen.queryByText(forbidden)).toBeNull();
    }
  });

  it('stays expanded while any requirement is outstanding', async () => {
    await render(<HomeScreen dimensions={READINESS_INCOMPLETE} activity={ACTIVITY_ITEMS} />);
    expect(screen.getByTestId('readiness-expanded')).toBeTruthy();
    expect(screen.queryByTestId('readiness-collapsed')).toBeNull();
  });

  it('collapses to a compact confirmation once all three are satisfied', async () => {
    await render(<HomeScreen dimensions={READINESS_COMPLETE} activity={ACTIVITY_ITEMS} />);
    expect(screen.getByTestId('readiness-collapsed')).toBeTruthy();
    expect(screen.queryByTestId('readiness-expanded')).toBeNull();
    expect(screen.queryByTestId('readiness-identity')).toBeNull();
  });

  it('computes readiness only when every dimension is complete', async () => {
    expect(isFullyReady(READINESS_COMPLETE)).toBe(true);
    expect(isFullyReady(READINESS_INCOMPLETE)).toBe(false);
    expect(isFullyReady([])).toBe(false);
  });

  /**
   * The collapsed region claims identity and security are verified. A payload that
   * never mentions a dimension has not verified it, so anything short of all three
   * present exactly once must stay expanded.
   */
  describe('requires all three dimensions, once each', () => {
    const complete = (id: ReadinessDimension['id'], label: string): ReadinessDimension => ({
      id,
      label,
      state: 'complete',
      detail: 'Verified',
    });

    const identity = complete('identity', 'Identity');
    const security = complete('security', 'Security');
    const eligibility = complete('eligibility', 'Eligible to transact');

    it('rejects a partial array even when every entry is complete', async () => {
      expect(isFullyReady([identity])).toBe(false);
      expect(isFullyReady([identity, security])).toBe(false);
      expect(isFullyReady([security, eligibility])).toBe(false);
    });

    it('rejects a duplicated dimension standing in for a missing one', async () => {
      expect(isFullyReady([identity, identity, security])).toBe(false);
      expect(isFullyReady([identity, security, security])).toBe(false);
    });

    it('rejects a required dimension replaced by another', async () => {
      expect(isFullyReady([identity, security, complete('identity', 'Identity again')])).toBe(
        false,
      );
    });

    it('rejects extra entries beyond the three approved dimensions', async () => {
      expect(isFullyReady([identity, security, eligibility, identity])).toBe(false);
    });

    it('accepts exactly the three approved dimensions in any order', async () => {
      expect(isFullyReady([eligibility, identity, security])).toBe(true);
    });

    it('still rejects when one of the three is not complete', async () => {
      expect(
        isFullyReady([identity, security, { ...eligibility, state: 'pending' }]),
      ).toBe(false);
    });
  });

  it('keeps the region expanded for a partial payload', async () => {
    await render(
      <HomeScreen
        dimensions={READINESS_COMPLETE.slice(0, 2)}
        activity={ACTIVITY_ITEMS}
      />,
    );
    expect(screen.getByTestId('readiness-expanded')).toBeTruthy();
    expect(screen.queryByTestId('readiness-collapsed')).toBeNull();
  });

  it('conveys each state as text, not colour alone', async () => {
    await render(<HomeScreen dimensions={READINESS_INCOMPLETE} activity={ACTIVITY_ITEMS} />);
    expect(screen.getByText('Action required')).toBeTruthy();
    expect(screen.getAllByText('Complete').length).toBeGreaterThan(0);
    // 'Pending' is also a transaction status chip, so it appears more than once.
    expect(screen.getAllByText('Pending').length).toBeGreaterThan(0);
  });
});

describe('Home structure', () => {
  it('offers the primary action on the best-rate card', async () => {
    const onCreateOffer = jest.fn();
    await render(
      <HomeScreen
        bestRate={BEST_RATE}
        dimensions={READINESS_COMPLETE}
        activity={ACTIVITY_ITEMS}
        onCreateOffer={onCreateOffer}
      />,
    );
    fireEvent.press(screen.getByTestId('home-primary-action'));
    expect(onCreateOffer).toHaveBeenCalledTimes(1);
  });

  it('renders activity as discrete items, each with its own amount', async () => {
    await render(<HomeScreen dimensions={READINESS_COMPLETE} activity={ACTIVITY_ITEMS} />);
    expect(screen.getByTestId('activity-alloc-1')).toBeTruthy();
    expect(screen.getByTestId('activity-offer-1')).toBeTruthy();
    expect(screen.getByTestId('activity-settle-1')).toBeTruthy();
    expect(screen.getByText('450,000.00 NGN')).toBeTruthy();
    expect(screen.getByText('23,000.00 NGN')).toBeTruthy();
    expect(screen.getByText('67,000.00 NGN')).toBeTruthy();
  });

  it('never renders an aggregate of the activity amounts', async () => {
    await render(<HomeScreen dimensions={READINESS_COMPLETE} activity={ACTIVITY_ITEMS} />);
    // 450,000 + 23,000 + 67,000 = 540,000. A hero total is the affordance the product forbids.
    expect(screen.queryByText(/540,?000/)).toBeNull();
  });

  it('surfaces the time-critical item first', async () => {
    const ordered = orderActivity(ACTIVITY_ITEMS);
    expect(ordered[0]?.id).toBe('alloc-1');
  });

  it('names a next action when there is no activity', async () => {
    await render(
      <HomeScreen
        dimensions={READINESS_COMPLETE}
        activity={NO_ACTIVITY}
        onCreateOffer={() => {}}
      />,
    );
    expect(screen.getByText('No active offers')).toBeTruthy();
    expect(screen.getByText('Create your first offer')).toBeTruthy();
  });

  it('offers no empty-activity action when nothing is wired to it', async () => {
    await render(<HomeScreen dimensions={READINESS_COMPLETE} activity={NO_ACTIVITY} />);
    expect(screen.getByText('No active offers')).toBeTruthy();
    expect(screen.queryByText('Create your first offer')).toBeNull();
  });
});

describe('Home header', () => {
  it('reaches notifications from the header, not from the bottom navigation', async () => {
    await render(<HomeScreen dimensions={READINESS_COMPLETE} activity={ACTIVITY_ITEMS} />);
    expect(screen.getByLabelText('Notifications')).toBeTruthy();
  });

  it('summarises readiness as a step count, never as a figure with a currency', async () => {
    await render(<HomeScreen dimensions={READINESS_INCOMPLETE} activity={ACTIVITY_ITEMS} />);
    expect(screen.getByText('1 of 3 complete')).toBeTruthy();
  });
});

describe('Home load states', () => {
  it('renders a loading state', async () => {
    await render(
      <HomeScreen dimensions={READINESS_COMPLETE} activity={ACTIVITY_ITEMS} status="loading" />,
    );
    expect(screen.getByLabelText('Loading your account')).toBeTruthy();
    expect(screen.queryByTestId('activity-list')).toBeNull();
  });

  it('renders an error state with a retry that names the action', async () => {
    await render(
      <HomeScreen dimensions={READINESS_COMPLETE} activity={ACTIVITY_ITEMS} status="error" />,
    );
    expect(screen.getByText('We could not load your account')).toBeTruthy();
    expect(screen.getByTestId('error-retry')).toBeTruthy();
  });
});

describe('Home best-rate card (DEC-008)', () => {
  it('states the rate with both currencies, never as a lone figure', async () => {
    await render(
      <HomeScreen bestRate={BEST_RATE} dimensions={READINESS_COMPLETE} activity={ACTIVITY_ITEMS} />,
    );
    expect(screen.getByText('Best NGN → USD rate today')).toBeTruthy();
    expect(screen.getByText('1 USD = 1,325.00 NGN')).toBeTruthy();
    expect(screen.queryByText('1,325.00')).toBeNull();
    expect(screen.queryByText(/balance/i)).toBeNull();
  });

  it('hides the trade button when nothing is wired to it', async () => {
    await render(
      <HomeScreen bestRate={BEST_RATE} dimensions={READINESS_COMPLETE} activity={ACTIVITY_ITEMS} />,
    );
    expect(screen.queryByTestId('home-primary-action')).toBeNull();
  });
});

describe('Home market rates and transactions (DEC-008)', () => {
  it('lists every corridor with its rate', async () => {
    await render(
      <HomeScreen rates={MARKET_RATES} dimensions={READINESS_COMPLETE} activity={ACTIVITY_ITEMS} />,
    );
    for (const rate of MARKET_RATES) {
      expect(screen.getByTestId(`rate-${rate.id}`)).toBeTruthy();
      expect(screen.getByText(`${rate.base} - ${rate.quote}`)).toBeTruthy();
    }
  });

  it('shows date and status on each transaction and links to History', async () => {
    const onViewAll = jest.fn();
    await render(
      <HomeScreen dimensions={READINESS_COMPLETE} activity={ACTIVITY_ITEMS} onViewAll={onViewAll} />,
    );
    expect(screen.getByText('4:34 AM')).toBeTruthy();
    expect(screen.getByText('Failed')).toBeTruthy();
    expect(screen.getByText('Add your payout account')).toBeTruthy();
    fireEvent.press(screen.getByTestId('home-view-all'));
    expect(onViewAll).toHaveBeenCalledTimes(1);
  });

  it('shows no card purchases while Cards is coming soon', async () => {
    await render(<HomeScreen dimensions={READINESS_COMPLETE} activity={ACTIVITY_ITEMS} />);
    expect(screen.queryByText(/shopping/i)).toBeNull();
  });
});

describe('rate formatting', () => {
  it('groups digits on the string, never via a float', () => {
    expect(groupDigits('1603.78')).toBe('1,603.78');
    expect(groupDigits('1234567')).toBe('1,234,567');
    expect(groupDigits('0.000123')).toBe('0.000123');
    expect(formatRate(BEST_RATE)).toBe('1 USD = 1,325.00 NGN');
  });

  it('rejects anything that is not a plain decimal string', () => {
    for (const bad of ['', '1e3', '-5', '1,000', 'NaN', '1.2.3']) {
      expect(() => groupDigits(bad)).toThrow();
    }
  });
});
