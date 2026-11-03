/** Advert Placement Setup (ADR-067): the slot's shape, the list, switch on/off, no audience. */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { AdvertsScreen, fitsSlot } from '../components/screens/AdvertsScreen';
import { type AdvertPage, makeAdminApi, type Advert, type AdminApi, type Me } from '../lib/api';
import { SessionProvider } from '../lib/session';

function me(permissions: string[]): Me {
  return {
    id: 's-1', email: 'boss@xspeeria.test', name: 'Boss', role_id: 'r', role: 'super_admin', status: 'active', phone: null,
    has_photo: false, password_set: true, last_login_at: null, created_at: '2026-10-01T00:00:00Z', permissions,
  };
}
const BOSS = me(['adverts.read', 'adverts.create', 'adverts.update']);

const AD: Advert = {
  id: '88888888-2222-3333-4444-555555555555', name: 'Lagos launch', width: 1026, height: 339,
  starts_at: '2026-10-18T00:00:00Z', ends_at: '2026-11-30T00:00:00Z', link_url: 'https://xspeeria.com/launch',
  active: true, state: 'showing', position: 1, created_by: 'Boss', created_at: '2026-10-18T00:00:00Z', updated_at: '2026-10-18T00:00:00Z',
};

function page(items: Advert[]): AdvertPage {
  const showing = items.filter((a) => a.state === 'showing').map((a) => a.id);
  return {
    now: '2026-10-26T12:00:00Z', total: items.length, showing_id: showing[0] ?? null, showing_ids: showing,
    rotate_seconds: 5, max_showing: 10, slot: { width: 342, height: 113 }, items,
  };
}

function mount(who: Me, over: Partial<AdminApi> = {}): AdminApi {
  const api: AdminApi = {
    ...makeAdminApi(vi.fn()),
    me: vi.fn(async () => who),
    listAdverts: vi.fn(async () => page([AD])),
    changeAdvert: vi.fn(async () => undefined),
    advertImageUrl: vi.fn(async () => null),
    ...over,
  };
  render(<SessionProvider api={api} onSignedOut={() => undefined}>{(<AdvertsScreen />) as ReactElement}</SessionProvider>);
  return api;
}

describe('advert slot', () => {
  it('accepts the slot size and its multiples, refuses other shapes and small pictures', () => {
    expect(fitsSlot(342, 113)).toBe(true);
    expect(fitsSlot(1026, 339)).toBe(true);
    expect(fitsSlot(1080, 1080)).toBe(false);
    expect(fitsSlot(300, 99)).toBe(false);
    expect(fitsSlot(1200, 300)).toBe(false);
  });
});

describe('advert placement setup', () => {
  it('says which advert everyone sees now', async () => {
    mount(BOSS);
    expect(await screen.findByText('Showing now')).toBeInTheDocument();
    expect(screen.getByTestId('showing-now')).toHaveTextContent('Everyone using the app sees “Lagos launch”');
  });

  it('shows that several adverts take turns, and each one\'s turn (ADR-086)', async () => {
    const second: Advert = { ...AD, id: '99999999-2222-3333-4444-555555555555', name: 'Promo', position: 2 };
    const waiting: Advert = { ...AD, id: '77777777-2222-3333-4444-555555555555', name: 'Old', state: 'covered', position: null };
    mount(BOSS, { listAdverts: vi.fn(async () => page([AD, second, waiting])) });
    await waitFor(() =>
      expect(screen.getByTestId('showing-now')).toHaveTextContent('2 adverts take turns on the Market screen, newest first; each stays 5 seconds'),
    );
    expect(screen.getByTestId(`turn-${AD.id}`)).toHaveTextContent('1 of 2');
    expect(screen.getByTestId(`turn-${second.id}`)).toHaveTextContent('2 of 2');
    expect(screen.queryByTestId(`turn-${waiting.id}`)).toBeNull();
    expect(screen.getByText('Waiting for a free place')).toBeInTheDocument();
  });

  it('switches an advert off', async () => {
    const api = mount(BOSS);
    fireEvent.click(await screen.findByTestId(`menu-${AD.id}`));
    fireEvent.click(screen.getByTestId(`toggle-${AD.id}`));
    await waitFor(() => expect(api.changeAdvert).toHaveBeenCalledWith(AD.id, { active: false }));
  });

  it('a new advert needs a picture and an https link; there is no audience to pick', async () => {
    mount(BOSS);
    fireEvent.click(await screen.findByTestId('add-advert'));
    fireEvent.change(screen.getByTestId('advert-name'), { target: { value: 'Promo' } });
    fireEvent.change(screen.getByTestId('advert-start'), { target: { value: '2026-10-27T09:00' } });
    fireEvent.change(screen.getByTestId('advert-end'), { target: { value: '2026-11-27T09:00' } });
    expect(screen.getByTestId('advert-save')).toBeDisabled(); // no picture yet
    fireEvent.change(screen.getByTestId('advert-url'), { target: { value: 'http://plain.example' } });
    expect(screen.getByText('The link must be a full https:// address.')).toBeInTheDocument();
    expect(screen.queryByText(/audience/i)).toBeNull();
  });

  it('read-only staff see no buttons', async () => {
    mount(me(['adverts.read']));
    await screen.findByTestId('showing-now');
    expect(screen.queryByTestId('add-advert')).toBeNull();
    expect(screen.queryByTestId(`menu-${AD.id}`)).toBeNull();
  });
});
