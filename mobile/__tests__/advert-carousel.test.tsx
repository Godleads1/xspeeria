/** ADR-086: the advert carousel on its own (inside the Market screen's scroll view the test
 * renderer doesn't deliver raw touches to the advert). Kept in its own file: a touch leaves
 * React work scheduled on the fake timers that would upset the tests after it. */

import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { AdvertCarousel } from '../src/features/market/AdvertCarousel';

const slide = (n: number) => ({
  id: `ad-${n}`,
  name: `Advert ${n}`,
  link_url: `https://xspeeria.com/${n}`,
  source: { uri: `https://api.test/api/v1/adverts/${n}/image`, headers: {} },
});
const shown = () => screen.getByTestId('market-advert-live').props.accessibilityLabel as string;

describe('advert carousel', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('pauses while the slot is touched', async () => {
    await render(<AdvertCarousel slides={[slide(1), slide(2)]} />);
    fireEvent(screen.getByTestId('market-advert-live'), 'touchStart');
    await act(async () => undefined); // let the pause take effect
    await act(async () => jest.advanceTimersByTime(7000));
    expect(shown()).toBe('Advert 1 of 2: Advert 1'); // would have moved at 5 seconds
  });

});
