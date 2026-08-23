import { render, screen } from '@testing-library/react-native';

import { ComingSoonScreen } from '../src/features/shared/ComingSoonScreen';
import { PlaceholderScreen } from '../src/features/shared/PlaceholderScreen';
import { TABS } from '../src/navigation/tabs';

describe('bottom navigation', () => {
  it('has exactly the five approved destinations in order', async () => {
    expect(TABS.map((t) => t.title)).toEqual([
      'Home',
      'Marketplace',
      'Track',
      'Cards',
      'Profile',
    ]);
  });

  it('does not make Notifications a bottom-navigation destination', async () => {
    expect(TABS.map((t) => t.title)).not.toContain('Notifications');
  });

  it('carries neither Scan nor Analytics', async () => {
    const titles = TABS.map((t) => t.title);
    expect(titles).not.toContain('Scan');
    expect(titles).not.toContain('Analytics');
  });

  it('marks only Cards as coming soon', async () => {
    expect(TABS.filter((t) => t.comingSoon).map((t) => t.name)).toEqual(['cards']);
  });
});

describe('Cards Coming Soon destination', () => {
  it('renders a real screen rather than a dead tab', async () => {
    await render(<ComingSoonScreen />);
    expect(screen.getByTestId('cards-screen')).toBeTruthy();
    expect(screen.getByTestId('cards-explainer')).toBeTruthy();
    expect(screen.getByText('Coming soon')).toBeTruthy();
  });

  it('exposes no card functionality and no card balance', async () => {
    await render(<ComingSoonScreen />);
    for (const forbidden of [/card number/i, /activate/i, /spend/i, /top up/i]) {
      expect(screen.queryByText(forbidden)).toBeNull();
    }
  });

  it('states plainly that Xspeeria holds no money', async () => {
    await render(<ComingSoonScreen />);
    expect(screen.getByText(/never holds your money/i)).toBeTruthy();
  });
});

describe('placeholder destinations', () => {
  it('always names a next action, never a dead end', async () => {
    await render(
      <PlaceholderScreen
        testID="probe"
        title="Track"
        message="Nothing in progress yet"
        actionLabel="Browse the marketplace"
      />,
    );
    expect(screen.getByTestId('probe')).toBeTruthy();
    expect(screen.getByText('Browse the marketplace')).toBeTruthy();
  });
});
