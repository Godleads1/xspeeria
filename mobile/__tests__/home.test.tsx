import { render, screen } from '@testing-library/react-native';

import { HomeScreen } from '../src/features/home/HomeScreen';
import { isFullyReady } from '../src/features/home/AccountReadiness';
import { orderActivity } from '../src/features/home/ActivityList';
import {
  ACTIVITY_ITEMS,
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
    expect(screen.getByText('Pending')).toBeTruthy();
  });
});

describe('Home structure', () => {
  it('offers the primary action', async () => {
    await render(<HomeScreen dimensions={READINESS_COMPLETE} activity={ACTIVITY_ITEMS} />);
    expect(screen.getByTestId('home-primary-action')).toBeTruthy();
  });

  it('renders activity as discrete items, each with its own amount', async () => {
    await render(<HomeScreen dimensions={READINESS_COMPLETE} activity={ACTIVITY_ITEMS} />);
    expect(screen.getByTestId('activity-alloc-1')).toBeTruthy();
    expect(screen.getByTestId('activity-offer-1')).toBeTruthy();
    expect(screen.getByTestId('activity-settle-1')).toBeTruthy();
    expect(screen.getByText('1000.00 GBP')).toBeTruthy();
    expect(screen.getByText('2500.00 GBP')).toBeTruthy();
    expect(screen.getByText('750.00 GBP')).toBeTruthy();
  });

  it('never renders an aggregate of the activity amounts', async () => {
    await render(<HomeScreen dimensions={READINESS_COMPLETE} activity={ACTIVITY_ITEMS} />);
    // 1000 + 2500 + 750 = 4250. A hero total is the affordance the product forbids.
    expect(screen.queryByText(/4250/)).toBeNull();
  });

  it('surfaces the time-critical item first', async () => {
    const ordered = orderActivity(ACTIVITY_ITEMS);
    expect(ordered[0]?.id).toBe('alloc-1');
  });

  it('names a next action when there is no activity', async () => {
    await render(<HomeScreen dimensions={READINESS_COMPLETE} activity={NO_ACTIVITY} />);
    expect(screen.getByText('No active offers')).toBeTruthy();
    expect(screen.getByText('Create your first offer')).toBeTruthy();
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
