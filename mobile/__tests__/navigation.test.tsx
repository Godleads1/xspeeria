import { fireEvent, render, screen } from '@testing-library/react-native';

import HomeRoute from '../app/(tabs)/index';
import MarketplaceRoute from '../app/(tabs)/marketplace';
import ProfileRoute from '../app/(tabs)/profile';
import HistoryRoute from '../app/(tabs)/history';
import { Icon } from '../src/components/icons';
import { ComingSoonScreen } from '../src/features/shared/ComingSoonScreen';
import { PlaceholderScreen } from '../src/features/shared/PlaceholderScreen';
import { TABS } from '../src/navigation/tabs';

/** The router is the boundary under test here: assert where a press sends the user. */
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

beforeEach(() => {
  mockPush.mockClear();
});

describe('bottom navigation', () => {
  it('has exactly the five approved destinations in order', async () => {
    expect(TABS.map((t) => t.title)).toEqual([
      'Home',
      'Market',
      'History',
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
  it('names a next action when one is wired, never a dead end', async () => {
    await render(
      <PlaceholderScreen
        testID="probe"
        title="History"
        message="Nothing in progress yet"
        actionLabel="Browse the marketplace"
        onAction={() => {}}
      />,
    );
    expect(screen.getByTestId('probe')).toBeTruthy();
    expect(screen.getByText('Browse the marketplace')).toBeTruthy();
  });

  it('renders no action button when the label has no handler', async () => {
    await render(
      <PlaceholderScreen
        testID="probe"
        title="History"
        message="Nothing in progress yet"
        actionLabel="Browse the marketplace"
      />,
    );
    expect(screen.queryByText('Browse the marketplace')).toBeNull();
  });
});

/**
 * Every action a Phase 1 screen renders must go somewhere real. These press the button
 * a user would press and assert the destination, so a regression to an inert handler
 * fails here rather than in the user's hands.
 */
describe('Phase 1 screen actions', () => {
  it('sends the Home primary action to the Marketplace', async () => {
    await render(<HomeRoute />);
    fireEvent.press(screen.getByTestId('home-primary-action'));
    expect(mockPush).toHaveBeenCalledWith('/marketplace');
  });

  it('leaves the Home notification control disabled while no notification centre exists', async () => {
    await render(<HomeRoute />);
    const bell = screen.getByTestId('home-notifications');
    expect(bell.props.accessibilityState).toEqual({ disabled: true });
    fireEvent.press(bell);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('opens a History row receipt', async () => {
    await render(<HistoryRoute />);
    await fireEvent.press(screen.getByTestId('history-h1'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/history/[id]', params: { id: 'h1' } });
  });

  it('sends the Profile action Home', async () => {
    await render(<ProfileRoute />);
    fireEvent.press(screen.getByText('Back to home'));
    expect(mockPush).toHaveBeenCalledWith('/');
  });

  it('renders the Market tab screen (ADR-005) without invented filter controls', async () => {
    await render(<MarketplaceRoute />);
    expect(screen.getByTestId('marketplace-screen')).toBeTruthy();
    expect(screen.queryByText('Clear filters')).toBeNull();
  });
});

describe('navigation icons', () => {
  it.each(['home', 'market', 'history', 'cards', 'profile'] as const)(
    'renders the %s glyph in both states',
    async (name) => {
      await render(<Icon name={name} color="#001A6E" />);
      expect(screen.getByTestId(`icon-${name}`)).toBeTruthy();
      await render(<Icon name={name} color="#001A6E" filled knockout="#F8F9FD" />);
      expect(screen.getByTestId(`icon-${name}`)).toBeTruthy();
    },
  );
});
