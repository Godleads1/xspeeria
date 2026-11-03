/** ADR-067/086: the adverts staff place take turns in the Market slot; only https links open. */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Linking } from 'react-native';

import { advertImageSource, advertsApi, loadForWeb, safeAdvertLink, type ServerAdvert } from '../src/api/advertsApi';
import { MarketScreen } from '../src/features/market/MarketScreen';

const AD: ServerAdvert = {
  id: '88888888-2222-3333-4444-555555555555',
  name: 'Lagos launch',
  link_url: 'https://xspeeria.com/launch',
  width: 1026,
  height: 339,
  image_path: '/api/v1/adverts/88888888-2222-3333-4444-555555555555/image',
};

describe('advert links and pictures', () => {
  it('opens only full https links', () => {
    expect(safeAdvertLink('https://xspeeria.com/launch')).toBe('https://xspeeria.com/launch');
    for (const bad of ['http://x.example', 'javascript:alert(1)', 'xspeeria://pay', 'https://x.example/<b>', null]) {
      expect(safeAdvertLink(bad)).toBeNull();
    }
  });

  it('loads the picture from the server with the token, and only from the advert image path', () => {
    expect(advertImageSource(AD, 'tok', 'https://api.test')).toEqual({
      uri: `https://api.test${AD.image_path}`,
      headers: { Authorization: 'Bearer tok' },
    });
    expect(advertImageSource({ ...AD, image_path: 'https://evil.example/x.png' }, 'tok', 'https://api.test')).toBeNull();
    expect(advertImageSource(AD, 'tok', null)).toBeNull();
  });

  it('asks the server for the adverts taking turns', async () => {
    const body = { rotate_seconds: 5, items: [AD] };
    const fetchImpl = jest.fn(async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;
    expect(await advertsApi.showing('tok', { fetchImpl, baseUrl: 'https://api.test' })).toEqual(body);
    expect((fetchImpl as unknown as jest.Mock).mock.calls[0][0]).toBe('https://api.test/api/v1/adverts/showing');
  });
});

describe('market advert slot', () => {
  it('shows the placeholder when no advert is placed', async () => {
    await render(<MarketScreen onCreate={jest.fn()} />);
    expect(screen.getByTestId('market-advert')).toBeTruthy();
    expect(screen.queryByTestId('market-advert-live')).toBeNull();
  });

  it('shows the placed advert and opens its link when tapped', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await render(
      <MarketScreen
        onCreate={jest.fn()}
        adverts={[{ id: AD.id, name: AD.name, link_url: AD.link_url, source: { uri: `https://api.test${AD.image_path}`, headers: { Authorization: 'Bearer tok' } } }]}
      />,
    );
    fireEvent.press(screen.getByTestId('market-advert-live'));
    expect(open).toHaveBeenCalledWith('https://xspeeria.com/launch');
    open.mockRestore();
  });

  it('does nothing when tapped if the link is not https', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await render(
      <MarketScreen
        onCreate={jest.fn()}
        adverts={[{ id: AD.id, name: AD.name, link_url: 'javascript:alert(1)', source: { uri: 'https://api.test/x', headers: {} } }]}
      />,
    );
    fireEvent.press(screen.getByTestId('market-advert-live'));
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });
});


const slide = (n: number) => ({
  id: `ad-${n}`,
  name: `Advert ${n}`,
  link_url: `https://xspeeria.com/${n}`,
  source: { uri: `https://api.test/api/v1/adverts/${n}/image`, headers: {} },
});
const shown = () => screen.getByTestId('market-advert-live').props.accessibilityLabel as string;

describe('several adverts take turns (ADR-086)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    cleanup(); // unmount while the fake timers are still in place
    act(() => jest.runOnlyPendingTimers()); // let React finish what it scheduled on them
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('slides to the next advert by itself, newest first, round and round', async () => {
    await render(<MarketScreen onCreate={jest.fn()} adverts={[slide(1), slide(2), slide(3)]} advertSeconds={5} />);
    expect(shown()).toBe('Advert 1 of 3: Advert 1');
    expect(screen.getByTestId('advert-dot-0', { includeHiddenElements: true }).props.accessibilityState).toEqual({ selected: true });
    await act(async () => jest.advanceTimersByTime(4900));
    expect(shown()).toBe('Advert 1 of 3: Advert 1'); // not before 5 seconds
    await act(async () => jest.advanceTimersByTime(200));
    expect(shown()).toBe('Advert 2 of 3: Advert 2');
    expect(screen.getByTestId('advert-dot-1', { includeHiddenElements: true }).props.accessibilityState).toEqual({ selected: true });
    await act(async () => jest.advanceTimersByTime(5000));
    expect(shown()).toBe('Advert 3 of 3: Advert 3');
    await act(async () => jest.advanceTimersByTime(5000));
    expect(shown()).toBe('Advert 1 of 3: Advert 1'); // after the last, back to the first
  });

  it('opens the link of the advert showing now', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await render(<MarketScreen onCreate={jest.fn()} adverts={[slide(1), slide(2)]} />);
    await act(async () => jest.advanceTimersByTime(5000));
    fireEvent.press(screen.getByTestId('market-advert-live'));
    expect(open).toHaveBeenCalledWith('https://xspeeria.com/2');
  });

  it('never slides by itself when the phone asks for less motion', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    await render(<MarketScreen onCreate={jest.fn()} adverts={[slide(1), slide(2)]} />);
    await act(async () => jest.advanceTimersByTime(30_000));
    expect(shown()).toBe('Advert 1 of 2: Advert 1');
  });

  it('one advert: no dots and no sliding', async () => {
    await render(<MarketScreen onCreate={jest.fn()} adverts={[slide(1)]} />);
    expect(screen.queryByTestId('advert-dot-0', { includeHiddenElements: true })).toBeNull();
    expect(shown()).toBe('Advert 1');
  });
});

describe('advert picture in the web build', () => {
  const header = { uri: 'http://localhost:8000/api/v1/adverts/00000000-0000-0000-0000-000000000001/image', headers: { Authorization: 'Bearer t' } };

  it('downloads with the token and shows a local copy', async () => {
    const fetchFn = jest.fn(async () => ({ ok: true, blob: async () => new Blob(['x']) })) as unknown as typeof fetch;
    const got = await loadForWeb(header, fetchFn, () => 'blob:local-1');
    expect(fetchFn).toHaveBeenCalledWith(header.uri, { headers: header.headers });
    expect(got).toEqual({ uri: 'blob:local-1', headers: {} });
  });

  it('shows nothing when the download is refused or fails', async () => {
    const refused = jest.fn(async () => ({ ok: false })) as unknown as typeof fetch;
    expect(await loadForWeb(header, refused, () => 'blob:x')).toBeNull();
    const broken = jest.fn(async () => Promise.reject(new Error('offline'))) as unknown as typeof fetch;
    expect(await loadForWeb(header, broken, () => 'blob:x')).toBeNull();
  });
});
