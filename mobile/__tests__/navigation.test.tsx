import { fireEvent, render, screen } from '@testing-library/react-native';

import HomeRoute from '../app/(tabs)/index';
import MarketplaceRoute from '../app/(tabs)/marketplace';
import ProfileRoute from '../app/(tabs)/profile';
import HistoryRoute from '../app/(tabs)/history';
import { Icon } from '../src/components/icons';
import { Alert } from 'react-native';

import { CARDS_UNAVAILABLE, CARD_DESIGNS, CardsScreen } from '../src/features/cards/CardsScreen';
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

describe('Cards preview (ADR-012)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('renders the Figma layout: three card designs, actions, Create yours, history', async () => {
    await render(<CardsScreen />);
    expect(screen.getByText('Debit Cards')).toBeTruthy();
    expect(screen.getByTestId('cards-label').props.children.join('')).toBe('USD Card');
    for (const d of CARD_DESIGNS) expect(screen.getByTestId(`card-${d.currency}`)).toBeTruthy();
    for (const t of ['Details', 'Freeze Card', 'More', 'Transaction History']) expect(screen.getByText(t)).toBeTruthy();
    expect(screen.getByText('Create yours')).toBeTruthy();
  });

  it('Create yours says cards are not available yet', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render(<CardsScreen />);
    await fireEvent.press(screen.getByTestId('cards-create'));
    expect(alert).toHaveBeenCalledWith('Cards are not available', CARDS_UNAVAILABLE);
  });

  it('card actions are disabled', async () => {
    await render(<CardsScreen />);
    for (const id of ['cards-details', 'cards-freeze', 'cards-actions-more']) {
      expect(screen.getByTestId(id).props.accessibilityState).toEqual({ disabled: true });
    }
  });

  it('shows no balance, card number, amounts or card transactions', async () => {
    await render(<CardsScreen />);
    for (const forbidden of [/\d+\.\d{2}\s?(USD|EUR|NGN)/, /[$€₦]\s?\d/, /\b\d{4}\b/, /activate/i, /spend/i, /top up/i, /card funded/i]) {
      expect(screen.queryByText(forbidden)).toBeNull();
    }
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
