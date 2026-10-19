import { fireEvent, render, screen } from '@testing-library/react-native';

import HomeRoute from '../app/(app)/(tabs)/index';
import MarketplaceRoute from '../app/(app)/(tabs)/marketplace';
import ProfileRoute from '../app/(app)/(tabs)/profile';
import HistoryRoute from '../app/(app)/(tabs)/history';
import { Icon } from '../src/components/icons';
import { Alert } from 'react-native';

import { CARDS_UNAVAILABLE, CARD_DESIGNS, CardsScreen } from '../src/features/cards/CardsScreen';
import { PlaceholderScreen } from '../src/features/shared/PlaceholderScreen';
import { TABS } from '../src/navigation/tabs';

/** The router is the boundary under test here: assert where a press sends the user. */
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), useFocusEffect: () => undefined }));

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

describe('Cards (ADR-012, exact Figma demo ADR-023)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('renders the Figma layout: three card designs, actions and history, no Create yours', async () => {
    await render(<CardsScreen />);
    expect(screen.getByText('Debit Cards')).toBeTruthy();
    expect(screen.getByTestId('cards-label').props.children.join('')).toBe('USD Card');
    for (const d of CARD_DESIGNS) expect(screen.getByTestId(`card-${d.currency}`)).toBeTruthy();
    for (const t of ['Details', 'Freeze Card', 'More', 'Transaction History']) expect(screen.getByText(t)).toBeTruthy();
    expect(screen.queryByText('Create yours')).toBeNull();
  });

  it('development build: Figma card figures and transactions, each marked Demo', async () => {
    await render(<CardsScreen />);
    expect(screen.getByText('500.08 USD')).toBeTruthy();
    expect(screen.getByText('40.23 EUR')).toBeTruthy();
    expect(screen.getByText('45,783.83 NGN')).toBeTruthy();
    for (const d of CARD_DESIGNS) expect(screen.getByTestId(`card-${d.currency}-badge`)).toBeTruthy();
    for (const t of ['Transfer to Adebayo', 'Airbnb', 'Figma', 'Card funded']) expect(screen.getByText(t)).toBeTruthy();
    expect(screen.getByTestId('cards-tx-c1').props.accessibilityLabel).toMatch(/Demo$/);
    expect(screen.queryByTestId('cards-history-empty')).toBeNull();
  });

  it('every card action says cards are not available yet', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render(<CardsScreen />);
    for (const id of ['cards-details', 'cards-freeze', 'cards-actions-more', 'cards-more']) {
      await fireEvent.press(screen.getByTestId(id));
    }
    expect(alert).toHaveBeenCalledTimes(4);
    for (const call of alert.mock.calls) expect(call).toEqual(['Cards are not available', CARDS_UNAVAILABLE]);
  });

  it('release rendering: no balance, card number, amounts or card transactions', async () => {
    await render(<CardsScreen demoText={null} demoTransactions={[]} />);
    for (const forbidden of [/\d+\.\d{2}\s?(USD|EUR|NGN)/, /[$€₦]\s?\d/, /\b\d{4}\b/, /activate/i, /spend/i, /top up/i, /card funded/i, /^Demo$/]) {
      expect(screen.queryByText(forbidden)).toBeNull();
    }
    expect(screen.getByTestId('cards-history-empty')).toBeTruthy();
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
  it('development build: Home shows the Figma demo balance, rows and no readiness (ADR-023)', async () => {
    await render(<HomeRoute />);
    expect(screen.getByTestId('home-demo-balance')).toBeTruthy();
    expect(screen.getByTestId('home-demo-balance-badge')).toBeTruthy();
    expect(screen.getByText('$500.89')).toBeTruthy();
    expect(screen.getByTestId('home-figma-activity')).toBeTruthy();
    expect(screen.queryByTestId('readiness-expanded')).toBeNull();
    expect(screen.queryByTestId('home-primary-action')).toBeNull();
  });

  it('sends Home "View All" to History', async () => {
    await render(<HomeRoute />);
    await fireEvent.press(screen.getByTestId('home-view-all'));
    expect(mockPush).toHaveBeenCalledWith('/history');
  });

  it('opens the notification centre from the Home bell (ADR-044)', async () => {
    await render(<HomeRoute />);
    const bell = screen.getByTestId('home-notifications');
    expect(bell.props.accessibilityState).toEqual({ disabled: false });
    await fireEvent.press(bell);
    expect(mockPush).toHaveBeenCalledWith('/notifications');
  });

  it('opens a History row receipt', async () => {
    await render(<HistoryRoute />);
    await fireEvent.press(screen.getByTestId('history-h1'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/history/[id]', params: { id: 'h1' } });
  });

  it('opens Account details from the Profile header', async () => {
    await render(<ProfileRoute />);
    await fireEvent.press(screen.getByTestId('profile-account'));
    expect(mockPush).toHaveBeenCalledWith('/profile/account');
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
