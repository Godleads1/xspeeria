/** ADR-067: the advert staff place shows in the Market slot; only https links open. */

import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { advertImageSource, advertsApi, safeAdvertLink, type ServerAdvert } from '../src/api/advertsApi';
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

  it('asks the server for the current advert', async () => {
    const fetchImpl = jest.fn(async () => new Response(JSON.stringify(AD), { status: 200 })) as unknown as typeof fetch;
    expect(await advertsApi.current('tok', { fetchImpl, baseUrl: 'https://api.test' })).toEqual(AD);
    expect((fetchImpl as unknown as jest.Mock).mock.calls[0][0]).toBe('https://api.test/api/v1/adverts/current');
  });
});

describe('market advert slot', () => {
  it('shows the placeholder when no advert is placed', async () => {
    await render(<MarketScreen onCreate={jest.fn()} />);
    expect(screen.getByTestId('market-advert')).toBeTruthy();
    expect(screen.queryByTestId('market-advert-live')).toBeNull();
  });

  it('shows the placed advert and opens its link when tapped', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await render(
      <MarketScreen
        onCreate={jest.fn()}
        advert={{ name: AD.name, link_url: AD.link_url, source: { uri: `https://api.test${AD.image_path}`, headers: { Authorization: 'Bearer tok' } } }}
      />,
    );
    fireEvent.press(screen.getByTestId('market-advert-live'));
    expect(open).toHaveBeenCalledWith('https://xspeeria.com/launch');
    open.mockRestore();
  });

  it('does nothing when tapped if the link is not https', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await render(
      <MarketScreen
        onCreate={jest.fn()}
        advert={{ name: AD.name, link_url: 'javascript:alert(1)', source: { uri: 'https://api.test/x', headers: {} } }}
      />,
    );
    fireEvent.press(screen.getByTestId('market-advert-live'));
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });
});
